import { OperationalError, AbortError } from '../core/errors.js'
import { isCrossOrigin } from './xhr.js'

/**
 * Transporte fetch: sem progresso de upload (o estado fica indeterminado).
 * Útil para requisições sem arquivos ou ambientes onde XHR não é desejado.
 */
export async function fetchTransport(request) {
    const { url, method = 'POST', headers = {}, body = null, credentials = 'same-origin', timeout = 0, signal } = request
    const controller = new AbortController()
    let timedOut = false
    const timer = timeout > 0 ? setTimeout(() => {
        timedOut = true
        controller.abort()
    }, timeout) : null
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) controller.abort()

    const finalHeaders = {}
    for (const [name, value] of Object.entries(headers)) {
        if (value == null) continue
        if (body instanceof FormData && name.toLowerCase() === 'content-type') continue
        finalHeaders[name] = value
    }
    if (body) request.onUploadProgress?.({ loaded: 0, total: null, lengthComputable: false })
    try {
        const response = await fetch(url, { method: method.toUpperCase(), headers: finalHeaders, body, credentials, signal: controller.signal, redirect: 'follow' })
        request.onUploadComplete?.()
        const text = await response.text()
        return {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            redirected: response.redirected,
            headers: { get: name => response.headers.get(name) },
            text,
        }
    } catch (error) {
        if (timedOut) throw new OperationalError('Tempo limite excedido.', { kind: 'timeout', uploadComplete: false })
        if (controller.signal.aborted) throw new AbortError('Envio cancelado.')
        throw new OperationalError('Falha de rede ou requisição bloqueada pelo navegador.', { kind: 'network', uploadComplete: false, crossOrigin: isCrossOrigin(url), cause: error })
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
    }
}
