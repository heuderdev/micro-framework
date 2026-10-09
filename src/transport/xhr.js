import { OperationalError, AbortError } from '../core/errors.js'

function absoluteUrl(url) {
    try {
        return new URL(url, globalThis.location?.href).href
    } catch {
        return url
    }
}

function rawFromXhr(xhr, requestUrl) {
    const finalUrl = xhr.responseURL || absoluteUrl(requestUrl)
    return {
        status: xhr.status,
        statusText: xhr.statusText,
        url: finalUrl,
        redirected: !!xhr.responseURL && xhr.responseURL !== absoluteUrl(requestUrl),
        headers: { get: name => xhr.getResponseHeader(name) },
        text: typeof xhr.responseText === 'string' ? xhr.responseText : '',
    }
}

/**
 * Transporte XMLHttpRequest: único caminho com progresso REAL de upload nos navegadores atuais.
 *
 * - loaded/total vêm de xhr.upload.onprogress e medem o CORPO DA REQUISIÇÃO transmitido
 *   (inclui boundaries e cabeçalhos multipart), não apenas bytes úteis dos arquivos.
 * - "upload concluído" = xhr.upload.onload OU cabeçalhos da resposta recebidos; a partir daí
 *   o estado é "aguardando resposta", não "concluído".
 * - Registrar listeners em xhr.upload torna requisições cross-origin "não simples" (preflight CORS).
 */
export function xhrTransport(request) {
    return new Promise((resolve, reject) => {
        const { url, method = 'POST', headers = {}, body = null, credentials = 'same-origin', timeout = 0, signal } = request
        if (signal?.aborted) return reject(new AbortError())
        const xhr = new XMLHttpRequest()
        let uploadComplete = !body
        let settled = false

        const finish = (fn, value) => {
            if (settled) return
            settled = true
            signal?.removeEventListener('abort', onAbort)
            fn(value)
        }
        const markUploaded = () => {
            if (uploadComplete) return
            uploadComplete = true
            request.onUploadComplete?.()
        }
        const onAbort = () => xhr.abort()

        xhr.open(method.toUpperCase(), url, true)
        for (const [name, value] of Object.entries(headers)) {
            if (value == null) continue
            if (body instanceof FormData && name.toLowerCase() === 'content-type') continue
            xhr.setRequestHeader(name, value)
        }
        xhr.withCredentials = credentials === 'include'
        xhr.timeout = timeout > 0 ? timeout : 0
        xhr.responseType = 'text'

        if (body && request.onUploadProgress) {
            xhr.upload.onloadstart = event => request.onUploadProgress({ loaded: 0, total: event.lengthComputable ? event.total : null, lengthComputable: event.lengthComputable })
            xhr.upload.onprogress = event => request.onUploadProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : null, lengthComputable: event.lengthComputable })
            xhr.upload.onload = () => markUploaded()
        }
        xhr.onreadystatechange = () => {
            if (xhr.readyState >= 2) markUploaded()
        }
        xhr.onload = () => finish(resolve, rawFromXhr(xhr, url))
        xhr.onerror = () => finish(reject, new OperationalError('Falha de rede ou requisição bloqueada pelo navegador.', { kind: 'network', uploadComplete, crossOrigin: isCrossOrigin(url) }))
        xhr.ontimeout = () => finish(reject, new OperationalError('Tempo limite excedido.', { kind: 'timeout', uploadComplete }))
        xhr.onabort = () => finish(reject, new AbortError('Envio cancelado.', { uploadComplete }))
        signal?.addEventListener('abort', onAbort, { once: true })
        xhr.send(body)
    })
}

export function isCrossOrigin(url) {
    try {
        return new URL(url, globalThis.location?.href).origin !== globalThis.location?.origin
    } catch {
        return false
    }
}
