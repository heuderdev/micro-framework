import { registerNormalizer, get, has } from './registry.js'
import { ConfigError } from './errors.js'

/**
 * Normalizadores transformam o valor canônico usado na validação e no envio.
 * Não alteram o valor exibido no input. Não se aplicam a senhas nem arquivos.
 * Sintaxe: data-form-normalize="trim|lowercase" ou "decimal:pt-BR".
 */
function decimalFromLocale(value, locale = 'pt-BR') {
    const text = String(value ?? '').trim()
    if (text === '') return ''
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
    const group = parts.find(p => p.type === 'group')?.value ?? ''
    const decimal = parts.find(p => p.type === 'decimal')?.value ?? '.'
    let body = text.replace(/\s| | /g, '')
    if (group) body = body.split(group).join('')
    if (decimal !== '.') body = body.replace(decimal, '.')
    return /^[+-]?\d+(\.\d+)?$/.test(body) ? body : text
}

const BUILTIN = {
    trim: value => (typeof value === 'string' ? value.trim() : value),
    lowercase: value => (typeof value === 'string' ? value.toLowerCase() : value),
    uppercase: value => (typeof value === 'string' ? value.toUpperCase() : value),
    digits: value => (typeof value === 'string' ? value.replace(/\D+/g, '') : value),
    collapse_spaces: value => (typeof value === 'string' ? value.replace(/\s+/g, ' ') : value),
    decimal: (value, { args }) => decimalFromLocale(value, args[0] || 'pt-BR'),
}

export function registerBuiltinNormalizers() {
    for (const [name, fn] of Object.entries(BUILTIN)) if (!has('normalizer', name)) registerNormalizer(name, fn)
}

export function parseNormalizers(source) {
    if (!source) return []
    return source.split('|').map(part => part.trim()).filter(Boolean).map(part => {
        const [name, ...rest] = part.split(':')
        const fn = get('normalizer', name.trim())
        if (!fn) throw new ConfigError(`Normalizador desconhecido "${name}" em data-form-normalize.`)
        const args = rest.length ? rest.join(':').split(',').map(s => s.trim()) : []
        return { name: name.trim(), fn, args }
    })
}

export function applyNormalizers(value, normalizers, context) {
    let out = value
    for (const n of normalizers) {
        out = Array.isArray(out) ? out.map(v => n.fn(v, { ...context, args: n.args })) : n.fn(out, { ...context, args: n.args })
    }
    return out
}
