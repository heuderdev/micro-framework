import { isCpf, isCnpj, isCep, phoneType, luhn, normalizeCnpj } from '../lib/br.js'

const text = value => String(value ?? '')

export default {
    cpf: { validate: value => isCpf(text(value)) },
    cnpj: {
        params: [{ name: 'mode', type: 'enum', values: ['numeric'], optional: true }],
        validate: (value, ctx) => isCnpj(text(value), { alphanumeric: ctx.params.mode !== 'numeric' }),
    },
    cpf_cnpj: {
        validate(value) {
            const clean = normalizeCnpj(value)
            return clean.length === 11 ? isCpf(text(value)) : isCnpj(text(value))
        },
    },
    cep: { validate: value => isCep(text(value)) },
    telefone: {
        params: [{ name: 'type', type: 'enum', values: ['celular', 'fixo'], optional: true }],
        validate(value, ctx) {
            const type = phoneType(text(value))
            if (!type) return { valid: false, variant: ctx.params.type || null }
            if (ctx.params.type && type !== ctx.params.type) return { valid: false, variant: ctx.params.type }
            return true
        },
    },
    luhn: { validate: value => luhn(text(value)) },
}
