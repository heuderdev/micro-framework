import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { startAlpine, mount, flush, tick, fakeTransport, jsonResponse, textResponse, AlpineForm } from './helpers.js'
import chunksPlugin from '../../src/chunks/index.js'

startAlpine(chunksPlugin)

beforeAll(() => {
    if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true })
})

afterEach(() => {
    AlpineForm.resetConfig()
    for (const name of ['test', 'chunk', 'job']) if (AlpineForm.registry.has('transport', name)) AlpineForm.registry.unregister('transport', name)
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
})

function spyConsole() {
    const calls = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
        vi.spyOn(console, level).mockImplementation((...args) => calls.push([level, ...args]))
    }
    return calls
}

const PAGINA_LOGIN = '<html><body><h1>Entrar</h1><p>Cliente: João da Silva, conta 12345-6</p><input type="password" name="senha"></body></html>'

describe('log: nada no console quando desligado', () => {
    it('padrão: erro HTML é registrado, mas sem o trecho da resposta (que pode conter dados do cliente)', async () => {
        const calls = spyConsole()
        AlpineForm.transport('test', fakeTransport(() => textResponse(200, PAGINA_LOGIN)), { replace: true })
        const { api } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
        const result = await api.submit()
        expect(result.reason).toBe('html')
        expect(calls.length).toBeGreaterThan(0)
        expect(JSON.stringify(calls)).not.toContain('João da Silva')
        expect(api.error.diagnostic.snippet).toContain('João da Silva')
    })

    it('data-form-log="none": erro de rede, resposta HTML, configuração inválida e redirecionamento recusado não chegam ao console', async () => {
        const calls = spyConsole()
        let call = 0
        AlpineForm.transport('test', fakeTransport(() => {
            call += 1
            if (call === 1) throw Object.assign(new Error('caiu'), { kind: 'network' })
            if (call === 2) return textResponse(200, PAGINA_LOGIN)
            return jsonResponse(200, { success: true, redirect: 'https://outro.exemplo/roubo' })
        }), { replace: true })
        const { api } = await mount(`
            <form x-data x-form action="/x" method="post" data-form-transport="test" data-form-log="none" data-form-debug data-form-redirect="response" novalidate>
                <input name="a" value="1">
                <input name="b" data-form-v="requried">
            </form>`)
        expect(api.configErrors.length).toBe(1)
        // a configuração inválida bloquearia o envio: remove o campo e envia três vezes
        document.querySelector('[name=b]').remove()
        await flush()
        await api.submit()
        await api.submit()
        await api.submit()
        expect(call).toBe(3)
        expect(calls).toEqual([])
    })

    it('AlpineForm.configure({ log: "none" }) também silencia avisos fora do formulário', async () => {
        const calls = spyConsole()
        AlpineForm.configure({ log: 'none' })
        document.body.insertAdjacentHTML('beforeend', '<div x-ignore><form x-form id="solto"></form></div>')
        await flush()
        expect(AlpineForm.diagnose().map(f => f.id)).toEqual(['solto'])
        expect(calls).toEqual([])
    })

    it('valor inválido em data-form-log é erro de configuração', async () => {
        spyConsole()
        document.body.insertAdjacentHTML('beforeend', '<div x-data><form x-form data-form-log="silencio" id="f"></form></div>')
        await flush()
        expect(AlpineForm.get('f')).toBeNull()
        expect(document.getElementById('f').getAttribute('data-form-state')).toBe('config-error')
    })
})

describe('storage: nada gravado no navegador quando desligado', () => {
    const json = (status, body) => jsonResponse(status, body)

    function chunkServer() {
        let seq = 0
        return async request => {
            const path = new URL(request.url, 'http://localhost').pathname
            if (request.method === 'POST' && path === '/up') return json(201, { uploadId: String(++seq).padStart(32, '0'), chunkSize: 65536, totalParts: 1, receivedParts: [] })
            if (request.method === 'PUT') return json(200, { received: 1 })
            if (path.endsWith('/complete')) return json(200, { status: 'completed', token: 'tok1', size: 10 })
            return json(404, {})
        }
    }

    it('padrão: data-form-chunk-persist grava metadados no localStorage durante o envio', async () => {
        let durante = null
        const server = chunkServer()
        AlpineForm.transport('chunk', async request => {
            if (request.method === 'PUT') durante = Object.keys(localStorage)
            return server(request)
        }, { replace: true })
        AlpineForm.transport('test', fakeTransport(() => json(200, { success: true })), { replace: true })
        const { api } = await mount(`
            <form x-data x-form action="/x" method="post" data-form-transport="test" novalidate>
                <input type="file" name="arquivo" data-form-chunked data-form-chunk-endpoint="/up" data-form-chunk-size="64KiB" data-form-chunk-persist>
            </form>`)
        api.addFiles('arquivo', [new File(['0123456789'], 'extrato-joao.pdf', { lastModified: 1 })])
        expect((await api.submit()).ok).toBe(true)
        expect(durante.some(k => k.startsWith('alpineform:chunk:'))).toBe(true)
    })

    it('data-form-storage="none": chunk-persist e job-persist não gravam nada', async () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        AlpineForm.transport('chunk', chunkServer(), { replace: true })
        let jobCalls = 0
        AlpineForm.transport('job', async () => {
            jobCalls += 1
            return json(200, { status: jobCalls > 1 ? 'succeeded' : 'processing', progress: 50, result: { ok: 1 } })
        }, { replace: true })
        AlpineForm.transport('test', fakeTransport(() => json(202, { success: true, job: { id: 'j1', status_url: '/jobs/j1' } })), { replace: true })
        const { api } = await mount(`
            <form x-data x-form action="/x" method="post" data-form-transport="test" data-form-storage="none"
                  data-form-job-persist data-form-job-interval="250ms" novalidate>
                <input type="file" name="arquivo" data-form-chunked data-form-chunk-endpoint="/up" data-form-chunk-size="64KiB" data-form-chunk-persist>
            </form>`)
        api.addFiles('arquivo', [new File(['0123456789'], 'extrato-joao.pdf', { lastModified: 1 })])
        const result = await api.submit()
        expect(result.ok).toBe(true)
        expect(api.job.status).toBe('succeeded')
        expect(setItem).not.toHaveBeenCalled()
        expect(localStorage.length).toBe(0)
        expect(sessionStorage.length).toBe(0)
        expect(api.uploads.arquivo.resumable).toEqual([])
    })

    it('AlpineForm.configure({ storage: "none" }) vale para todos os formulários', async () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        AlpineForm.configure({ storage: 'none' })
        AlpineForm.transport('job', async () => json(200, { status: 'succeeded', result: {} }), { replace: true })
        AlpineForm.transport('test', fakeTransport(() => json(202, { job: { id: 'j2', status_url: '/jobs/j2' } })), { replace: true })
        const { api } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" data-form-job-persist data-form-job-interval="250ms" novalidate><input name="a" value="1"></form>`)
        await api.submit()
        await tick(10)
        expect(api.phase).toBe('success')
        expect(setItem).not.toHaveBeenCalled()
    })
})

describe('dados do servidor tratados como não confiáveis', () => {
    it('chave de erro "__proto__" vinda do servidor vai para o resumo e não altera protótipos', async () => {
        spyConsole()
        const body = '{"success":false,"errors":{"__proto__":["poluído"],"constructor.prototype.x":["também"],"a":["erro em a"]}}'
        AlpineForm.transport('test', fakeTransport(() => ({ ...jsonResponse(422, {}), text: body })), { replace: true })
        const { api } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
        await api.submit()
        expect(api.errors.a).toEqual(['erro em a'])
        expect(api.generalErrors).toEqual(expect.arrayContaining(['poluído', 'também']))
        expect(Object.getPrototypeOf(api.errors)).toBe(Object.prototype)
        expect({}.x).toBeUndefined()
        api.setErrors(JSON.parse('{"__proto__":"via setErrors"}'))
        expect(api.generalErrors).toContain('via setErrors')
        expect({}.length).toBeUndefined()
    })

    it('cancel_url de outra origem na resposta 202 é ignorada (como status_url)', async () => {
        spyConsole()
        const jobCalls = []
        AlpineForm.transport('job', async request => {
            jobCalls.push(request)
            return jsonResponse(200, { status: 'processing', progress: 10 })
        }, { replace: true })
        AlpineForm.transport('test', fakeTransport(() => jsonResponse(202, { job: { id: 'j3', status_url: '/jobs/j3', cancel_url: 'https://atacante.exemplo/apagar' } })), { replace: true })
        const { api } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" data-form-job-interval="250ms" novalidate><input name="a" value="1"></form>`)
        api.submit()
        await tick(50)
        expect(api.job.cancelUrl).toBeNull()
        await expect(api.cancelJob()).rejects.toThrow(/cancel_url/)
        expect(jobCalls.every(r => !String(r.url).includes('atacante'))).toBe(true)
        api.cancel()
    })
})
