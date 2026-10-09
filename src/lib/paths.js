import { SerializationError } from '../core/errors.js'

export const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

const BRACKET_NAME = /^([^[\]]+)((?:\[[^[\]]*\])*)$/

/**
 * Divide um name HTML em segmentos.
 * - "itens[0][nome]" -> ["itens", "0", "nome"]
 * - "documentos[]"   -> ["documentos", ""]   ("" = acrescentar ao final)
 * - "usuario.email"  -> ["usuario.email"]    (modo "brackets", padrão)
 *                    -> ["usuario", "email"] (modo "dots")
 * Nomes que não seguem a gramática de colchetes viram um único segmento literal.
 */
export function splitName(name, mode = 'brackets') {
    if (mode === 'flat') return [name]
    const match = BRACKET_NAME.exec(name)
    let segments
    if (!match) {
        segments = [name]
    } else {
        segments = [match[1]]
        const brackets = match[2].match(/\[[^[\]]*\]/g) || []
        for (const part of brackets) segments.push(part.slice(1, -1))
    }
    if (mode === 'dots') {
        segments = segments.flatMap((segment, index) => (segment === '' && index > 0 ? [''] : segment.split('.')))
    }
    return segments
}

/** Chave canônica em notação de ponto usada para associar erros: itens[0][nome] -> itens.0.nome */
export function nameToKey(name) {
    const segments = splitName(name, 'brackets')
    if (segments.length > 1 && segments[segments.length - 1] === '') segments.pop()
    return segments.join('.')
}

export function normalizeErrorKey(key) {
    if (!/[[\]]/.test(key)) return key
    return nameToKey(key)
}

export function assertSafeSegments(segments, name) {
    for (const segment of segments) {
        if (FORBIDDEN_SEGMENTS.has(segment)) {
            throw new SerializationError(`O campo "${name}" usa o segmento proibido "${segment}" e não pode ser convertido em objeto.`, { name, segment })
        }
    }
}

function isIndex(segment) {
    return /^(0|[1-9]\d{0,8})$/.test(segment)
}

/**
 * Insere um valor num objeto aninhado seguindo a política de nomes.
 * Índices numéricos criam arrays (lacunas viram null na serialização JSON);
 * segmento vazio acrescenta ao final. Conflitos de tipo geram SerializationError.
 */
export function setPath(target, segments, value, name) {
    assertSafeSegments(segments, name)
    let node = target
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const last = i === segments.length - 1
        const nextSegment = segments[i + 1]
        const wantsArray = !last && (nextSegment === '' || isIndex(nextSegment))
        if (Array.isArray(node)) {
            if (segment !== '' && !isIndex(segment)) {
                throw new SerializationError(`Conflito de estrutura em "${name}": "${segment}" não é índice de lista.`, { name })
            }
            const index = segment === '' ? node.length : Number(segment)
            if (last) {
                node[index] = value
                return
            }
            if (node[index] == null) node[index] = wantsArray ? [] : Object.create(null)
            node = node[index]
        } else {
            if (segment === '') throw new SerializationError(`Nome inválido "${name}": "[]" só é permitido após um nome.`, { name })
            if (last) {
                if (Object.prototype.hasOwnProperty.call(node, segment)) {
                    const existing = node[segment]
                    node[segment] = Array.isArray(existing) ? [...existing, value] : [existing, value]
                } else {
                    node[segment] = value
                }
                return
            }
            if (node[segment] == null) node[segment] = wantsArray ? [] : Object.create(null)
            else if (typeof node[segment] !== 'object') {
                throw new SerializationError(`Conflito de estrutura em "${name}": "${segment}" já possui um valor simples.`, { name })
            }
            node = node[segment]
        }
    }
}

/** Converte objetos sem protótipo em objetos comuns e lacunas de arrays em null. */
export function toPlain(value) {
    if (Array.isArray(value)) {
        const out = []
        for (let i = 0; i < value.length; i++) out.push(i in value ? toPlain(value[i]) : null)
        return out
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === null) {
        const out = {}
        for (const key of Object.keys(value)) {
            Object.defineProperty(out, key, { value: toPlain(value[key]), enumerable: true, writable: true, configurable: true })
        }
        return out
    }
    return value
}
