import { textLength, toArray } from '../lib/utils.js'
import { parseDecimal, compareDecimal } from '../lib/decimal.js'

/**
 * min/max/between/length mudam de semântica conforme o campo:
 *  - campo numérico (type=number, máscara numérica ou regra numeric/integer/decimal): valor
 *  - valor em lista (select múltiplo, grupo de checkbox): quantidade de itens
 *  - demais: comprimento em code points
 */
export function measure(value, field) {
    if (Array.isArray(value)) return { mode: 'array', size: value.length }
    if (field.numeric) return { mode: 'numeric', size: String(value).trim() }
    return { mode: 'text', size: textLength(value) }
}

function bound(op, key) {
    return {
        params: [{ name: key, type: 'number' }],
        validate(value, ctx) {
            if (ctx.field.kind === 'file') return ctx.configError(`Use files_${key} ou file_${key} em campos de arquivo, não "${key}".`)
            const { mode, size } = measure(value, ctx.field)
            const limit = ctx.params[key]
            const vars = { [key]: limit }
            if (mode === 'numeric') {
                const cmp = compareDecimal(size, limit)
                if (cmp === null) return { valid: false, rule: 'numeric' }
                return op(cmp) ? true : { valid: false, variant: 'numeric', vars }
            }
            const cmp = compareDecimal(String(size), limit)
            return op(cmp) ? true : { valid: false, variant: mode === 'array' ? 'array' : null, vars }
        },
    }
}

const EMAIL_STRICT = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
const EMAIL_LOOSE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

const LETTERS = /^[\p{L}\p{M}]+$/u
const LETTERS_SPACES = /^[\p{L}\p{M}][\p{L}\p{M} '-]*$/u
const ALNUM = /^[\p{L}\p{M}\p{Nd}]+$/u
const ALNUM_SPACES = /^[\p{L}\p{M}\p{Nd}][\p{L}\p{M}\p{Nd} '-]*$/u

const textOnly = fn => (value, ctx) => (Array.isArray(value) || typeof value === 'object' ? ctx.configError(`A regra "${ctx.rule.name}" se aplica a texto.`) : fn(String(value), ctx))

function listVars(values) {
    return { allowed: values.join(', ') }
}

export default {
    min: bound(cmp => cmp >= 0, 'min'),
    max: bound(cmp => cmp <= 0, 'max'),
    between: {
        params: [{ name: 'min', type: 'number' }, { name: 'max', type: 'number' }],
        validate(value, ctx) {
            if (ctx.field.kind === 'file') return ctx.configError('Use files_min/files_max em campos de arquivo.')
            const { mode, size } = measure(value, ctx.field)
            const { min, max } = ctx.params
            const vars = { min, max }
            const lo = compareDecimal(String(size), min)
            const hi = compareDecimal(String(size), max)
            if (lo === null || hi === null) return { valid: false, rule: 'numeric' }
            return lo >= 0 && hi <= 0 ? true : { valid: false, variant: mode === 'text' ? null : mode, vars }
        },
    },
    length: {
        params: [{ name: 'length', type: 'integer' }],
        validate(value, ctx) {
            const size = Array.isArray(value) ? value.length : textLength(value)
            return size === ctx.params.length ? true : { valid: false, variant: Array.isArray(value) ? 'array' : null, vars: { length: ctx.params.length } }
        },
    },
    min_length: {
        params: [{ name: 'min', type: 'integer' }],
        validate: textOnly((value, ctx) => textLength(value) >= ctx.params.min || { valid: false, vars: { min: ctx.params.min } }),
    },
    max_length: {
        params: [{ name: 'max', type: 'integer' }],
        validate: textOnly((value, ctx) => textLength(value) <= ctx.params.max || { valid: false, vars: { max: ctx.params.max } }),
    },
    email: {
        params: [{ name: 'mode', type: 'enum', values: ['strict', 'loose'], optional: true }],
        validate: textOnly((value, ctx) => {
            const text = value.trim()
            if (text.length > 254) return false
            return (ctx.params.mode === 'loose' ? EMAIL_LOOSE : EMAIL_STRICT).test(text)
        }),
    },
    url: {
        params: [],
        rest: { name: 'schemes', type: 'string' },
        validate: textOnly((value, ctx) => {
            const schemes = ctx.params.schemes?.length ? ctx.params.schemes : ['http', 'https']
            let url
            try {
                url = new URL(value.trim())
            } catch {
                return false
            }
            if (!schemes.includes(url.protocol.replace(/:$/, ''))) return false
            return schemes.some(s => s !== 'http' && s !== 'https') || url.hostname.length > 0
        }),
    },
    pattern: {
        validate: textOnly((value, ctx) => {
            const regex = ctx.pattern()
            if (value.length > ctx.config.patternMaxInput) return false
            regex.lastIndex = 0
            return regex.test(value)
        }),
    },
    alpha: {
        params: [{ name: 'mode', type: 'enum', values: ['spaces'], optional: true }],
        validate: textOnly((value, ctx) => (ctx.params.mode === 'spaces' ? LETTERS_SPACES : LETTERS).test(value.trim())),
    },
    alphanumeric: {
        params: [{ name: 'mode', type: 'enum', values: ['spaces'], optional: true }],
        validate: textOnly((value, ctx) => (ctx.params.mode === 'spaces' ? ALNUM_SPACES : ALNUM).test(value.trim())),
    },
    digits: {
        params: [{ name: 'length', type: 'integer', optional: true }],
        validate: textOnly((value, ctx) => {
            if (!/^[0-9]+$/.test(value)) return false
            if (ctx.params.length != null && value.length !== ctx.params.length) return { valid: false, variant: 'length', vars: { length: ctx.params.length } }
            return true
        }),
    },
    starts_with: {
        rest: { name: 'values', type: 'string', min: 1 },
        validate: textOnly((value, ctx) => ctx.params.values.some(v => value.startsWith(v)) || { valid: false, vars: listVars(ctx.params.values) }),
    },
    ends_with: {
        rest: { name: 'values', type: 'string', min: 1 },
        validate: textOnly((value, ctx) => ctx.params.values.some(v => value.endsWith(v)) || { valid: false, vars: listVars(ctx.params.values) }),
    },
    contains: {
        rest: { name: 'values', type: 'string', min: 1 },
        validate: textOnly((value, ctx) => ctx.params.values.every(v => value.includes(v)) || { valid: false, vars: listVars(ctx.params.values) }),
    },
    in: {
        rest: { name: 'values', type: 'string', min: 1 },
        validate(value, ctx) {
            const items = toArray(value).map(String)
            return items.every(v => ctx.params.values.includes(v)) || { valid: false, vars: listVars(ctx.params.values) }
        },
    },
    not_in: {
        rest: { name: 'values', type: 'string', min: 1 },
        validate(value, ctx) {
            const items = toArray(value).map(String)
            return items.every(v => !ctx.params.values.includes(v)) || { valid: false, vars: listVars(ctx.params.values) }
        },
    },
}

export { parseDecimal }
