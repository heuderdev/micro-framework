import { ConfigError } from '../core/errors.js'
import { compilePattern, formatWithCaret, applySlots, deleteAcrossLiteral, tokenPositions, DEFAULT_TOKENS } from './pattern-engine.js'
import { NumericEngine } from './numeric-engine.js'
import { detectBrand, GENERIC_CARD } from '../lib/cards.js'
import { parseByKind, formatIso, formatBr } from '../lib/date.js'

const UPPER_ALNUM = { X: { test: ch => /[0-9A-Z]/.test(ch), transform: ch => ch.toUpperCase() } }

/**
 * Máscara baseada em padrão(ões). `choose(input)` permite máscaras dinâmicas (CPF/CNPJ, telefone, cartão).
 * canonical(result) define o valor canônico a partir do resultado da formatação.
 */
export function patternMask({ name, choose, inputmode = 'text', defaults, canonical = r => r.raw, fromCanonical = null, dateKind = null, placeholderPattern = null }) {
    return {
        name,
        inputmode,
        defaults,
        dateKind,
        numeric: false,
        placeholderPattern,
        format(input, caret = null) {
            const compiled = choose(String(input ?? ''))
            const result = formatWithCaret(String(input ?? ''), caret, compiled)
            return { value: result.formatted, caret: result.caret }
        },
        represent(display) {
            const compiled = choose(String(display ?? ''))
            const result = applySlots(String(display ?? ''), compiled)
            return { raw: result.raw, formatted: result.formatted, canonical: canonical(result, compiled) }
        },
        fromValue(text, as = 'display') {
            if (as === 'canonical' && fromCanonical) return fromCanonical(String(text ?? ''), this)
            return this.format(String(text ?? '')).value
        },
        deleteAcrossLiteral(value, caret, direction) {
            const positions = tokenPositions(value, choose(value))
            return deleteAcrossLiteral(value, caret, direction, (ch, index) => positions.has(index))
        },
    }
}

const DOC_DEFAULTS = { validation: 'raw', submit: 'formatted' }
const single = pattern => {
    const compiled = compilePattern(pattern)
    return () => compiled
}

function significant(input, test) {
    let count = 0
    for (const ch of input) if (test(ch)) count += 1
    return count
}

export function createCpf() {
    return patternMask({ name: 'cpf', choose: single('999.999.999-99'), inputmode: 'numeric', defaults: DOC_DEFAULTS, placeholderPattern: '999.999.999-99' })
}

const CNPJ = compilePattern('XX.XXX.XXX/XXXX-99', { tokens: { ...DEFAULT_TOKENS, ...UPPER_ALNUM } })
const CPF = compilePattern('999.999.999-99')

/** CNPJ numérico ou alfanumérico (12 posições [0-9A-Z] + 2 dígitos verificadores). Letras são convertidas para maiúsculas. */
export function createCnpj() {
    return patternMask({ name: 'cnpj', choose: () => CNPJ, inputmode: 'text', defaults: DOC_DEFAULTS, placeholderPattern: '99.999.999/9999-99' })
}

/** Até 11 dígitos sem letras: CPF. Com letra ou mais de 11 caracteres: CNPJ (inclusive alfanumérico). */
export function createCpfCnpj() {
    const choose = input => {
        const hasLetter = /[A-Za-z]/.test(input)
        const count = significant(input, ch => /[0-9A-Za-z]/.test(ch))
        return hasLetter || count > 11 ? CNPJ : CPF
    }
    return patternMask({ name: 'cpf_cnpj', choose, inputmode: 'text', defaults: DOC_DEFAULTS })
}

export function createCep() {
    return patternMask({ name: 'cep', choose: single('99999-999'), inputmode: 'numeric', defaults: DOC_DEFAULTS, placeholderPattern: '99999-999' })
}

const PHONE_FIXO = compilePattern('(99) 9999-9999')
const PHONE_CELULAR = compilePattern('(99) 99999-9999')

export function createTelefoneFixo() {
    return patternMask({ name: 'telefone_fixo', choose: () => PHONE_FIXO, inputmode: 'tel', defaults: DOC_DEFAULTS, placeholderPattern: '(99) 9999-9999' })
}

export function createCelular() {
    return patternMask({ name: 'celular', choose: () => PHONE_CELULAR, inputmode: 'tel', defaults: DOC_DEFAULTS, placeholderPattern: '(99) 99999-9999' })
}

/** Até 10 dígitos: fixo (99) 9999-9999; 11 dígitos: celular (99) 99999-9999. */
export function createTelefoneBr() {
    const choose = input => (significant(input, ch => ch >= '0' && ch <= '9') > 10 ? PHONE_CELULAR : PHONE_FIXO)
    return patternMask({ name: 'telefone_br', choose, inputmode: 'tel', defaults: DOC_DEFAULTS })
}

function cardPattern(gaps, maxLength) {
    let remaining = maxLength
    const groups = []
    for (const gap of gaps) {
        if (remaining <= 0) break
        const size = Math.min(gap, remaining)
        groups.push('9'.repeat(size))
        remaining -= size
    }
    return compilePattern(groups.join(' '))
}

/** Cartão: agrupamento e comprimento máximo pela bandeira detectada (ou genérico 4-4-4-4-3). */
export function createCard(config) {
    const allowed = config.cardBrands
    const cache = new Map()
    const choose = input => {
        const digits = input.replace(/\D+/g, '')
        const brand = detectBrand(digits, allowed) || GENERIC_CARD
        const key = brand.name || 'generic'
        if (!cache.has(key)) cache.set(key, cardPattern(brand.gaps, Math.max(...brand.lengths)))
        return cache.get(key)
    }
    const mask = patternMask({ name: 'card', choose, inputmode: 'numeric', defaults: { validation: 'raw', submit: 'raw' } })
    mask.brand = display => detectBrand(String(display ?? '').replace(/\D+/g, ''), allowed)?.name ?? null
    return mask
}

function dateLike(name, pattern, kind, toIso, fromIso) {
    const compiled = compilePattern(pattern)
    return patternMask({
        name,
        choose: () => compiled,
        inputmode: 'numeric',
        dateKind: kind,
        defaults: { validation: 'canonical', submit: 'canonical' },
        placeholderPattern: pattern,
        canonical: result => {
            if (!result.complete) return result.formatted
            return toIso(result.formatted) || result.formatted
        },
        fromCanonical: text => {
            const parsed = parseByKind(text, kind, 'iso')
            if (parsed) return applySlots(fromIso(parsed), compiled).formatted
            return applySlots(text, compiled).formatted
        },
    })
}

/** Data dd/mm/aaaa. Canônico: ISO aaaa-mm-dd somente se a data existir no calendário. */
export function createDate() {
    return dateLike('date', '99/99/9999', 'date', text => formatIso(parseByKind(text, 'date', 'br')), parsed => formatBr(parsed))
}

/** Hora hh:mm (00:00 a 23:59). Canônico: hh:mm. */
export function createTime() {
    return dateLike('time', '99:99', 'time', text => (parseByKind(text, 'time') ? text : null), parsed => formatIso(parsed))
}

/** Mês/ano mm/aaaa. Canônico: aaaa-mm. */
export function createMonthYear() {
    return dateLike('month_year', '99/9999', 'month', text => formatIso(parseByKind(text, 'month', 'br')), parsed => formatBr(parsed))
}

/** Padrão personalizado via data-form-mask-pattern; data-form-mask-case="upper|lower" transforma letras. */
export function createPattern(config) {
    if (!config.pattern) throw new ConfigError('data-form-mask="pattern" exige data-form-mask-pattern.')
    const transform = config.case === 'upper' ? ch => ch.toUpperCase() : config.case === 'lower' ? ch => ch.toLowerCase() : null
    const compiled = compilePattern(config.pattern, { transform })
    return patternMask({ name: 'pattern', choose: () => compiled, inputmode: 'text', defaults: { validation: 'formatted', submit: 'formatted' }, placeholderPattern: config.pattern })
}

function numericMask(name, style, config, defaults) {
    const engine = new NumericEngine({
        locale: config.locale,
        style,
        currency: config.currency,
        scale: style === 'integer' ? 0 : config.scale,
        allowNegative: config.negative,
        maxDigits: config.maxDigits,
        pad: config.pad ?? defaults.pad,
        grouping: config.grouping ?? true,
    })
    return {
        name,
        numeric: true,
        dateKind: null,
        inputmode: style === 'integer' ? 'numeric' : 'decimal',
        defaults: { validation: 'canonical', submit: 'canonical' },
        engine,
        format(input, caret = null, options = {}) {
            const result = engine.format(input, caret, options)
            return { value: result.value, caret: result.caret }
        },
        represent: display => engine.represent(display),
        fromValue(text, as = 'display') {
            const value = String(text ?? '')
            if (as === 'canonical' || (as === 'raw' && /^[+-]?\d+(\.\d+)?$/.test(value.trim()))) return engine.fromCanonical(value)
            return engine.format(value).value
        },
        onBlur: value => engine.padded(value),
        deleteAcrossLiteral(value, caret, direction) {
            return deleteAcrossLiteral(value, caret, direction, ch => engine.isSignificant(ch))
        },
    }
}

export const createInteger = config => numericMask('integer', 'integer', config, { pad: false })
export const createDecimal = config => numericMask('decimal', 'decimal', config, { pad: false })
export const createCurrency = config => numericMask('currency', 'currency', config, { pad: true })
export const createPercent = config => numericMask('percent', 'percent', config, { pad: false })

export const BUILTIN_MASKS = {
    cpf: createCpf,
    cnpj: createCnpj,
    cpf_cnpj: createCpfCnpj,
    cep: createCep,
    telefone_fixo: createTelefoneFixo,
    celular: createCelular,
    telefone_br: createTelefoneBr,
    card: createCard,
    date: createDate,
    time: createTime,
    month_year: createMonthYear,
    integer: createInteger,
    decimal: createDecimal,
    currency: createCurrency,
    percent: createPercent,
    pattern: createPattern,
}
