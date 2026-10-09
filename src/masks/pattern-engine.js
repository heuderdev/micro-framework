import { ConfigError } from '../core/errors.js'

/**
 * Motor de máscaras por padrão.
 *
 * Tokens padrão:
 *   9  dígito 0-9
 *   A  letra (Unicode, \p{L})
 *   *  letra ou dígito
 *   \x escapa o próximo caractere, tornando-o literal (ex.: "\A" exibe "A" fixo)
 * Qualquer outro caractere é literal.
 *
 * Algoritmo: percorre entrada e padrão em paralelo. Caracteres que casam com o token atual são
 * aceitos; literais digitados que coincidem com o literal esperado são consumidos; caracteres
 * inválidos são descartados. Literais só são inseridos antes de um token preenchido, então o
 * valor nunca termina com separador pendente (Backspace funciona naturalmente).
 *
 * Cursor: conta quantos caracteres significativos (aceitos por tokens) existiam antes do cursor
 * na entrada e posiciona o cursor depois do mesmo número de tokens na saída.
 */
export const DEFAULT_TOKENS = {
    9: { test: ch => /[0-9]/.test(ch) },
    A: { test: ch => /\p{L}/u.test(ch) },
    '*': { test: ch => /[\p{L}0-9]/u.test(ch) },
}

export function compilePattern(pattern, { tokens = DEFAULT_TOKENS, transform = null } = {}) {
    if (typeof pattern !== 'string' || pattern.length === 0) throw new ConfigError('Padrão de máscara vazio.')
    if (pattern.length > 100) throw new ConfigError('Padrão de máscara excede 100 caracteres.')
    const slots = []
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i]
        if (ch === '\\') {
            const next = pattern[i + 1]
            if (next === undefined) throw new ConfigError(`Padrão "${pattern}" termina com "\\" sem caractere escapado.`)
            slots.push({ literal: true, char: next })
            i += 1
            continue
        }
        const token = tokens[ch]
        if (token) slots.push({ literal: false, test: token.test, transform: token.transform || transform })
        else slots.push({ literal: true, char: ch })
    }
    if (!slots.some(slot => !slot.literal)) throw new ConfigError(`Padrão "${pattern}" não possui nenhum token (9, A ou *).`)
    return { pattern, slots, tokenCount: slots.filter(s => !s.literal).length }
}

export function applySlots(input, compiled) {
    const slots = compiled.slots
    let formatted = ''
    let raw = ''
    let pending = ''
    let slotIndex = 0
    let consumed = 0
    const tokenEnds = []
    const text = String(input ?? '')
    const chars = Array.from(text)
    let i = 0
    while (i < chars.length && slotIndex < slots.length) {
        const slot = slots[slotIndex]
        const ch = chars[i]
        if (slot.literal) {
            pending += slot.char
            slotIndex += 1
            if (ch === slot.char) {
                i += 1
                consumed = i
            }
            continue
        }
        const value = slot.transform ? slot.transform(ch) : ch
        if (slot.test(value)) {
            formatted += pending + value
            pending = ''
            raw += value
            tokenEnds.push(formatted.length)
            slotIndex += 1
            i += 1
            consumed = i
        } else {
            i += 1
        }
    }
    return { formatted, raw, complete: raw.length === compiled.tokenCount, tokenEnds, consumed }
}

/** Número de tokens aceitos considerando apenas os caracteres antes do cursor. */
export function acceptedBefore(input, caret, compiled) {
    const prefix = Array.from(String(input ?? '').slice(0, caret)).join('')
    return applySlots(prefix, compiled).raw.length
}

export function caretAfterTokens(result, count) {
    if (count <= 0) return 0
    if (count > result.tokenEnds.length) return result.formatted.length
    return result.tokenEnds[count - 1]
}

/** Formata com mapeamento de cursor. */
export function formatWithCaret(input, caret, compiled) {
    const result = applySlots(input, compiled)
    const position = caret == null ? result.formatted.length : caretAfterTokens(result, acceptedBefore(input, caret, compiled))
    return { ...result, caret: position }
}

/**
 * Backspace/Delete sobre literal: remove o token significativo anterior/seguinte em vez do separador
 * (que seria reinserido pela formatação e deixaria o usuário "preso").
 * Retorna null quando o comportamento nativo já resolve.
 */
export function deleteAcrossLiteral(value, caret, direction, isSignificant) {
    const text = String(value)
    if (direction === 'backward') {
        if (caret <= 0 || isSignificant(text[caret - 1], caret - 1)) return null
        let j = caret - 1
        while (j >= 0 && !isSignificant(text[j], j)) j -= 1
        if (j < 0) return null
        return { value: text.slice(0, j) + text.slice(j + 1), caret: j }
    }
    if (caret >= text.length || isSignificant(text[caret], caret)) return null
    let j = caret
    while (j < text.length && !isSignificant(text[j], j)) j += 1
    if (j >= text.length) return null
    return { value: text.slice(0, j) + text.slice(j + 1), caret }
}

/** Índices (UTF-16) ocupados por caracteres de token no valor formatado. */
export function tokenPositions(formatted, compiled) {
    const result = applySlots(formatted, compiled)
    return new Set(result.tokenEnds.map(end => end - 1))
}
