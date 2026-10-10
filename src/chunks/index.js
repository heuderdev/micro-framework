import { ConfigError, StateError, OperationalError, AbortError, isAbort } from '../core/errors.js'
import { parseBool, parseInteger } from '../core/config.js'
import { parseSize, formatBytes } from '../lib/size.js'
import { ChunkUpload, listPersisted } from './chunk-upload.js'

export { ChunkUpload, quickFingerprint, manifestOf, sha256Hex, listPersisted } from './chunk-upload.js'

export const CHUNK_ATTRIBUTES = [
    'data-form-chunk-endpoint',
    'data-form-chunk-size',
    'data-form-chunk-concurrency',
    'data-form-chunk-retries',
    'data-form-chunk-persist',
    'data-form-chunk-checksum',
]

const MIN_CHUNK = 64 * 1024
const MAX_CHUNK = 100 * 1024 * 1024

function readChunkConfig(field) {
    const attr = name => field.groupAttribute(name)
    const endpoint = attr('data-form-chunk-endpoint')
    if (!endpoint) throw new ConfigError('data-form-chunked exige data-form-chunk-endpoint.')
    const chunkSize = attr('data-form-chunk-size') ? parseSize(attr('data-form-chunk-size')) : 5 * 1024 * 1024
    if (chunkSize < MIN_CHUNK || chunkSize > MAX_CHUNK) throw new ConfigError(`data-form-chunk-size deve estar entre ${formatBytes(MIN_CHUNK, { binary: true })} e ${formatBytes(MAX_CHUNK, { binary: true })}.`)
    return {
        endpoint,
        chunkSize,
        concurrency: attr('data-form-chunk-concurrency') ? parseInteger(attr('data-form-chunk-concurrency'), 'data-form-chunk-concurrency', { min: 1, max: 6 }) : 3,
        retries: attr('data-form-chunk-retries') ? parseInteger(attr('data-form-chunk-retries'), 'data-form-chunk-retries', { min: 0, max: 10 }) : 5,
        persist: attr('data-form-chunk-persist') !== null ? parseBool(attr('data-form-chunk-persist'), 'data-form-chunk-persist') : false,
        checksum: attr('data-form-chunk-checksum') !== null ? parseBool(attr('data-form-chunk-checksum'), 'data-form-chunk-checksum') : true,
    }
}

/**
 * Extensão de formulário: antes do envio principal, cada arquivo de um campo data-form-chunked é
 * enviado em partes; o envio principal recebe, no lugar do arquivo, o TOKEN devolvido pelo servidor.
 * Upload concluído != operação concluída: o vínculo e o commit acontecem no endpoint do formulário.
 */
class ChunkExtension {
    constructor(controller) {
        this.controller = controller
        this.uploads = new Map()
        this.active = null
    }

    chunkFields() {
        return Array.from(this.controller.fields.values()).filter(f => f.kind === 'file' && f.groupAttribute('data-form-chunked') !== null && !f.disabled)
    }

    uploadFor(field, item, config) {
        const existing = this.uploads.get(item.id)
        if (existing && existing.file === item.file) return existing
        const upload = new ChunkUpload({
            file: item.file,
            endpoint: config.endpoint,
            chunkSize: config.chunkSize,
            concurrency: config.concurrency,
            retries: config.retries,
            persist: config.persist && this.controller.storageAllowed,
            checksum: config.checksum,
            transport: this.controller.transportFor('chunk'),
            headers: url => this.controller.securityHeaders(url),
            onChange: () => this.publish(),
        })
        upload.fieldKey = field.key
        this.uploads.set(item.id, upload)
        return upload
    }

    publish() {
        const state = this.controller.state
        const byField = {}
        for (const upload of this.uploads.values()) {
            if (!byField[upload.fieldKey]) byField[upload.fieldKey] = { status: 'idle', files: [] }
            byField[upload.fieldKey].files.push(upload.snapshot())
        }
        for (const [key, entry] of Object.entries(byField)) {
            const statuses = entry.files.map(f => f.status)
            entry.status = statuses.includes('failed') ? 'failed' : statuses.includes('uploading') ? 'uploading' : statuses.includes('paused') ? 'paused' : statuses.every(s => s === 'completed') ? 'completed' : 'idle'
            const field = this.controller.fields.get(key)
            const config = field ? safeConfig(field) : null
            entry.resumable = config?.persist && this.controller.storageAllowed ? listPersisted(config.endpoint.replace(/\/+$/, '')) : []
        }
        state.uploads = byField
        if (this.active) this.active.report()
    }

    async beforeSend(ctx) {
        const fields = this.chunkFields()
        if (!fields.length) return
        const jobs = []
        for (const field of fields) {
            const config = readChunkConfig(field)
            const items = field.files.newItems()
            const live = new Set(items.map(i => i.id))
            for (const [id, upload] of this.uploads) if (upload.fieldKey === field.key && !live.has(id)) this.uploads.delete(id)
            jobs.push({ field, uploads: items.map(item => this.uploadFor(field, item, config)) })
        }
        const all = jobs.flatMap(j => j.uploads)
        if (!all.length) return
        const total = all.reduce((sum, u) => sum + u.file.size, 0)
        const tracker = this.controller.tracker
        tracker.start()
        ctx.keepProgress = true
        ctx.setPhase('uploading')
        const local = new AbortController()
        const onAbort = () => local.abort()
        ctx.signal.addEventListener('abort', onAbort, { once: true })
        this.active = {
            signal: local.signal,
            report: () => {
                const loaded = all.reduce((sum, u) => sum + u.loaded, 0)
                tracker.update({ loaded, total, lengthComputable: total > 0 })
                ctx.setProgress(tracker.snapshot())
            },
        }
        this.publish()
        try {
            const results = await Promise.all(all.map(upload => upload.start(local.signal)))
            let index = 0
            for (const job of jobs) {
                ctx.replacements.set(job.field, results.slice(index, index + job.uploads.length))
                index += job.uploads.length
            }
            this.active.report()
        } catch (error) {
            local.abort()
            if (ctx.signal.aborted || isAbort(error)) {
                await Promise.all(all.map(u => u.discard()))
                throw new AbortError()
            }
            const failed = all.find(u => u.status === 'failed')
            const name = failed?.file.name ?? ''
            throw new OperationalError(`${this.controller.formMessage('upload.failed', { file: name })} ${error.message}`.trim(), { kind: 'upload-failed', cause: error })
        } finally {
            ctx.signal.removeEventListener('abort', onAbort)
            this.active = null
            this.publish()
        }
    }

    selected(name) {
        if (name == null) return Array.from(this.uploads.values())
        const field = this.controller.resolveField(name)
        if (!field) throw new ConfigError(`Campo "${name}" não encontrado.`)
        return Array.from(this.uploads.values()).filter(u => u.fieldKey === field.key)
    }

    async pauseUpload(name) {
        const paused = this.selected(name).map(u => u.pause()).some(Boolean)
        if (paused && this.controller.state.phase === 'uploading') this.controller.setPhase('paused')
        return paused
    }

    async resumeUpload(name) {
        if (!this.active) throw new StateError('Nenhum upload em andamento para retomar. Envie o formulário novamente para retomar uma sessão salva.')
        const results = await Promise.all(this.selected(name).map(u => u.resume(this.active.signal)))
        const resumed = results.some(Boolean)
        if (resumed && this.controller.state.phase === 'paused') this.controller.setPhase('uploading')
        return resumed
    }

    getUploadSession(name) {
        return this.selected(name).map(u => u.snapshot())
    }

    cancel() {
        return false
    }

    destroy() {
        for (const upload of this.uploads.values()) for (const entry of upload.inflight.values()) entry.controller.abort()
        this.uploads.clear()
    }
}

function safeConfig(field) {
    try {
        return readChunkConfig(field)
    } catch {
        return null
    }
}

/**
 * Módulo opcional de chunks.
 *   ESM:    import chunks from 'alpine-form/chunks'; AlpineForm.use(chunks)
 *   script: <script src="alpine-form-chunks.min.js"></script> (após alpine-form.min.js)
 */
export default function chunksPlugin(AlpineForm) {
    AlpineForm.fieldAttributes(CHUNK_ATTRIBUTES)
    AlpineForm.internals.setChunkService({ readChunkConfig })
    AlpineForm.formHook(controller => new ChunkExtension(controller))
}
