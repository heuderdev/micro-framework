import { ConfigError } from './errors.js'
import * as registry from './registry.js'
import { parseSize, formatBytes, isBinaryUnit } from '../lib/size.js'
import { parseDecimal } from '../lib/decimal.js'

/**
 * Gramática de data-form-v:
 *   regras     := regra ("|" regra)*
 *   regra      := nome (":" parametro ("," parametro)*)?
 *   escape     := "\|" | "\:" | "\," | "\\"
 * Espaços em volta de nomes e parâmetros são removidos.
 * Regra vazia, desconhecida ou repetida gera ConfigError (nunca é ignorada).
 */
export const MAX_RULES_LENGTH = 2000
const SPECIAL = new Set(['|', ':', ',', '\\'])
const RULE_NAME_RE = /^[a-z][a-z0-9_]*$/

export function tokenize(source) {
    const text = String(source ?? '')
    if (text.length > MAX_RULES_LENGTH) throw new ConfigError(`data-form-v excede ${MAX_RULES_LENGTH} caracteres.`)
    const rules = []
    let current = { name: null, params: [], buffer: '' }
    let escaped = false
    const pushBuffer = () => {
        if (current.name === null) current.name = current.buffer
        else current.params.push(current.buffer)
        current.buffer = ''
    }
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (escaped) {
            if (!SPECIAL.has(ch)) throw new ConfigError(`Escape inválido "\\${ch}" em data-form-v="${text}". Escapes aceitos: \\| \\: \\, \\\\`)
            current.buffer += ch
            escaped = false
            continue
        }
        if (ch === '\\') {
            escaped = true
            continue
        }
        if (ch === '|') {
            pushBuffer()
            rules.push(current)
            current = { name: null, params: [], buffer: '' }
            continue
        }
        if (ch === ':' && current.name === null) {
            current.name = current.buffer
            current.buffer = ''
            current.hasParams = true
            continue
        }
        if (ch === ',' && current.name !== null) {
            current.params.push(current.buffer)
            current.buffer = ''
            continue
        }
        current.buffer += ch
    }
    if (escaped) throw new ConfigError(`data-form-v="${text}" termina com "\\" sem caractere escapado.`)
    pushBuffer()
    rules.push(current)

    if (rules.length === 1 && rules[0].name.trim() === '' && !rules[0].hasParams) return []
    return rules.map((rule, index) => {
        const name = rule.name.trim()
        if (!name) throw new ConfigError(`Regra vazia na posição ${index + 1} de data-form-v="${text}".`)
        return { name, args: rule.params.map(p => p.trim()), hasParams: !!rule.hasParams }
    })
}

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
    for (let j = 1; j <= b.length; j++) dp[0][j] = j
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        }
    }
    return dp[a.length][b.length]
}

export function suggestRule(name) {
    let best = null
    let bestDistance = Infinity
    for (const candidate of registry.names('validator')) {
        const distance = levenshtein(name, candidate)
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
        }
    }
    return bestDistance <= 2 ? best : null
}

const DATE_KEYWORDS = new Set(['today', 'now'])
const DATE_LITERAL = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?)?$|^\d{2}:\d{2}(:\d{2})?$|^\d{4}-W\d{2}$/

/** Converte um argumento textual conforme o tipo declarado pelo validador. */
export function convertParam(type, raw, ruleName, spec = {}) {
    const fail = msg => {
        throw new ConfigError(`Parâmetro inválido "${raw}" na regra "${ruleName}": ${msg}`, { rule: ruleName })
    }
    if (raw === '' && type !== 'string-or-empty') fail('parâmetro vazio.')
    switch (type) {
        case 'number': {
            if (!parseDecimal(raw)) fail('esperado número com ponto decimal, ex.: 10 ou 0.01.')
            return raw
        }
        case 'integer': {
            if (!/^\d+$/.test(raw)) fail('esperado inteiro não negativo.')
            const value = Number(raw)
            if (!Number.isSafeInteger(value)) fail('inteiro grande demais.')
            if (spec.min != null && value < spec.min) fail(`mínimo ${spec.min}.`)
            return value
        }
        case 'size': {
            try {
                return { bytes: parseSize(raw), text: formatBytes(parseSize(raw), { binary: isBinaryUnit(raw) }) }
            } catch (error) {
                fail(error.message)
            }
            break
        }
        case 'field':
            if (!/^[^\s]+$/.test(raw)) fail('referência de campo não pode conter espaços.')
            return { ref: raw }
        case 'date-or-field':
            if (DATE_KEYWORDS.has(raw)) return { keyword: raw }
            if (DATE_LITERAL.test(raw)) return { literal: raw }
            if (/^[^\s]+$/.test(raw)) return { ref: raw }
            return fail('esperado data ISO, "today", "now" ou nome de campo.')
        case 'enum':
            if (!spec.values.includes(raw)) fail(`valores aceitos: ${spec.values.join(', ')}.`)
            return raw
        case 'ratio': {
            const m = /^(\d+(?:\.\d+)?)(?:[/:](\d+(?:\.\d+)?))?$/.exec(raw)
            if (!m) fail('esperado proporção como 16/9, 4:3 ou 1.5.')
            const value = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])
            if (!(value > 0)) fail('proporção deve ser positiva.')
            return { value, text: raw }
        }
        case 'dimensions': {
            const m = /^(\d+)x(\d+)$/i.exec(raw)
            if (!m) fail('esperado LARGURAxALTURA, ex.: 800x600.')
            return { width: Number(m[1]), height: Number(m[2]), text: raw }
        }
        case 'string':
        case 'string-or-empty':
        default:
            return raw
    }
}

/**
 * Converte argumentos segundo o esquema: params fixos [{name,type,optional}] e "rest" variádico opcional.
 */
export function convertArgs(def, ruleName, args, hasParams) {
    const fixed = def.params || []
    const rest = def.rest || null
    const values = {}
    const positional = []
    const refs = []
    const required = fixed.filter(p => !p.optional).length
    if (hasParams && args.length === 0) throw new ConfigError(`A regra "${ruleName}" foi declarada com ":" mas sem parâmetros.`)
    if (args.length < required) {
        throw new ConfigError(`A regra "${ruleName}" exige ${required} parâmetro(s): ${fixed.map(p => p.name).join(', ')}.`, { rule: ruleName })
    }
    if (!rest && args.length > fixed.length) {
        throw new ConfigError(`A regra "${ruleName}" aceita no máximo ${fixed.length} parâmetro(s), recebeu ${args.length}.`, { rule: ruleName })
    }
    fixed.forEach((spec, index) => {
        if (index >= args.length) return
        const converted = convertParam(spec.type, args[index], ruleName, spec)
        values[spec.name] = converted
        positional.push(converted)
        if (converted && typeof converted === 'object' && converted.ref) refs.push(converted.ref)
    })
    if (rest) {
        const extra = args.slice(fixed.length)
        if (extra.length < (rest.min ?? 0)) throw new ConfigError(`A regra "${ruleName}" exige ao menos ${rest.min} valor(es) em ${rest.name}.`, { rule: ruleName })
        const converted = extra.map(arg => convertParam(rest.type || 'string', arg, ruleName, rest))
        values[rest.name] = converted
        positional.push(...converted)
        for (const c of converted) if (c && typeof c === 'object' && c.ref) refs.push(c.ref)
    }
    return { values, positional, refs }
}

/**
 * Interpreta data-form-v em uma lista ordenada de regras.
 * Retorna { rules, presence, others } onde presence são regras que rodam mesmo com valor vazio.
 */
export function parseRules(source) {
    const tokens = tokenize(source)
    const seen = new Set()
    const rules = []
    for (const token of tokens) {
        if (!RULE_NAME_RE.test(token.name)) {
            throw new ConfigError(`Nome de regra inválido "${token.name}". Use minúsculas, números e "_".`, { rule: token.name })
        }
        if (seen.has(token.name)) throw new ConfigError(`Regra "${token.name}" repetida em data-form-v.`, { rule: token.name })
        seen.add(token.name)
        const def = registry.get('validator', token.name)
        if (!def) {
            const suggestion = suggestRule(token.name)
            throw new ConfigError(
                `Regra desconhecida "${token.name}"${suggestion ? `. Você quis dizer "${suggestion}"?` : '.'}`,
                { rule: token.name, suggestion },
            )
        }
        const { values, positional, refs } = convertArgs(def, token.name, token.args, token.hasParams)
        rules.push({ name: token.name, def, args: token.args, params: values, positional, refs })
    }
    if (seen.has('required') && (seen.has('optional') || seen.has('nullable'))) {
        throw new ConfigError('Combinação contraditória: "required" com "optional"/"nullable".')
    }
    return rules
}

const MAX_PATTERN_FLAGS = /^[imsu]*$/

/** Compila data-form-pattern com limites. Regex vem do HTML do desenvolvedor, nunca de entrada do usuário. */
export function compilePattern(source, flags = '', maxLength = 500) {
    if (source == null) throw new ConfigError('A regra "pattern" exige o atributo data-form-pattern.')
    if (source.length === 0) throw new ConfigError('data-form-pattern está vazio.')
    if (source.length > maxLength) throw new ConfigError(`data-form-pattern excede ${maxLength} caracteres.`)
    if (!MAX_PATTERN_FLAGS.test(flags) || new Set(flags).size !== flags.length) {
        throw new ConfigError(`data-form-pattern-flags="${flags}" inválido. Flags aceitas: i, m, s, u (sem g/y).`)
    }
    try {
        return new RegExp(source, flags)
    } catch (error) {
        throw new ConfigError(`Expressão regular inválida em data-form-pattern: ${error.message}`)
    }
}
