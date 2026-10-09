import { sleep } from '../lib/utils.js'
import { isAbort } from '../core/errors.js'

/**
 * Política de repetição:
 *  - Somente operações idempotentes usam retry automático: validação remota, polling de job e partes de chunk.
 *  - POST de criação NUNCA é repetido automaticamente após resultado desconhecido.
 *  - Backoff exponencial com jitter total, limitado por maxDelay; Retry-After tem prioridade.
 */
export function backoffDelay(attempt, { baseDelay = 500, maxDelay = 15000, random = Math.random } = {}) {
    const ceiling = Math.min(maxDelay, baseDelay * 2 ** attempt)
    return Math.round(ceiling / 2 + random() * (ceiling / 2))
}

export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

export function isRetryableError(error) {
    if (isAbort(error)) return false
    return error?.kind === 'network' || error?.kind === 'timeout'
}

export async function withRetry(operation, { retries = 3, baseDelay = 500, maxDelay = 15000, signal, shouldRetry, onRetry, random } = {}) {
    let attempt = 0
    for (;;) {
        try {
            const result = await operation(attempt)
            const decision = shouldRetry?.(null, result, attempt)
            if (decision && attempt < retries) {
                const wait = typeof decision === 'number' ? decision : backoffDelay(attempt, { baseDelay, maxDelay, random })
                onRetry?.({ attempt, wait, result })
                await sleep(wait, signal)
                attempt += 1
                continue
            }
            return result
        } catch (error) {
            const decision = shouldRetry ? shouldRetry(error, null, attempt) : isRetryableError(error)
            if (!decision || attempt >= retries) throw error
            const wait = typeof decision === 'number' ? decision : backoffDelay(attempt, { baseDelay, maxDelay, random })
            onRetry?.({ attempt, wait, error })
            await sleep(wait, signal)
            attempt += 1
        }
    }
}
