import { normalizeErrorKey } from '../lib/paths.js'
import { isPlainObject, truncate } from '../lib/utils.js'

/**
 * Resultado normalizado de qualquer adaptador de resposta:
 * {
 *   ok,                // sucesso LÓGICO (HTTP 200 com success:false => ok=false)
 *   status, kind,      // success | accepted | validation | logical | auth | forbidden | csrf | too_large
 *                      // | rate_limited | server | http | html | parse
 *   message, errors,   // errors: { "campo.0.nome": ["msg"] }
 *   generalErrors,     // mensagens sem campo
 *   data, redirect, requestId, job, retryAfter, diagnostic
 * }
 */

export function parseBody(raw) {
    const text = raw.text ?? ''
    const contentType = (raw.headers?.get('content-type') || '').toLowerCase()
    if (raw.status === 204 || text.trim() === '') return { type: 'empty', json: null, text: '', contentType }
    const looksJson = contentType.includes('json') || /^\s*[{[]/.test(text)
    if (looksJson) {
        try {
            return { type: 'json', json: JSON.parse(text), text, contentType }
        } catch (error) {
            return { type: 'invalid-json', json: null, text, contentType, error: error.message }
        }
    }
    if (contentType.includes('html') || /^\s*</.test(text)) return { type: 'html', json: null, text, contentType }
    return { type: 'text', json: null, text, contentType }
}

export function normalizeErrors(source) {
    const errors = {}
    const general = []
    if (Array.isArray(source)) {
        for (const item of source) if (typeof item === 'string' && item) general.push(item)
        return { errors, general }
    }
    if (!isPlainObject(source)) return { errors, general }
    for (const [rawKey, value] of Object.entries(source)) {
        const messages = (Array.isArray(value) ? value : [value]).filter(m => typeof m === 'string' && m.length > 0)
        if (!messages.length) continue
        if (rawKey === '' || rawKey === '_' || rawKey === '_general' || rawKey === '*') {
            general.push(...messages)
            continue
        }
        const key = normalizeErrorKey(rawKey)
        errors[key] = [...(errors[key] || []), ...messages]
    }
    return { errors, general }
}

function retryAfterSeconds(raw) {
    const header = raw.headers?.get('retry-after')
    if (!header) return null
    if (/^\d+$/.test(header.trim())) return Number(header.trim())
    const date = Date.parse(header)
    return Number.isFinite(date) ? Math.max(0, Math.round((date - Date.now()) / 1000)) : null
}

function statusKind(status) {
    if (status === 401) return 'auth'
    if (status === 403) return 'forbidden'
    if (status === 419) return 'csrf'
    if (status === 413) return 'too_large'
    if (status === 422) return 'validation'
    if (status === 429) return 'rate_limited'
    if (status >= 500) return 'server'
    if (status >= 400) return 'http'
    return null
}

function jobFrom(json, status) {
    if (!json || typeof json !== 'object') return null
    const job = isPlainObject(json.job) ? json.job : json
    const id = job.id ?? job.job_id ?? job.jobId ?? json.job_id ?? json.jobId
    if (id == null || (status !== 202 && !json.job)) return null
    return {
        id: String(id),
        statusUrl: job.status_url ?? job.statusUrl ?? null,
        cancelUrl: job.cancel_url ?? job.cancelUrl ?? null,
    }
}

export function defaultResponseAdapter(raw) {
    const body = parseBody(raw)
    const status = raw.status
    const httpOk = status >= 200 && status < 300
    const requestId = raw.headers?.get('x-request-id') || null
    const base = {
        ok: false,
        status,
        kind: null,
        message: null,
        errors: {},
        generalErrors: [],
        data: null,
        redirect: null,
        requestId,
        job: null,
        retryAfter: retryAfterSeconds(raw),
        diagnostic: { contentType: body.contentType, redirected: !!raw.redirected, url: raw.url, bodyType: body.type },
    }

    if (body.type === 'html') {
        const looksLikeLogin = /<input[^>]+type\s*=\s*["']?password/i.test(body.text) || /login|entrar|acesso/i.test(raw.url || '')
        return {
            ...base,
            kind: 'html',
            diagnostic: { ...base.diagnostic, looksLikeLogin, snippet: truncate(body.text.replace(/\s+/g, ' '), 160) },
        }
    }
    if (body.type === 'invalid-json' || body.type === 'text') {
        return {
            ...base,
            kind: statusKind(status) || 'parse',
            diagnostic: { ...base.diagnostic, parseError: body.error || 'Resposta não é JSON.', snippet: truncate(body.text, 160) },
        }
    }
    if (body.type === 'empty') {
        return { ...base, ok: httpOk, kind: httpOk ? 'success' : statusKind(status) }
    }

    const json = body.json
    const isObject = isPlainObject(json)
    const { errors, general } = normalizeErrors(isObject ? json.errors : null)
    const message = isObject ? (typeof json.message === 'string' ? json.message : typeof json.mensagem === 'string' ? json.mensagem : null) : null
    const logical = isObject && typeof json.success === 'boolean' ? json.success : httpOk
    const job = httpOk ? jobFrom(json, status) : null
    let kind
    if (!httpOk) kind = statusKind(status)
    else if (job) kind = 'accepted'
    else if (!logical) kind = Object.keys(errors).length ? 'validation' : 'logical'
    else kind = 'success'

    return {
        ...base,
        ok: httpOk && logical,
        kind,
        message,
        errors,
        generalErrors: general,
        data: isObject && 'data' in json ? json.data : json,
        redirect: isObject ? (json.redirect ?? json.redirect_url ?? null) : null,
        requestId: (isObject && (json.request_id ?? json.requestId)) || requestId,
        job,
    }
}

/** Laravel: 422 { message, errors }, 419 = CSRF expirado. A mensagem genérica em inglês é descartada quando há erros por campo. */
export function laravelResponseAdapter(raw, ctx) {
    const result = defaultResponseAdapter(raw, ctx)
    if (result.kind === 'validation' && Object.keys(result.errors).length) result.message = null
    return result
}

/**
 * Joomla (JResponseJson / Joomla\CMS\Response\JsonResponse):
 * { success, message, messages: { error: [], warning: [] }, data }.
 * Erros por campo, quando existirem, são lidos de data.errors ou errors.
 */
export function joomlaResponseAdapter(raw, ctx) {
    const result = defaultResponseAdapter(raw, ctx)
    const body = parseBody(raw)
    const json = body.type === 'json' && isPlainObject(body.json) ? body.json : null
    if (!json) return result
    if (isPlainObject(json.messages)) {
        for (const level of ['error', 'warning']) {
            const list = json.messages[level]
            if (Array.isArray(list)) result.generalErrors.push(...list.filter(m => typeof m === 'string'))
        }
    }
    if (isPlainObject(json.data) && json.data.errors) {
        const { errors, general } = normalizeErrors(json.data.errors)
        Object.assign(result.errors, errors)
        result.generalErrors.push(...general)
        if (!result.ok && Object.keys(errors).length) result.kind = result.kind === 'logical' ? 'validation' : result.kind
    }
    return result
}
