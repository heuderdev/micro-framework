import { OperationalError, AbortError, isAbort } from '../core/errors.js'
import { sleep } from '../lib/utils.js'
import { parseBody } from '../transport/response.js'
import { backoffDelay } from '../transport/retry.js'
import { formId } from '../lib/dom.js'

export const JOB_STATUSES = ['queued', 'processing', 'succeeded', 'failed', 'canceled']
const TERMINAL = new Set(['succeeded', 'failed', 'canceled'])

/**
 * Observa um processamento assíncrono (HTTP 202 + jobId).
 * - Nunca sobrepõe requisições: a próxima consulta só é agendada após a anterior terminar.
 * - Intervalo cresce 1.5x a cada consulta sem mudança, até maxInterval; Retry-After tem prioridade.
 * - Falhas de rede consecutivas são toleradas até maxNetworkFailures.
 * - stop() encerra apenas a OBSERVAÇÃO; o trabalho no servidor continua.
 * - progress só é exposto quando o backend informa um número entre 0 e 100.
 */
export class JobPoller {
    constructor({ job, url, transport, headers = {}, credentials = 'same-origin', interval = 1500, maxInterval = 10000, timeout = 600000, maxNetworkFailures = 5, onUpdate = () => {}, now = () => Date.now() }) {
        this.job = job
        this.url = url
        this.transport = transport
        this.headers = headers
        this.credentials = credentials
        this.interval = interval
        this.maxInterval = maxInterval
        this.timeout = timeout
        this.maxNetworkFailures = maxNetworkFailures
        this.onUpdate = onUpdate
        this.now = now
        this.controller = new AbortController()
        this.inFlight = false
    }

    stop() {
        this.controller.abort(new AbortError('Observação do processamento encerrada.'))
    }

    normalize(json) {
        const status = String(json?.status ?? '').toLowerCase()
        if (!JOB_STATUSES.includes(status)) {
            throw new OperationalError(`Status de processamento desconhecido: "${json?.status}".`, { kind: 'job-contract' })
        }
        const progress = typeof json.progress === 'number' && json.progress >= 0 && json.progress <= 100 ? json.progress : null
        return {
            id: this.job.id,
            status,
            progress,
            message: typeof json.message === 'string' ? json.message : typeof json.mensagem === 'string' ? json.mensagem : null,
            result: json.result ?? null,
            error: json.error ?? null,
        }
    }

    async poll() {
        const signal = this.controller.signal
        this.inFlight = true
        try {
            const raw = await this.transport({ url: this.url, method: 'GET', headers: { Accept: 'application/json', ...this.headers }, credentials: this.credentials, timeout: Math.min(30000, this.timeout), signal })
            const retryAfter = Number(raw.headers?.get('retry-after'))
            if (raw.status === 404 || raw.status === 410) throw new OperationalError('Processamento não encontrado ou expirado no servidor.', { kind: 'job-missing', status: raw.status })
            if (raw.status === 429 || raw.status >= 500) return { transient: true, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null }
            if (raw.status < 200 || raw.status >= 300) throw new OperationalError(`Consulta de status falhou (HTTP ${raw.status}).`, { kind: 'job-http', status: raw.status })
            const body = parseBody(raw)
            if (body.type !== 'json') throw new OperationalError('Resposta de status não é JSON.', { kind: 'job-contract' })
            return { update: this.normalize(body.json), retryAfter: Number.isFinite(retryAfter) ? retryAfter : null }
        } finally {
            this.inFlight = false
        }
    }

    async run() {
        const signal = this.controller.signal
        const started = this.now()
        let delay = this.interval
        let failures = 0
        let last = null
        for (;;) {
            if (this.now() - started > this.timeout) {
                throw new OperationalError('Tempo de observação do processamento excedido.', { kind: 'job-timeout', last })
            }
            await sleep(delay, signal)
            let outcome
            try {
                outcome = await this.poll()
            } catch (error) {
                if (isAbort(error) || signal.aborted) throw new AbortError('Observação do processamento encerrada.')
                if (error.kind === 'network' || error.kind === 'timeout') {
                    failures += 1
                    if (failures > this.maxNetworkFailures) throw error
                    delay = backoffDelay(failures, { baseDelay: this.interval, maxDelay: this.maxInterval })
                    continue
                }
                throw error
            }
            failures = 0
            if (outcome.transient) {
                delay = outcome.retryAfter != null ? outcome.retryAfter * 1000 : Math.min(this.maxInterval, delay * 2)
                continue
            }
            const changed = !last || last.status !== outcome.update.status || last.progress !== outcome.update.progress
            last = outcome.update
            this.onUpdate(last)
            if (TERMINAL.has(last.status)) return last
            delay = outcome.retryAfter != null ? outcome.retryAfter * 1000 : changed ? this.interval : Math.min(this.maxInterval, Math.round(delay * 1.5))
        }
    }
}

export function jobStorageKey(form) {
    const id = formId(form) || form.getAttribute('action') || 'form'
    return `alpineform:job:${id}`
}

export function saveJob(form, job) {
    try {
        sessionStorage.setItem(jobStorageKey(form), JSON.stringify({ id: job.id, statusUrl: job.statusUrl || null, savedAt: Date.now() }))
    } catch {
        /* armazenamento indisponível: a recuperação após recarga fica desativada */
    }
}

export function loadJob(form) {
    try {
        const raw = sessionStorage.getItem(jobStorageKey(form))
        if (!raw) return null
        const data = JSON.parse(raw)
        return data && typeof data.id === 'string' ? data : null
    } catch {
        return null
    }
}

export function clearJob(form) {
    try {
        sessionStorage.removeItem(jobStorageKey(form))
    } catch {
        /* ignorado */
    }
}
