import { parseDecimal, compareDecimal, isMultipleOf, decimalScale } from '../lib/decimal.js'

/**
 * Regras numéricas operam sobre a string canônica ("-1234.56"), nunca sobre Number,
 * para evitar perda de precisão em valores monetários.
 * Separador decimal aceito: ponto. Para "1.234,56" use máscara numérica ou data-form-normalize="decimal".
 */
const asText = value => (typeof value === 'number' ? String(value) : String(value ?? '').trim())
const isNumeric = value => parseDecimal(asText(value)) !== null

function numeric(fn) {
    return (value, ctx) => {
        const text = asText(value)
        if (!isNumeric(text)) return { valid: false, rule: 'numeric' }
        return fn(text, ctx)
    }
}

export default {
    numeric: { validate: value => isNumeric(value) },
    integer: { validate: value => /^[+-]?\d+$/.test(asText(value)) },
    decimal: {
        params: [{ name: 'a', type: 'integer' }, { name: 'b', type: 'integer', optional: true }],
        validate: numeric((text, ctx) => {
            const scale = decimalScale(text)
            const { a, b } = ctx.params
            if (b == null) return scale <= a || { valid: false, vars: { max: a } }
            return (scale >= a && scale <= b) || { valid: false, variant: 'range', vars: { min: a, max: b } }
        }),
    },
    positive: { validate: numeric(text => compareDecimal(text, '0') > 0) },
    negative: { validate: numeric(text => compareDecimal(text, '0') < 0) },
    min_value: {
        params: [{ name: 'min', type: 'number' }],
        validate: numeric((text, ctx) => compareDecimal(text, ctx.params.min) >= 0 || { valid: false, vars: { min: ctx.params.min } }),
    },
    max_value: {
        params: [{ name: 'max', type: 'number' }],
        validate: numeric((text, ctx) => compareDecimal(text, ctx.params.max) <= 0 || { valid: false, vars: { max: ctx.params.max } }),
    },
    multiple_of: {
        params: [{ name: 'step', type: 'number' }],
        validate: numeric((text, ctx) => {
            const result = isMultipleOf(text, ctx.params.step)
            if (result === null) return ctx.configError('multiple_of exige passo diferente de zero.')
            return result || { valid: false, vars: { step: ctx.params.step } }
        }),
    },
}

export { isNumeric }
