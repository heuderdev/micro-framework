/**
 * Aritmética decimal mínima e exata sobre strings canônicas ("-1234.56").
 * Usa BigInt escalado para comparar sem erros de ponto flutuante (0.1 + 0.2).
 */

const CANONICAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/

export function isCanonicalDecimal(value) {
    return typeof value === 'string' && CANONICAL_RE.test(value.trim())
}

export function parseDecimal(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null
        value = numberToPlainString(value)
    }
    if (typeof value === 'bigint') value = value.toString()
    if (typeof value !== 'string') return null
    const match = CANONICAL_RE.exec(value.trim())
    if (!match) return null
    const negative = match[1] === '-'
    const intPart = match[2].replace(/^0+(?=\d)/, '')
    const fracPart = (match[3] || '').replace(/0+$/, '')
    const digits = BigInt(intPart + fracPart || '0')
    return { sign: negative && digits !== 0n ? -1n : 1n, digits, scale: fracPart.length }
}

function numberToPlainString(number) {
    const text = String(number)
    if (!/e/i.test(text)) return text
    return number.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
}

function align(a, b) {
    const scale = Math.max(a.scale, b.scale)
    const av = a.sign * a.digits * 10n ** BigInt(scale - a.scale)
    const bv = b.sign * b.digits * 10n ** BigInt(scale - b.scale)
    return [av, bv, scale]
}

/** Retorna -1, 0 ou 1; null se algum operando não for decimal válido. */
export function compareDecimal(a, b) {
    const pa = parseDecimal(a)
    const pb = parseDecimal(b)
    if (!pa || !pb) return null
    const [av, bv] = align(pa, pb)
    return av < bv ? -1 : av > bv ? 1 : 0
}

export function isMultipleOf(value, step) {
    const pv = parseDecimal(value)
    const ps = parseDecimal(step)
    if (!pv || !ps || ps.digits === 0n) return null
    const [av, bv] = align(pv, ps)
    return av % bv === 0n
}

export function decimalScale(value) {
    const match = CANONICAL_RE.exec(String(value).trim())
    return match ? (match[3] || '').length : null
}

/** Normaliza para o formato canônico com escala fixa, sem passar por Number. */
export function toFixedScale(value, scale) {
    const match = CANONICAL_RE.exec(String(value).trim())
    if (!match) return null
    const negative = match[1] === '-'
    let intPart = match[2].replace(/^0+(?=\d)/, '')
    let frac = match[3] || ''
    if (frac.length > scale) frac = frac.slice(0, scale)
    frac = frac.padEnd(scale, '0')
    const isZero = /^0*$/.test(intPart + frac)
    return `${negative && !isZero ? '-' : ''}${intPart}${scale > 0 ? '.' + frac : ''}`
}
