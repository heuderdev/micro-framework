import { parseSize } from '../lib/size.js'

/**
 * Lê o arquivo inteiro (até data-form-json-max, padrão 5 MB) e usa JSON.parse.
 * Acima do limite o conteúdo NÃO é verificado: o resultado indica oversize e a regra falha
 * com mensagem própria (validação no navegador inviável), sem fingir aprovação.
 */
export async function inspectJson(file, { attribute = () => null } = {}) {
    const max = attribute('data-form-json-max') ? parseSize(attribute('data-form-json-max')) : 5 * 1000 * 1000
    if (file.size > max) return { valid: false, reason: 'oversize', max }
    let text
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    } catch {
        return { valid: false, reason: 'encoding' }
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    try {
        const value = JSON.parse(text)
        return { valid: true, root: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value, keys: value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [] }
    } catch (error) {
        return { valid: false, reason: 'syntax', detail: error.message }
    }
}
