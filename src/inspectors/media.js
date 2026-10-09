import { OperationalError, AbortError } from '../core/errors.js'

/**
 * Duração/dimensões de áudio e vídeo pelo elemento de mídia do navegador (lê apenas metadados).
 * Formatos que o navegador não decodifica geram OperationalError (kind "decode").
 */
export function inspectMedia(file, { signal, timeout = 15000 } = {}) {
    return new Promise((resolve, reject) => {
        if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
            reject(new OperationalError('API de mídia indisponível.', { kind: 'unsupported' }))
            return
        }
        const isVideo = (file.type || '').startsWith('video/')
        const media = document.createElement(isVideo ? 'video' : 'audio')
        const url = URL.createObjectURL(file)
        let timer = null
        const cleanup = () => {
            clearTimeout(timer)
            media.removeAttribute('src')
            media.load?.()
            URL.revokeObjectURL(url)
            signal?.removeEventListener('abort', onAbort)
        }
        const onAbort = () => {
            cleanup()
            reject(new AbortError())
        }
        media.preload = 'metadata'
        media.muted = true
        media.onloadedmetadata = () => {
            const result = { duration: Number.isFinite(media.duration) ? media.duration : null, width: media.videoWidth || null, height: media.videoHeight || null }
            cleanup()
            resolve(result)
        }
        media.onerror = () => {
            cleanup()
            reject(new OperationalError('O navegador não conseguiu ler os metadados da mídia.', { kind: 'decode' }))
        }
        timer = setTimeout(() => {
            cleanup()
            reject(new OperationalError('Tempo esgotado ao ler metadados da mídia.', { kind: 'decode' }))
        }, timeout)
        signal?.addEventListener('abort', onAbort, { once: true })
        media.src = url
    })
}
