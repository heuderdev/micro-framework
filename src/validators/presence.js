import { isEmptyValue, toArray } from '../lib/utils.js'

function requiredVariant(field) {
    switch (field.kind) {
        case 'radio':
        case 'select':
            return 'choice'
        case 'checkbox-group':
        case 'select-multiple':
            return 'multiple'
        case 'checkbox':
            return 'checkbox'
        case 'file':
            return 'file'
        default:
            return null
    }
}

export function fieldIsEmpty(value, field) {
    if (field?.kind === 'file') return toArray(value).length + (field.existingCount || 0) === 0
    return isEmptyValue(value)
}

function matchesAny(otherValue, values) {
    const list = toArray(otherValue).map(v => (typeof v === 'boolean' ? String(v) : v))
    if (list.length === 0) return values.includes('') || values.includes('null')
    return list.some(v => values.includes(String(v)))
}

const requirePresence = (value, ctx) => (fieldIsEmpty(value, ctx.field) ? { valid: false, variant: requiredVariant(ctx.field) } : true)

export default {
    required: {
        presence: true,
        validate: requirePresence,
    },
    optional: { presence: true, validate: () => true },
    nullable: { presence: true, validate: () => true },
    accepted: {
        presence: true,
        validate(value, ctx) {
            if (ctx.field.kind === 'checkbox') return ctx.field.checked === true
            const accepted = ['1', 'on', 'yes', 'sim', 'true']
            return accepted.includes(String(value ?? '').trim().toLowerCase())
        },
    },
    required_if: {
        presence: true,
        params: [{ name: 'other', type: 'field' }],
        rest: { name: 'values', type: 'string-or-empty', min: 1 },
        validate(value, ctx) {
            const other = ctx.other(ctx.params.other.ref)
            if (!matchesAny(other.value, ctx.params.values)) return true
            return requirePresence(value, ctx)
        },
    },
    required_unless: {
        presence: true,
        params: [{ name: 'other', type: 'field' }],
        rest: { name: 'values', type: 'string-or-empty', min: 1 },
        validate(value, ctx) {
            const other = ctx.other(ctx.params.other.ref)
            if (matchesAny(other.value, ctx.params.values)) return true
            return requirePresence(value, ctx)
        },
    },
    required_with: {
        presence: true,
        params: [],
        rest: { name: 'others', type: 'field', min: 1 },
        validate(value, ctx) {
            const present = ctx.params.others.find(o => !fieldIsEmpty(ctx.other(o.ref).value, ctx.other(o.ref)))
            if (!present) return true
            const result = requirePresence(value, ctx)
            return result === true ? true : { valid: false, vars: { other: ctx.other(present.ref).label } }
        },
    },
    required_without: {
        presence: true,
        params: [],
        rest: { name: 'others', type: 'field', min: 1 },
        validate(value, ctx) {
            const missing = ctx.params.others.find(o => fieldIsEmpty(ctx.other(o.ref).value, ctx.other(o.ref)))
            if (!missing) return true
            const result = requirePresence(value, ctx)
            return result === true ? true : { valid: false, vars: { other: ctx.other(missing.ref).label } }
        },
    },
}
