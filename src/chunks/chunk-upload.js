import { OperationalError, AbortError, isAbort } from '../core/errors.js'
import { parseBody } from '../transport/response.js'
import { backoffDelay } from '../transport/retry.js'
import { sleep } from '../lib/utils.js'

/**
 * Protocolo (backend de referência em server/):
 *   POST   {endpoint}                      JSON {name,size,type,lastModified,chunkSize,fingerprint}
 *                                          -> 201 {uploadId, chunkSize, totalParts, expiresAt, receivedParts:[]}
 *   GET    {endpoint}/{id}                 -> {uploadId, size, chunkSize, totalParts, receivedParts, status, expiresAt}
 *   PUT    {endpoint}/{id}/parts/{index}   corpo = bytes da parte; cabeçalhos X-Chunk-Offset, X-Chunk-Size, X-Chunk-Sha256?
 *                                          -> 200 {received}; 409 parte existente com conteúdo diferente; 404/410 sessão inexistente/expirada
 *   POST   {endpoint}/{id}/complete        JSON {manifest?} -> {status:"completed", token, size}
 *   DELETE {endpoint}/{id}                 -> 204
 *
 * Progresso sem dupla contagem: loaded = soma dos tamanhos das partes CONFIRMADAS + bytes em voo
 * de partes ainda não confirmadas. Ao repetir uma parte, seus bytes em voo voltam a zero.
 * Aqui loaded/total são bytes úteis do arquivo (o corpo de cada PUT é a fatia crua, sem multipart).
 */
export class ExpiredSessionError extends OperationalError {
    constructor(message = 'Sessão de upload expirada ou inexistente.') {
        super(message, { kind: 'upload-expired' })
    }
}

export async function sha256Hex(data) {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data
    const digest = await subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return out
}

/** Manifesto = SHA-256 da concatenação binária dos SHA-256 de cada parte, em ordem. */
export async function manifestOf(partHashes) {
    if (partHashes.some(h => !h)) return null
    const joined = new Uint8Array(partHashes.length * 32)
    partHashes.forEach((hex, i) => joined.set(hexToBytes(hex), i * 32))
    return sha256Hex(joined)
}

/**
 * Identificação RÁPIDA do arquivo para retomada (nome, tamanho, data e SHA-256 de 64 KiB do início
 * e do fim). Não é verificação de integridade: a integridade é verificada por parte e pelo manifesto.
 */
export async function quickFingerprint(file) {
    const meta = `${file.name}|${file.size}|${file.lastModified}`
    if (!globalThis.crypto?.subtle) return meta
    const edge = 64 * 1024
    const head = await file.slice(0, Math.min(edge, file.size)).arrayBuffer()
    const tail = file.size > edge ? await file.slice(Math.max(0, file.size - edge)).arrayBuffer() : new ArrayBuffer(0)
    const metaBytes = new TextEncoder().encode(meta)
    const all = new Uint8Array(metaBytes.length + head.byteLength + tail.byteLength)
    all.set(metaBytes, 0)
    all.set(new Uint8Array(head), metaBytes.length)
    all.set(new Uint8Array(tail), metaBytes.length + head.byteLength)
    return sha256Hex(all)
}

const STORAGE_PREFIX = 'alpineform:chunk:'

export function persistedKey(endpoint, fingerprint) {
    return `${STORAGE_PREFIX}${endpoint}:${fingerprint}`
}

function storage() {
    try {
        return globalThis.localStorage || null
    } catch {
        return null
    }
}

export function loadPersisted(endpoint, fingerprint) {
    try {
        const raw = storage()?.getItem(persistedKey(endpoint, fingerprint))
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export function savePersisted(endpoint, fingerprint, record) {
    try {
        storage()?.setItem(persistedKey(endpoint, fingerprint), JSON.stringify(record))
    } catch {
        /* armazenamento indisponível: retomada após recarga fica desativada */
    }
}

export function removePersisted(endpoint, fingerprint) {
    try {
        storage()?.removeItem(persistedKey(endpoint, fingerprint))
    } catch {
        /* ignorado */
    }
}

/** Sessões persistidas de um endpoint (somente metadados não sensíveis). */
export function listPersisted(endpoint) {
    const store = storage()
    if (!store) return []
    const out = []
    for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (!key || !key.startsWith(`${STORAGE_PREFIX}${endpoint}:`)) continue
        try {
            out.push(JSON.parse(store.getItem(key)))
        } catch {
            /* registro corrompido ignorado */
        }
    }
    return out
}

export class ChunkUpload {
    constructor({ file, endpoint, chunkSize, concurrency = 3, retries = 5, checksum = true, persist = false, transport, headers = () => ({}), onChange = () => {}, now = () => Date.now(), random }) {
        this.file = file
        this.endpoint = endpoint.replace(/\/+$/, '')
        this.chunkSize = chunkSize
        this.concurrency = concurrency
        this.retries = retries
        this.checksum = checksum
        this.persist = persist
        this.transport = transport
        this.headers = headers
        this.onChange = onChange
        this.now = now
        this.random = random
        this.status = 'idle'
        this.uploadId = null
        this.totalParts = 0
        this.received = new Map()
        this.partHashes = []
        this.inflight = new Map()
        this.restarts = 0
        this.token = null
        this.error = null
        this.fingerprint = null
        this.resumed = false
        this.pauseGate = null
    }

    get confirmedBytes() {
        let sum = 0
        for (const size of this.received.values()) sum += size
        return sum
    }

    get loaded() {
        let inflight = 0
        for (const [index, entry] of this.inflight) if (!this.received.has(index)) inflight += entry.loaded
        return Math.min(this.file.size, this.confirmedBytes + inflight)
    }

    partRange(index) {
        const start = index * this.chunkSize
        const end = Math.min(this.file.size, start + this.chunkSize)
        return { start, end, size: end - start }
    }

    snapshot() {
        return {
            name: this.file.name,
            size: this.file.size,
            uploadId: this.uploadId,
            status: this.status,
            totalParts: this.totalParts,
            receivedParts: this.received.size,
            loaded: this.loaded,
            resumed: this.resumed,
            error: this.error,
        }
    }

    emit() {
        this.onChange(this)
    }

    async request(method, url, { body = null, headers = {}, signal, onUploadProgress } = {}) {
        const raw = await this.transport({
            url,
            method,
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...this.headers(url), ...headers },
            body,
            credentials: 'same-origin',
            timeout: 120000,
            signal,
            onUploadProgress,
        })
        const parsed = parseBody(raw)
        return { status: raw.status, json: parsed.type === 'json' ? parsed.json : null, raw }
    }

    async createSession(signal) {
        const response = await this.request('POST', this.endpoint, {
            body: JSON.stringify({ name: this.file.name, size: this.file.size, type: this.file.type, lastModified: this.file.lastModified, chunkSize: this.chunkSize, fingerprint: this.fingerprint }),
            headers: { 'Content-Type': 'application/json' },
            signal,
        })
        if (response.status !== 201 && response.status !== 200) throw this.httpError('criar sessão', response)
        this.applySession(response.json)
        this.received.clear()
        this.partHashes = new Array(this.totalParts).fill(null)
        if (this.persist) this.savePersistence()
    }

    applySession(json) {
        if (!json || typeof json.uploadId !== 'string') throw new OperationalError('Resposta de sessão de upload inválida.', { kind: 'upload-contract' })
        this.uploadId = json.uploadId
        if (Number.isInteger(json.chunkSize) && json.chunkSize > 0) this.chunkSize = json.chunkSize
        this.totalParts = Math.max(1, Math.ceil(this.file.size / this.chunkSize))
        if (Number.isInteger(json.totalParts) && json.totalParts !== this.totalParts) {
            throw new OperationalError('Servidor e cliente divergem na quantidade de partes.', { kind: 'upload-contract' })
        }
    }

    savePersistence() {
        savePersisted(this.endpoint, this.fingerprint, {
            uploadId: this.uploadId,
            name: this.file.name,
            size: this.file.size,
            lastModified: this.file.lastModified,
            chunkSize: this.chunkSize,
            savedAt: this.now(),
        })
    }

    /** Sincroniza partes confirmadas com o servidor (fonte de verdade). */
    async syncStatus(signal) {
        const response = await this.request('GET', `${this.endpoint}/${encodeURIComponent(this.uploadId)}`, { signal })
        if (response.status === 404 || response.status === 410) throw new ExpiredSessionError()
        if (response.status !== 200) throw this.httpError('consultar sessão', response)
        const json = response.json
        if (json.size !== this.file.size) throw new ExpiredSessionError('A sessão salva pertence a outro arquivo.')
        this.applySession(json)
        if (json.status === 'completed' && json.token) {
            this.token = json.token
            return 'completed'
        }
        if (json.status !== 'open') throw new ExpiredSessionError()
        this.received.clear()
        this.partHashes = new Array(this.totalParts).fill(null)
        for (const part of json.receivedParts || []) {
            const index = typeof part === 'number' ? part : part.index
            if (!Number.isInteger(index) || index < 0 || index >= this.totalParts) continue
            this.received.set(index, this.partRange(index).size)
            if (part && typeof part === 'object' && typeof part.sha256 === 'string') this.partHashes[index] = part.sha256
        }
        return 'open'
    }

    httpError(action, response) {
        const message = response.json?.message || response.json?.mensagem || `Falha ao ${action} (HTTP ${response.status}).`
        return new OperationalError(message, { kind: response.status === 413 ? 'upload-too-large' : 'upload-http', status: response.status })
    }

    async uploadPart(index, signal) {
        const { start, end, size } = this.partRange(index)
        const blob = this.file.slice(start, end)
        const hash = this.checksum ? await sha256Hex(blob) : null
        let attempt = 0
        for (;;) {
            if (signal.aborted) throw new AbortError()
            /* pausa pedida enquanto o hash era calculado (a parte ainda não estava em voo) */
            if (this.pauseGate) throw new AbortError()
            const controller = new AbortController()
            const onAbort = () => controller.abort()
            signal.addEventListener('abort', onAbort, { once: true })
            this.inflight.set(index, { loaded: 0, controller })
            try {
                const headers = { 'Content-Type': 'application/octet-stream', 'X-Chunk-Offset': String(start), 'X-Chunk-Size': String(size) }
                if (hash) headers['X-Chunk-Sha256'] = hash
                const response = await this.request('PUT', `${this.endpoint}/${encodeURIComponent(this.uploadId)}/parts/${index}`, {
                    body: blob,
                    headers,
                    signal: controller.signal,
                    onUploadProgress: p => {
                        const entry = this.inflight.get(index)
                        if (entry) entry.loaded = Math.min(size, p.loaded)
                        this.emit()
                    },
                })
                if (response.status === 200 || response.status === 201) {
                    this.received.set(index, size)
                    this.partHashes[index] = response.json?.sha256 || hash
                    return
                }
                if (response.status === 404 || response.status === 410) throw new ExpiredSessionError()
                const retryable = response.status === 429 || response.status >= 500 || response.status === 408
                if (!retryable || attempt >= this.retries) throw this.httpError(`enviar parte ${index + 1}`, response)
                const retryAfter = Number(response.raw.headers?.get('retry-after'))
                await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffDelay(attempt, { random: this.random }), signal)
            } catch (error) {
                if (error instanceof ExpiredSessionError) throw error
                if (isAbort(error) || signal.aborted) throw new AbortError()
                if (!(error.kind === 'network' || error.kind === 'timeout') || attempt >= this.retries) throw error
                await sleep(backoffDelay(attempt, { random: this.random }), signal)
            } finally {
                signal.removeEventListener('abort', onAbort)
                this.inflight.delete(index)
                this.emit()
            }
            attempt += 1
        }
    }

    async waitIfPaused(signal) {
        while (this.pauseGate) {
            await Promise.race([
                this.pauseGate.promise,
                new Promise((_, reject) => signal.addEventListener('abort', () => reject(new AbortError()), { once: true })),
            ])
        }
    }

    async runParts(signal) {
        const local = new AbortController()
        const onAbort = () => local.abort()
        signal.addEventListener('abort', onAbort, { once: true })
        const queue = []
        for (let i = 0; i < this.totalParts; i++) if (!this.received.has(i)) queue.push(i)
        const worker = async () => {
            for (;;) {
                await this.waitIfPaused(local.signal)
                const index = queue.shift()
                if (index === undefined) return
                if (this.received.has(index)) continue
                try {
                    await this.uploadPart(index, local.signal)
                } catch (error) {
                    if (isAbort(error) && !local.signal.aborted && this.pauseGate) {
                        queue.unshift(index)
                        continue
                    }
                    throw error
                }
            }
        }
        try {
            await Promise.all(Array.from({ length: Math.min(this.concurrency, Math.max(1, queue.length)) }, () => worker()))
        } catch (error) {
            local.abort()
            throw error
        } finally {
            signal.removeEventListener('abort', onAbort)
        }
    }

    async complete(signal) {
        const manifest = this.checksum ? await manifestOf(this.partHashes) : null
        const response = await this.request('POST', `${this.endpoint}/${encodeURIComponent(this.uploadId)}/complete`, {
            body: JSON.stringify({ manifest }),
            headers: { 'Content-Type': 'application/json' },
            signal,
        })
        if (response.status === 404 || response.status === 410) throw new ExpiredSessionError()
        if (response.status !== 200) throw this.httpError('finalizar upload', response)
        if (!response.json?.token) throw new OperationalError('Finalização sem token de arquivo.', { kind: 'upload-contract' })
        this.token = response.json.token
    }

    /** Executa (ou retoma) o upload. Resolve com o token do arquivo montado no servidor. */
    async start(signal) {
        if (this.token) return this.token
        this.status = 'uploading'
        this.error = null
        this.emit()
        try {
            if (!this.fingerprint) this.fingerprint = await quickFingerprint(this.file)
            if (!this.uploadId && this.persist) {
                const saved = loadPersisted(this.endpoint, this.fingerprint)
                if (saved && saved.size === this.file.size && saved.lastModified === this.file.lastModified) {
                    this.uploadId = saved.uploadId
                    this.chunkSize = saved.chunkSize
                    this.resumed = true
                }
            }
            for (;;) {
                try {
                    if (!this.uploadId) await this.createSession(signal)
                    else if ((await this.syncStatus(signal)) === 'completed') break
                    this.emit()
                    await this.runParts(signal)
                    await this.complete(signal)
                    break
                } catch (error) {
                    if (!(error instanceof ExpiredSessionError) || this.restarts >= 1) throw error
                    this.restarts += 1
                    this.uploadId = null
                    this.resumed = false
                    this.received.clear()
                    if (this.persist) removePersisted(this.endpoint, this.fingerprint)
                }
            }
            this.status = 'completed'
            if (this.persist) removePersisted(this.endpoint, this.fingerprint)
            this.emit()
            return this.token
        } catch (error) {
            this.status = isAbort(error) ? 'canceled' : 'failed'
            this.error = isAbort(error) ? null : error.message
            this.emit()
            throw error
        }
    }

    pause() {
        if (this.status !== 'uploading' || this.pauseGate) return false
        let resolve
        const promise = new Promise(r => {
            resolve = r
        })
        this.pauseGate = { promise, resolve }
        for (const entry of this.inflight.values()) entry.controller.abort()
        this.status = 'paused'
        this.emit()
        return true
    }

    async resume(signal) {
        if (!this.pauseGate) return false
        if (this.uploadId) await this.syncStatus(signal)
        const gate = this.pauseGate
        this.pauseGate = null
        this.status = 'uploading'
        gate.resolve()
        this.emit()
        return true
    }

    /** Cancelamento explícito: interrompe e pede ao servidor para descartar a sessão. */
    async discard() {
        for (const entry of this.inflight.values()) entry.controller.abort()
        if (this.persist && this.fingerprint) removePersisted(this.endpoint, this.fingerprint)
        if (!this.uploadId || this.token) return
        try {
            await this.request('DELETE', `${this.endpoint}/${encodeURIComponent(this.uploadId)}`, {})
        } catch {
            /* melhor esforço: sessões abandonadas expiram e são limpas pelo servidor */
        }
    }
}
