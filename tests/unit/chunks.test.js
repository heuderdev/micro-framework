import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { webcrypto, createHash } from 'node:crypto'
import { startAlpine, mount, flush, tick, AlpineForm } from './helpers.js'
import chunksPlugin, { ChunkUpload, manifestOf } from '../../src/chunks/index.js'

startAlpine(chunksPlugin)

beforeAll(() => {
    if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true })
})

afterEach(() => {
    AlpineForm.registry.unregister('transport', 'chunk')
    AlpineForm.registry.unregister('transport', 'test')
    localStorage.clear()
})

const json = (status, body, headers = {}) => ({
    status,
    statusText: '',
    url: '',
    redirected: false,
    headers: { get: n => ({ 'content-type': 'application/json', ...headers })[n.toLowerCase()] ?? null },
    text: body === undefined ? '' : JSON.stringify(body),
})

/** Servidor do protocolo em memória (espelha server/src/ChunkStore.php). */
function fakeChunkServer({ failPart = () => null } = {}) {
    const sessions = new Map()
    const log = []
    let seq = 0
    const transport = async request => {
        const url = new URL(request.url, 'http://localhost')
        const path = url.pathname
        log.push(`${request.method} ${path}`)
        if (request.signal?.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError', kind: 'abort' })
        if (request.method === 'POST' && path === '/up') {
            const body = JSON.parse(request.body)
            const id = String(++seq).padStart(32, '0')
            const session = { id, size: body.size, chunkSize: body.chunkSize, totalParts: Math.ceil(body.size / body.chunkSize), parts: new Map(), status: 'open', token: null }
            sessions.set(id, session)
            return json(201, { uploadId: id, chunkSize: session.chunkSize, totalParts: session.totalParts, receivedParts: [] })
        }
        const m = /^\/up\/(\w+)(?:\/(parts)\/(\d+)|\/(complete))?$/.exec(path)
        const session = m && sessions.get(m[1])
        if (!session) return json(404, { message: 'não encontrada' })
        if (request.method === 'GET') {
            return json(200, { uploadId: session.id, size: session.size, chunkSize: session.chunkSize, totalParts: session.totalParts, status: session.status, token: session.token, receivedParts: Array.from(session.parts.keys()).map(index => ({ index, sha256: session.parts.get(index).sha })) })
        }
        if (request.method === 'DELETE') {
            sessions.delete(session.id)
            return json(204)
        }
        if (m[2] === 'parts') {
            const index = Number(m[3])
            const injected = failPart(index, session)
            if (injected) return injected
            const bytes = new Uint8Array(await request.body.arrayBuffer())
            if (Number(request.headers['X-Chunk-Size']) !== bytes.length) return json(422, { message: 'tamanho' })
            request.onUploadProgress?.({ loaded: Math.floor(bytes.length / 2), total: bytes.length, lengthComputable: true })
            await tick(1)
            if (request.signal?.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError', kind: 'abort' })
            request.onUploadProgress?.({ loaded: bytes.length, total: bytes.length, lengthComputable: true })
            const sha = createHash('sha256').update(bytes).digest('hex')
            if (request.headers['X-Chunk-Sha256'] && request.headers['X-Chunk-Sha256'] !== sha) return json(422, { message: 'checksum' })
            const existing = session.parts.get(index)
            if (existing && existing.sha !== sha) return json(409, { message: 'conflito' })
            session.parts.set(index, { sha, bytes })
            return json(200, { index, received: session.parts.size, sha256: sha })
        }
        if (m[4] === 'complete') {
            if (session.parts.size !== session.totalParts) return json(409, { message: 'faltam partes' })
            const hashes = Array.from({ length: session.totalParts }, (_, i) => session.parts.get(i).sha)
            const manifest = createHash('sha256').update(Buffer.concat(hashes.map(h => Buffer.from(h, 'hex')))).digest('hex')
            const body = JSON.parse(request.body)
            if (body.manifest && body.manifest !== manifest) return json(422, { message: 'manifesto' })
            session.status = 'completed'
            session.token = session.token || `tok${session.id}`
            return json(200, { status: 'completed', token: session.token, size: session.size })
        }
        return json(404, {})
    }
    return { transport, sessions, log }
}

const makeFile = (size, name = 'f.bin', lastModified = 1000) => new File([new Uint8Array(size).map((_, i) => i % 251)], name, { lastModified })

function upload(server, file, options = {}) {
    const snapshots = []
    const u = new ChunkUpload({ file, endpoint: '/up', chunkSize: 1024, concurrency: 2, retries: 3, transport: server.transport, random: () => 0, onChange: up => snapshots.push(up.loaded), ...options })
    return { u, snapshots }
}

describe('ChunkUpload', () => {
    it('envia partes com concorrência limitada, verifica manifesto e devolve token', async () => {
        const server = fakeChunkServer()
        const { u, snapshots } = upload(server, makeFile(5000))
        const token = await u.start(new AbortController().signal)
        expect(token).toMatch(/^tok/)
        expect(server.log.filter(l => l.startsWith('PUT'))).toHaveLength(5)
        expect(Math.max(...snapshots)).toBeLessThanOrEqual(5000)
        expect(u.loaded).toBe(5000)
        const hashes = Array.from({ length: 5 }, (_, i) => [...server.sessions.values()][0].parts.get(i).sha)
        expect(await manifestOf(hashes)).toMatch(/^[a-f0-9]{64}$/)
    })

    it('retry com backoff em 503 sem dupla contagem de bytes', async () => {
        let failures = 0
        const server = fakeChunkServer({ failPart: index => (index === 1 && failures++ < 2 ? json(503, {}, { 'retry-after': '0' }) : null) })
        const { u, snapshots } = upload(server, makeFile(3000))
        await u.start(new AbortController().signal)
        expect(server.log.filter(l => l === 'PUT /up/' + u.uploadId + '/parts/1')).toHaveLength(3)
        expect(snapshots.every(v => v <= 3000)).toBe(true)
        expect(u.confirmedBytes).toBe(3000)
    })

    it('conflito (409) não é repetido e falha o upload', async () => {
        const server = fakeChunkServer({ failPart: index => (index === 0 ? json(409, { message: 'Parte já recebida com conteúdo diferente.' }) : null) })
        const { u } = upload(server, makeFile(2000))
        await expect(u.start(new AbortController().signal)).rejects.toThrow(/conteúdo diferente/)
        expect(u.status).toBe('failed')
        expect(server.log.filter(l => l.endsWith('/parts/0'))).toHaveLength(1)
    })

    it('pausa aborta partes em voo e retomada sincroniza com o servidor', async () => {
        const server = fakeChunkServer()
        const { u } = upload(server, makeFile(8000), { concurrency: 1 })
        const running = u.start(new AbortController().signal)
        while (u.received.size < 2) await tick(1)
        expect(u.pause()).toBe(true)
        const putsAtPause = server.log.filter(l => l.startsWith('PUT')).length
        await tick(20)
        expect(server.log.filter(l => l.startsWith('PUT')).length).toBe(putsAtPause)
        expect(u.status).toBe('paused')
        await u.resume(new AbortController().signal)
        expect(server.log.at(-1)).toMatch(/^PUT|^GET/)
        await running
        expect(u.status).toBe('completed')
        expect(server.log.some(l => l.startsWith('GET'))).toBe(true)
    })

    it('retomada após recarga: metadados persistidos e somente partes faltantes', async () => {
        const server = fakeChunkServer({ failPart: index => (index === 3 ? json(500, {}) : null) })
        const file = makeFile(5000, 'grande.bin', 42)
        const first = upload(server, file, { persist: true, retries: 0, concurrency: 1 })
        await expect(first.u.start(new AbortController().signal)).rejects.toThrow()
        expect(Object.keys(localStorage).some(k => k.startsWith('alpineform:chunk:/up:'))).toBe(true)
        const stored = JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]))
        expect(Object.keys(stored).sort()).toEqual(['chunkSize', 'lastModified', 'name', 'savedAt', 'size', 'uploadId'])

        const healthy = fakeChunkServer()
        healthy.sessions.set(stored.uploadId, server.sessions.get(stored.uploadId))
        const second = upload(healthy, makeFile(5000, 'grande.bin', 42), { persist: true })
        const token = await second.u.start(new AbortController().signal)
        expect(token).toBeTruthy()
        expect(second.u.resumed).toBe(true)
        expect(healthy.log.filter(l => l.startsWith('PUT'))).toHaveLength(2)
        expect(Object.keys(localStorage).filter(k => k.startsWith('alpineform:chunk:'))).toHaveLength(0)
    })

    it('arquivo diferente com mesmo nome não reaproveita a sessão', async () => {
        const server = fakeChunkServer({ failPart: () => json(500, {}) })
        await expect(upload(server, makeFile(3000, 'a.bin', 1), { persist: true, retries: 0 }).u.start(new AbortController().signal)).rejects.toThrow()
        const other = fakeChunkServer()
        const { u } = upload(other, makeFile(3001, 'a.bin', 1), { persist: true })
        await u.start(new AbortController().signal)
        expect(u.resumed).toBe(false)
        expect(other.log[0]).toBe('POST /up')
    })

    it('sessão expirada (410) é recriada uma vez', async () => {
        let expired = false
        const server = fakeChunkServer({
            failPart: (index, session) => {
                if (index === 2 && !expired) {
                    expired = true
                    server.sessions.delete(session.id)
                    return json(410, { message: 'expirada' })
                }
                return null
            },
        })
        const { u } = upload(server, makeFile(4000), { concurrency: 1 })
        await u.start(new AbortController().signal)
        expect(u.restarts).toBe(1)
        expect(server.log.filter(l => l === 'POST /up')).toHaveLength(2)
        expect(u.status).toBe('completed')
    })

    it('falha na finalização mantém status failed e permite nova tentativa', async () => {
        let failComplete = true
        const base = fakeChunkServer()
        const transport = async request => (request.url.endsWith('/complete') && failComplete ? json(500, { message: 'Falha ao finalizar.' }) : base.transport(request))
        const u = new ChunkUpload({ file: makeFile(2000), endpoint: '/up', chunkSize: 1024, transport, random: () => 0 })
        await expect(u.start(new AbortController().signal)).rejects.toThrow(/Falha ao finalizar/)
        expect(u.status).toBe('failed')
        failComplete = false
        expect(await u.start(new AbortController().signal)).toMatch(/^tok/)
        expect(base.log.filter(l => l.startsWith('PUT'))).toHaveLength(2)
    })
})

describe('chunks integrados ao formulário', () => {
    it('envio principal recebe token no lugar do arquivo; progresso agregado; uploads no estado', async () => {
        const server = fakeChunkServer()
        AlpineForm.transport('chunk', server.transport, { replace: true })
        const main = []
        AlpineForm.transport('test', async request => {
            main.push(request)
            request.onUploadComplete?.()
            return json(200, { success: true, message: 'ok' })
        }, { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form action="/doc" method="post" data-form-transport="test" novalidate>
                <input name="titulo" value="t">
                <input type="file" name="arquivo" data-form-chunked data-form-chunk-endpoint="/up" data-form-chunk-size="64KiB" data-form-v="required">
            </form>`)
        const progress = []
        form.addEventListener('form:progress', e => progress.push(e.detail.loaded))
        api.addFiles('arquivo', [makeFile(200 * 1024)])
        const result = await api.submit()
        expect(result.ok).toBe(true)
        expect(main[0].body.get('arquivo')).toMatch(/^tok/)
        expect(progress.at(-1)).toBe(200 * 1024)
        expect(progress.every(v => v <= 200 * 1024)).toBe(true)
        expect(api.uploads.arquivo.status).toBe('completed')
        expect(api.getUploadSession('arquivo')[0].receivedParts).toBe(4)
    })

    it('cancelar durante o upload descarta a sessão no servidor', async () => {
        const server = fakeChunkServer()
        const slow = async request => {
            if (request.method === 'PUT') await tick(30)
            return server.transport(request)
        }
        AlpineForm.transport('chunk', slow, { replace: true })
        const { api } = await mount(`
            <form x-data x-form action="/doc" method="post" novalidate>
                <input type="file" name="arquivo" data-form-chunked data-form-chunk-endpoint="/up" data-form-chunk-size="64KiB">
            </form>`)
        api.addFiles('arquivo', [makeFile(300 * 1024)])
        const pending = api.submit()
        while (!server.log.some(l => l.startsWith('PUT'))) await tick(2)
        api.cancel()
        const result = await pending
        expect(result.reason).toBe('canceled')
        await flush()
        expect(server.log.some(l => l.startsWith('DELETE'))).toBe(true)
    })

    it('atributos de chunk sem o módulo seriam erro de configuração; endpoint obrigatório', async () => {
        const errors = []
        const original = console.error
        console.error = (...a) => errors.push(a.join(' '))
        try {
            const { api } = await mount(`<form x-data x-form novalidate><input type="file" name="a" data-form-chunked><input name="b" data-form-chunked></form>`)
            const result = await api.submit()
            expect(result.ok).toBe(false)
            expect(api.fields.b.configError).toMatch(/só se aplica a input type="file"/)
        } finally {
            console.error = original
        }
    })
})
