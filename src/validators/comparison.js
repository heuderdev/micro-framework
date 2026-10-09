import { compareDecimal, parseDecimal } from '../lib/decimal.js'
import { parseByKind } from '../lib/date.js'
import { isEmptyValue, valuesEqual } from '../lib/utils.js'

/**
 * Compara com outro campo do mesmo formulário.
 * Ordem de tentativa: datas (quando o campo tem tipo de data) -> decimais -> não comparável.
 * Se o outro campo está vazio, regras de ordem passam (a obrigatoriedade do outro campo é dele).
 */
function orderOf(value, other, ctx) {
    if (ctx.field.dateKind) {
        const a = parseByKind(String(value ?? ''), ctx.field.dateKind, ctx.field.dateFormat)
        const b = parseByKind(String(other.value ?? ''), other.dateKind || ctx.field.dateKind, other.dateFormat)
        if (a && b) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
        return null
    }
    if (parseDecimal(String(value ?? '').trim()) && parseDecimal(String(other.value ?? '').trim())) {
        return compareDecimal(String(value).trim(), String(other.value).trim())
    }
    return null
}

function ordered(test) {
    return {
        params: [{ name: 'other', type: 'field' }],
        validate(value, ctx) {
            const other = ctx.other(ctx.params.other.ref)
            if (isEmptyValue(other.value)) return true
            const cmp = orderOf(value, other, ctx)
            if (cmp === null) return { valid: false, vars: { other: other.label } }
            return test(cmp) || { valid: false, vars: { other: other.label } }
        },
    }
}

export default {
    same: {
        params: [{ name: 'other', type: 'field' }],
        validate(value, ctx) {
            const other = ctx.other(ctx.params.other.ref)
            return valuesEqual(value, other.value) || { valid: false, vars: { other: other.label } }
        },
    },
    different: {
        params: [{ name: 'other', type: 'field' }],
        validate(value, ctx) {
            const other = ctx.other(ctx.params.other.ref)
            return !valuesEqual(value, other.value) || { valid: false, vars: { other: other.label } }
        },
    },
    greater_than: ordered(cmp => cmp > 0),
    greater_or_equal: ordered(cmp => cmp >= 0),
    less_than: ordered(cmp => cmp < 0),
    less_or_equal: ordered(cmp => cmp <= 0),
}
