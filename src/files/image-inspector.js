import { OperationalError, AbortError } from '../core/errors.js'

export const MAX_DECODE_BYTES = 50 * 1024 * 1024

/**
 * Lê largura/altura decodificando a imagem no navegador.
 * Usa createImageBitmap quando disponível; caso contrário, <img> com object URL temporário.
 * Formatos permitidos que o navegador não decodifica (ex.: AVIF em navegadores antigos) geram OperationalError.
 */
export async function inspectImage(file, { signal, maxBytes = MAX_DECODE_BYTES } = {}) {
    if (signal?.aborted) throw new AbortError()
    if (file.size > maxBytes) {
        throw new OperationalError(`Imagem grande demais para inspeção no navegador (${file.size} bytes).`, { kind: 'inspect' })
    }
    if (typeof createImageBitmap === 'function') {
        let bitmap
        try {
            bitmap = await createImageBitmap(file)
        } catch (error) {
            throw new OperationalError('O navegador não conseguiu decodificar a imagem.', { kind: 'decode', cause: error })
        }
        if (signal?.aborted) {
            bitmap.close?.()
            throw new AbortError()
        }
        const result = { width: bitmap.width, height: bitmap.height }
        bitmap.close?.()
        return result
    }
    if (typeof Image !== 'function' || typeof URL.createObjectURL !== 'function') {
        throw new OperationalError('Este navegador não oferece API para decodificar imagens.', { kind: 'unsupported' })
    }
    const url = URL.createObjectURL(file)
    try {
        const img = new Image()
        img.src = url
        await new Promise((resolve, reject) => {
            const onAbort = () => reject(new AbortError())
            signal?.addEventListener('abort', onAbort, { once: true })
            img.onload = () => resolve()
            img.onerror = () => reject(new OperationalError('O navegador não conseguiu decodificar a imagem.', { kind: 'decode' }))
        })
        return { width: img.naturalWidth, height: img.naturalHeight }
    } finally {
        URL.revokeObjectURL(url)
    }
}
