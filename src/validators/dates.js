import { parseByKind, now, formatBr, DATE_KINDS } from '../lib/date.js'
import { isEmptyValue } from '../lib/utils.js'

function kindOf(ctx) {
    return ctx.field.dateKind || 'date'
}

function parseValue(value, kind, format) {
    return parseByKind(String(value ?? ''), kind, format)
}

/** Converte data simples para data-hora 00:00 quando o campo é datetime. */
function promote(parsed, kind) {
    if (!parsed || parsed.kind === kind) return parsed
    if (parsed.kind === 'date' && kind === 'datetime') return parseByKind(`${formatIsoDate(parsed)}T00:00`, 'datetime')
    return null
}

function formatIsoDate(p) {
    return `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

function detectLiteralKind(literal) {
    if (/^\d{4}-W\d{2}$/.test(literal)) return 'week'
    if (/^\d{2}:\d{2}/.test(literal)) return 'time'
    if (/T|\s\d{2}:/.test(literal)) return 'datetime'
    if (/^\d{4}-\d{2}$/.test(literal)) return 'month'
    return 'date'
}

/** Resolve o operando de comparação: { parsed, label } ou { skip: true }. */
export function resolveComparand(param, ctx) {
    const kind = kindOf(ctx)
    if (param.keyword) {
        if (kind === 'week') return ctx.configError('"today"/"now" não são suportados em campos de semana.')
        const parsed = kind === 'datetime' && param.keyword === 'today'
            ? promote(now('date', ctx.clock), 'datetime')
            : now(kind, ctx.clock)
        return { parsed, label: param.keyword === 'today' ? 'hoje' : 'agora' }
    }
    if (param.literal) {
        const literalKind = detectLiteralKind(param.literal)
        const parsed = promote(parseByKind(param.literal, literalKind), kind)
        if (!parsed) return ctx.configError(`Data "${param.literal}" incompatível com o campo (${kind}). Use formato ISO.`)
        return { parsed, label: formatBr(parsed) }
    }
    const other = ctx.other(param.ref)
    if (isEmptyValue(other.value)) return { skip: true }
    const parsed = promote(parseValue(other.value, other.dateKind || kind, other.dateFormat), kind)
    if (!parsed) return { skip: true }
    return { parsed, label: other.label }
}

function compareRule(test) {
    return {
        params: [{ name: 'target', type: 'date-or-field' }],
        validate(value, ctx) {
            const kind = kindOf(ctx)
            const parsed = parseValue(value, kind, ctx.field.dateFormat)
            if (!parsed) return { valid: false, rule: 'date', variant: kind === 'date' ? null : kind }
            const target = resolveComparand(ctx.params.target, ctx)
            if (target.skip) return true
            return test(parsed.key, target.parsed.key) || { valid: false, vars: { other: target.label } }
        },
    }
}

export default {
    date: {
        params: [{ name: 'kind', type: 'enum', values: DATE_KINDS, optional: true }],
        validate(value, ctx) {
            const kind = ctx.params.kind || kindOf(ctx)
            return parseValue(value, kind, ctx.field.dateFormat) ? true : { valid: false, variant: kind === 'date' ? null : kind }
        },
    },
    before: compareRule((a, b) => a < b),
    after: compareRule((a, b) => a > b),
    before_or_equal: compareRule((a, b) => a <= b),
    after_or_equal: compareRule((a, b) => a >= b),
    date_between: {
        params: [{ name: 'start', type: 'date-or-field' }, { name: 'end', type: 'date-or-field' }],
        validate(value, ctx) {
            const kind = kindOf(ctx)
            const parsed = parseValue(value, kind, ctx.field.dateFormat)
            if (!parsed) return { valid: false, rule: 'date', variant: kind === 'date' ? null : kind }
            const start = resolveComparand(ctx.params.start, ctx)
            const end = resolveComparand(ctx.params.end, ctx)
            if (start.skip || end.skip) return true
            const ok = parsed.key >= start.parsed.key && parsed.key <= end.parsed.key
            return ok || { valid: false, vars: { min: start.label, max: end.label } }
        },
    },
}
