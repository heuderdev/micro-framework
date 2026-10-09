import { ConfigError, OperationalError, AbortError, isAbort } from './errors.js'
import { parseDuration, parseInteger, parseList, parseBool } from './config.js'
import * as registry from './registry.js'
import { parseBody } from '../transport/response.js'
import { withRetry, RETRYABLE_STATUS } from '../transport/retry.js'
import { isCrossOrigin } from '../transport/xhr.js'
import { isPlainObject } from '../lib/utils.js'

/** Contrato padrão: { "valid": false, "message": "Valor já cadastrado." } */
export function defaultRemoteAdapter(json) {
    if (!isPlainObject(json) || typeof json.valid !== 'boolean') return { valid: null, reason: 'contract' }
    const message = typeof json.message === 'string' ? json.message : typeof json.mensagem === 'string' ? json.mensagem : null
    return { valid: json.valid, message }
}

/**
 * Validação remota de um campo.
 * Executa somente depois que as regras locais passam; respostas são associadas ao valor consultado.
 * Abortos (novo valor digitado, destroy) não viram erro de preenchimento.
 * Falhas de rede/timeout/5xx viram resultado "inconclusivo", tratado pela política do campo.
 */
export class RemoteValidator {
    constructor(field, { config, transport, headersFor }) {
        this.field = field
        this.transport = transport
        this.headersFor = headersFor
        const defaults = config.remote
        const attr = name => field.groupAttribute(name)
        this.url = attr('data-form-remote')
        if (!this.url || !this.url.trim()) throw new ConfigError('data-form-remote não pode ser vazio.')
        const method = (attr('data-form-remote-method') || defaults.method).toLowerCase()
        if (!['get', 'post'].includes(method)) throw new ConfigError(`data-form-remote-method="${method}" inválido. Use get ou post.`)
        this.method = method
        const allowQuery = attr('data-form-remote-allow-query')
        if (method === 'get' && field.sensitive && (allowQuery === null || !parseBool(allowQuery, 'data-form-remote-allow-query'))) {
            throw new ConfigError('Campo sensível com validação remota via GET exporia o valor na URL. Use POST ou declare data-form-remote-allow-query.')
        }
        const debounceAttr = attr('data-form-remote-debounce')
        this.debounce = debounceAttr === null ? defaults.debounce : parseDuration(debounceAttr, 'data-form-remote-debounce', { max: 60000 })
        const timeoutAttr = attr('data-form-remote-timeout')
        this.timeout = timeoutAttr === null ? defaults.timeout : parseDuration(timeoutAttr, 'data-form-remote-timeout', { min: 100, max: 120000 })
        const fieldsAttr = attr('data-form-remote-fields')
        this.extraFields = fieldsAttr ? parseList(fieldsAttr) : []
        this.param = attr('data-form-remote-param') || field.name
        const cacheAttr = attr('data-form-remote-cache')
        this.cacheSize = cacheAttr === null ? defaults.cache : parseInteger(cacheAttr, 'data-form-remote-cache', { min: 0, max: 500 })
        const ttlAttr = attr('data-form-remote-cache-ttl')
        this.cacheTtl = ttlAttr === null ? defaults.cacheTtl : parseDuration(ttlAttr, 'data-form-remote-cache-ttl')
        const inconclusive = (attr('data-form-remote-inconclusive') || defaults.inconclusive).toLowerCase()
        if (!['allow', 'block'].includes(inconclusive)) throw new ConfigError('data-form-remote-inconclusive deve ser "allow" ou "block".')
        this.inconclusivePolicy = inconclusive
        const adapterName = attr('data-form-remote-adapter') || 'default'
        this.adapter = registry.get('remoteAdapter', adapterName)
        if (!this.adapter) throw new ConfigError(`Adaptador remoto "${adapterName}" não registrado.`)
        this.retries = defaults.retries ?? 1
        this.cache = new Map()
        this.now = () => Date.now()
    }

    cacheKey(value, extras) {
        return JSON.stringify([this.method, this.url, value, extras])
    }

    readCache(key) {
        if (this.cacheSize === 0) return null
        const entry = this.cache.get(key)
        if (!entry) return null
        if (this.now() - entry.at > this.cacheTtl) {
            this.cache.delete(key)
            return null
        }
        this.cache.delete(key)
        this.cache.set(key, entry)
        return entry.result
    }

    writeCache(key, result) {
        if (this.cacheSize === 0) return
        this.cache.set(key, { result, at: this.now() })
        while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value)
    }

    clearCache() {
        this.cache.clear()
    }

    invalidate(value, extras) {
        this.cache.delete(this.cacheKey(value, extras))
    }

    buildRequest(value, extras) {
        const params = new URLSearchParams()
        params.append(this.param, value == null ? '' : String(value))
        params.append('_field', this.field.name)
        for (const [name, v] of extras) params.append(name, v == null ? '' : String(v))
        const crossOrigin = isCrossOrigin(this.url)
        const headers = { Accept: 'application/json', ...(crossOrigin ? {} : this.headersFor()) }
        if (this.method === 'get') {
            const url = new URL(this.url, globalThis.location?.href)
            for (const [k, v] of params) url.searchParams.append(k, v)
            return { url: url.href, method: 'GET', headers, body: null }
        }
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
        return { url: this.url, method: 'POST', headers, body: params.toString() }
    }

    /**
     * Retorna { valid: true } | { valid: false, message } | { valid: null, inconclusive: true, reason }.
     * Lança AbortError quando cancelada.
     */
    async validate(value, extras, { signal } = {}) {
        const key = this.cacheKey(value, extras)
        const cached = this.readCache(key)
        if (cached) return { ...cached, cached: true }
        const request = this.buildRequest(value, extras)
        let raw
        try {
            raw = await withRetry(() => this.transport({ ...request, timeout: this.timeout, signal, credentials: 'same-origin' }), {
                retries: this.retries,
                signal,
                shouldRetry: (error, result) => {
                    if (error) return !isAbort(error) && (error.kind === 'network' || error.kind === 'timeout')
                    if (result && RETRYABLE_STATUS.has(result.status)) {
                        const retryAfter = Number(result.headers?.get('retry-after'))
                        return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : true
                    }
                    return false
                },
            })
        } catch (error) {
            if (isAbort(error) || signal?.aborted) throw new AbortError()
            return { valid: null, inconclusive: true, reason: error.kind || 'network' }
        }
        if (raw.status < 200 || raw.status >= 300) return { valid: null, inconclusive: true, reason: `http-${raw.status}` }
        const body = parseBody(raw)
        if (body.type !== 'json') return { valid: null, inconclusive: true, reason: body.type === 'html' ? 'html' : 'contract' }
        let adapted
        try {
            adapted = this.adapter(body.json, raw)
        } catch (error) {
            throw new OperationalError(`Adaptador remoto falhou: ${error.message}`, { kind: 'remote-adapter' })
        }
        if (adapted.valid !== true && adapted.valid !== false) return { valid: null, inconclusive: true, reason: adapted.reason || 'contract' }
        const result = { valid: adapted.valid, message: adapted.message || null }
        this.writeCache(key, result)
        return result
    }
}
