import { ConfigError } from '../core/errors.js'

/**
 * Motor numérico (inteiro, decimal, moeda, percentual) com digitação livre.
 *
 * Representações (exemplo pt-BR, BRL, escala 2):
 *   exibido/formatted: "R$ 1.234,5"   (durante digitação; "R$ 1.234,50" após blur se pad=true)
 *   raw:               "12345"        (sinal + dígitos digitados, sem separadores: NÃO é um número)
 *   canonical:         "1234.50"      (string decimal com ponto e escala fixa; nunca Number)
 *
 * Regras de interpretação:
 *   - separador decimal = o do locale (pt-BR: ","); o separador de milhar digitado é ignorado;
 *   - em COLAGEM sem separador decimal do locale, "1234.56" (ponto seguido de 1-2 dígitos, até a escala)
 *     é interpretado como decimal canônico; com exatamente 3 dígitos após o ponto, é milhar (ambíguo);
 *   - zeros à esquerda da parte inteira são removidos ("007" -> "7"; ",5" -> "0,5");
 *   - casas além da escala são descartadas (não arredondadas);
 *   - negativo só com allowNegative; quantidade ímpar de "-" torna o valor negativo;
 *   - agrupamento de milhar em grupos de 3 (locales com agrupamento diferente, como en-IN, não são reproduzidos).
 */
export function localeSymbols(locale, { style = 'decimal', currency = 'BRL' } = {}) {
    let numberParts
    try {
        numberParts = new Intl.NumberFormat(locale).formatToParts(1234567.891)
    } catch {
        throw new ConfigError(`Locale "${locale}" não suportado pelo Intl deste navegador.`)
    }
    const group = numberParts.find(p => p.type === 'group')?.value ?? ''
    const decimal = numberParts.find(p => p.type === 'decimal')?.value ?? '.'
    let prefix = ''
    let suffix = ''
    let currencyDigits = 2
    if (style === 'currency') {
        let parts
        try {
            const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency })
            parts = fmt.formatToParts(1)
            currencyDigits = fmt.resolvedOptions().maximumFractionDigits
        } catch {
            throw new ConfigError(`Moeda "${currency}" inválida para Intl.NumberFormat.`)
        }
        const firstNumber = parts.findIndex(p => p.type === 'integer')
        const lastNumber = parts.map(p => p.type).lastIndexOf(parts.some(p => p.type === 'fraction') ? 'fraction' : 'integer')
        prefix = parts.slice(0, firstNumber).map(p => p.value).join('')
        suffix = parts.slice(lastNumber + 1).map(p => p.value).join('')
    } else if (style === 'percent') {
        const parts = new Intl.NumberFormat(locale, { style: 'percent' }).formatToParts(0.12)
        const firstNumber = parts.findIndex(p => p.type === 'integer')
        const lastNumber = parts.map(p => p.type).lastIndexOf('integer')
        prefix = parts.slice(0, firstNumber).map(p => p.value).join('')
        suffix = parts.slice(lastNumber + 1).map(p => p.value).join('')
    }
    return { group, decimal, prefix, suffix, currencyDigits }
}

function isDigit(ch) {
    return ch >= '0' && ch <= '9'
}

export class NumericEngine {
    constructor({ locale = 'pt-BR', style = 'decimal', currency = 'BRL', scale = null, allowNegative = false, maxDigits = 15, pad = false, grouping = true } = {}) {
        const symbols = localeSymbols(locale, { style, currency })
        this.symbols = symbols
        this.scale = scale == null ? (style === 'currency' ? symbols.currencyDigits : style === 'integer' ? 0 : 2) : scale
        if (!Number.isInteger(this.scale) || this.scale < 0 || this.scale > 10) throw new ConfigError('data-form-mask-scale deve ser inteiro entre 0 e 10.')
        if (!Number.isInteger(maxDigits) || maxDigits < 1 || maxDigits > 30) throw new ConfigError('data-form-mask-max-digits deve ser inteiro entre 1 e 30.')
        this.allowNegative = allowNegative
        this.maxDigits = maxDigits
        this.pad = pad
        this.grouping = grouping
    }

    /** Extrai sinal, parte inteira e fração a partir de texto livre. */
    parse(input, { paste = false } = {}) {
        let text = String(input ?? '')
        const { decimal, prefix, suffix } = this.symbols
        if (prefix && text.includes(prefix.trim())) text = text.split(prefix.trim()).join('')
        if (suffix && suffix.trim() && text.includes(suffix.trim())) text = text.split(suffix.trim()).join('')
        const minusCount = (text.match(/[-−]/g) || []).length
        const negative = this.allowNegative && minusCount % 2 === 1
        let decimalChar = this.scale > 0 ? decimal : null
        if (paste && this.scale > 0 && decimal !== '.' && !text.includes(decimal)) {
            const compact = text.replace(/[\s  -]/g, '')
            const m = /^\d+\.(\d+)$/.exec(compact)
            if (m && m[1].length !== 3 && m[1].length <= this.scale) decimalChar = '.'
        }
        let intDigits = ''
        let fracDigits = ''
        let hasDecimal = false
        const lastDecimal = decimalChar ? text.lastIndexOf(decimalChar) : -1
        for (let i = 0; i < text.length; i++) {
            const ch = text[i]
            if (i === lastDecimal) {
                hasDecimal = true
                continue
            }
            if (!isDigit(ch)) continue
            if (hasDecimal) fracDigits += ch
            else intDigits += ch
        }
        intDigits = intDigits.replace(/^0+(?=\d)/, '')
        if (intDigits.length > this.maxDigits) intDigits = intDigits.slice(0, this.maxDigits)
        fracDigits = fracDigits.slice(0, this.scale)
        return { negative, intDigits, fracDigits, hasDecimal: hasDecimal && this.scale > 0, onlySign: minusCount > 0 && !intDigits && !fracDigits }
    }

    groupInt(intDigits) {
        if (!this.grouping || !this.symbols.group) return intDigits
        let out = ''
        for (let i = 0; i < intDigits.length; i++) {
            const fromEnd = intDigits.length - i
            out += intDigits[i]
            if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += this.symbols.group
        }
        return out
    }

    render(parsed, { padFraction = false } = {}) {
        const { prefix, suffix, decimal } = this.symbols
        if (!parsed.intDigits && !parsed.fracDigits && !parsed.hasDecimal) {
            return parsed.onlySign && this.allowNegative ? '-' : ''
        }
        const intPart = parsed.intDigits || '0'
        let frac = parsed.fracDigits
        let showDecimal = parsed.hasDecimal
        if (padFraction && this.scale > 0) {
            frac = frac.padEnd(this.scale, '0')
            showDecimal = true
        }
        const sign = parsed.negative ? '-' : ''
        return `${sign}${prefix}${this.groupInt(intPart)}${showDecimal ? decimal + frac : ''}${suffix}`
    }

    isSignificant(ch) {
        return isDigit(ch) || ch === this.symbols.decimal || ch === '-'
    }

    format(input, caret = null, { paste = false } = {}) {
        const parsed = this.parse(input, { paste })
        const value = this.render(parsed)
        let position = value.length - this.symbols.suffix.length
        if (caret != null) {
            const before = String(input ?? '').slice(0, caret)
            const sigBefore = this.countSignificant(before, paste)
            position = this.positionAfterSignificant(value, sigBefore)
        }
        return { value, caret: Math.max(0, Math.min(position, value.length - this.symbols.suffix.length)), parsed }
    }

    countSignificant(text, paste) {
        const parsed = this.parse(text, { paste })
        let count = (parsed.negative ? 1 : 0) + parsed.intDigits.length + parsed.fracDigits.length + (parsed.hasDecimal ? 1 : 0)
        if (!parsed.intDigits && parsed.hasDecimal) count += 1
        return count
    }

    positionAfterSignificant(value, count) {
        if (count <= 0) {
            const start = value.startsWith('-') ? 1 : 0
            return Math.min(value.length, start + this.symbols.prefix.length)
        }
        let seen = 0
        for (let i = 0; i < value.length; i++) {
            if (this.isSignificant(value[i])) {
                seen += 1
                if (seen === count) return i + 1
            }
        }
        return value.length - this.symbols.suffix.length
    }

    represent(display) {
        const parsed = this.parse(display)
        const formatted = this.render(parsed)
        if (!parsed.intDigits && !parsed.fracDigits) return { raw: '', formatted, canonical: '' }
        const sign = parsed.negative ? '-' : ''
        const raw = `${sign}${parsed.intDigits}${parsed.fracDigits}`
        const intPart = parsed.intDigits || '0'
        const frac = this.scale > 0 ? '.' + parsed.fracDigits.padEnd(this.scale, '0') : ''
        const isZero = /^0*$/.test(intPart + parsed.fracDigits)
        return { raw, formatted, canonical: `${isZero ? '' : sign}${intPart}${frac}` }
    }

    fromCanonical(text) {
        const value = String(text ?? '').trim()
        if (value === '') return ''
        const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(value)
        if (!m) throw new ConfigError(`Valor canônico inválido para máscara numérica: "${value}". Use o formato 1234.56.`)
        const parsed = {
            negative: this.allowNegative && m[1] === '-',
            intDigits: m[2].replace(/^0+(?=\d)/, ''),
            fracDigits: (m[3] || '').slice(0, this.scale),
            hasDecimal: !!m[3] && this.scale > 0,
            onlySign: false,
        }
        return this.render(parsed, { padFraction: this.pad })
    }

    padded(display) {
        const parsed = this.parse(display)
        if (!parsed.intDigits && !parsed.fracDigits) return this.render(parsed)
        return this.render(parsed, { padFraction: this.pad })
    }
}
