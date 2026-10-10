import { ConfigError } from './errors.js'
import { parseSize } from '../lib/size.js'
import { isPlainObject } from '../lib/utils.js'

/**
 * Contrato de configuração.
 * Precedência (menor -> maior):
 *   defaults < AlpineForm.configure() < objeto do x-form < atributos data-form-* do <form>
 *   e, para opções herdáveis de campo:
 *   ... < atributo no ancestral mais próximo dentro do form (grupo) < atributo no próprio campo
 */
export const OPTION_SPECS = {
    validation: { attr: 'data-form-validation', type: 'enum', values: ['live', 'input', 'blur', 'change', 'submit'], default: 'live', inherit: true },
    debounce: { attr: 'data-form-debounce', type: 'duration', default: 200, max: 60000, inherit: true },
    errors: { attr: 'data-form-errors', type: 'enum', values: ['first', 'all'], default: 'first', inherit: true },
    showValid: { attr: 'data-form-show-valid', type: 'bool', default: false, inherit: true },
    hidden: { attr: 'data-form-hidden', type: 'enum', values: ['validate', 'skip'], default: 'validate', inherit: true },
    serverErrors: { attr: 'data-form-server-errors', type: 'enum', values: ['clear-on-change', 'keep'], default: 'clear-on-change', inherit: true },
    dateFormat: { attr: 'data-form-date-format', type: 'enum', values: ['iso', 'br'], default: 'iso', inherit: true },

    ui: { attr: 'data-form-ui', type: 'string', default: 'default' },
    summary: { attr: 'data-form-summary', type: 'enum', values: ['general', 'all', 'none'], default: 'general' },
    focus: { attr: 'data-form-focus', type: 'enum', values: ['first', 'none'], default: 'first' },
    scroll: { attr: 'data-form-scroll', type: 'enum', values: ['smooth', 'instant', 'none'], default: 'smooth' },
    transport: { attr: 'data-form-transport', type: 'string', default: 'xhr' },
    encoding: { attr: 'data-form-encoding', type: 'enum', values: ['multipart', 'urlencoded', 'json'], default: 'multipart' },
    jsonFiles: { attr: 'data-form-json-files', type: 'enum', values: ['error', 'metadata'], default: 'error' },
    nesting: { attr: 'data-form-nesting', type: 'enum', values: ['brackets', 'dots', 'flat'], default: 'brackets' },
    timeout: { attr: 'data-form-timeout', type: 'duration', default: 0, max: 24 * 3600 * 1000 },
    credentials: { attr: 'data-form-credentials', type: 'enum', values: ['same-origin', 'include', 'omit'], default: 'same-origin' },
    endpoint: { attr: 'data-form-endpoint', type: 'string', default: null },
    method: { attr: 'data-form-method', type: 'enum', values: ['get', 'post', 'put', 'patch', 'delete'], default: null },
    responseAdapter: { attr: 'data-form-response-adapter', type: 'string', default: 'default' },
    resetOnSuccess: { attr: 'data-form-reset-on-success', type: 'bool', default: false },
    redirect: { attr: 'data-form-redirect', type: 'enum', values: ['none', 'response'], default: 'none' },
    redirectOrigins: { attr: 'data-form-redirect-origins', type: 'list', default: [] },
    idempotency: { attr: 'data-form-idempotency', type: 'bool', default: false },
    jobUrl: { attr: 'data-form-job-url', type: 'string', default: null },
    jobCancelUrl: { attr: 'data-form-job-cancel-url', type: 'string', default: null },
    jobInterval: { attr: 'data-form-job-interval', type: 'duration', default: 1500, min: 250, max: 600000 },
    jobMaxInterval: { attr: 'data-form-job-max-interval', type: 'duration', default: 10000, min: 250, max: 3600000 },
    jobTimeout: { attr: 'data-form-job-timeout', type: 'duration', default: 600000, max: 24 * 3600 * 1000 },
    jobPersist: { attr: 'data-form-job-persist', type: 'bool', default: false },
    debug: { attr: 'data-form-debug', type: 'bool', default: false },
    // "none": a biblioteca não escreve nada no console (ambientes regulados); prevalece sobre debug
    log: { attr: 'data-form-log', type: 'enum', values: ['errors', 'none'], default: 'errors' },
    // "none": nada é gravado em localStorage/sessionStorage (desativa chunk-persist e job-persist)
    storage: { attr: 'data-form-storage', type: 'enum', values: ['allow', 'none'], default: 'allow' },
}

export const NON_ATTRIBUTE_DEFAULTS = {
    headers: {},
    csrf: { meta: 'csrf-token', header: 'X-CSRF-TOKEN' },
    messages: {},
    locale: 'pt-BR',
    remote: { debounce: 400, timeout: 8000, cache: 20, cacheTtl: 60000, method: 'post', inconclusive: 'allow', retries: 1 },
    files: { duplicates: 'ignore', preview: true, append: false, previewMaxBytes: 20 * 1024 * 1024 },
    patternMaxLength: 500,
    patternMaxInput: 2000,
    hooks: {},
    clock: null,
}

const globalConfig = { options: {}, extra: {} }

export function configure(options = {}) {
    if (!isPlainObject(options)) throw new ConfigError('AlpineForm.configure() espera um objeto simples.')
    for (const [key, value] of Object.entries(options)) {
        if (key in OPTION_SPECS) globalConfig.options[key] = validateOption(key, value, 'AlpineForm.configure')
        else if (key in NON_ATTRIBUTE_DEFAULTS) globalConfig.extra[key] = mergeExtra(key, globalConfig.extra[key], value)
        else throw new ConfigError(`Opção global desconhecida: "${key}".`)
    }
}

/** Valor global (configure() ou padrão) de uma opção, para código que roda fora de um formulário. */
export function globalOption(key) {
    return key in globalConfig.options ? globalConfig.options[key] : OPTION_SPECS[key]?.default
}

export function resetGlobalConfig() {
    globalConfig.options = {}
    globalConfig.extra = {}
}

function mergeExtra(key, current, value) {
    const base = current ?? NON_ATTRIBUTE_DEFAULTS[key]
    if (isPlainObject(base) && isPlainObject(value)) return { ...base, ...value }
    return value
}

export function parseBool(raw, attr) {
    if (raw === '' || raw === 'true' || raw === attr) return true
    if (raw === 'false') return false
    throw new ConfigError(`Valor booleano inválido em ${attr}="${raw}". Use o atributo sem valor, "true" ou "false".`, { attr })
}

export function parseInteger(raw, attr, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const text = String(raw).trim()
    if (!/^-?\d+$/.test(text)) throw new ConfigError(`Número inteiro inválido em ${attr}="${raw}".`, { attr })
    const value = Number(text)
    if (value < min || value > max) throw new ConfigError(`${attr}="${raw}" fora do intervalo permitido (${min} a ${max}).`, { attr })
    return value
}

/** "250", "250ms", "2s", "1.5s", "2min" -> milissegundos */
export function parseDuration(raw, attr, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const text = String(raw).trim()
    const match = /^(\d+(?:\.\d+)?)\s*(ms|s|min)?$/.exec(text)
    if (!match) throw new ConfigError(`Duração inválida em ${attr}="${raw}". Use 250, 250ms, 2s ou 1min.`, { attr })
    const factor = match[2] === 's' ? 1000 : match[2] === 'min' ? 60000 : 1
    const value = Math.round(Number(match[1]) * factor)
    if (value < min || value > max) throw new ConfigError(`${attr}="${raw}" fora do intervalo permitido (${min}ms a ${max}ms).`, { attr })
    return value
}

export function parseList(raw) {
    return String(raw).split(',').map(s => s.trim()).filter(Boolean)
}

export function parseOptionValue(spec, raw, attr) {
    switch (spec.type) {
        case 'bool': return parseBool(raw, attr)
        case 'int': return parseInteger(raw, attr, spec)
        case 'duration': return parseDuration(raw, attr, spec)
        case 'size': return parseSize(raw)
        case 'list': return parseList(raw)
        case 'enum': {
            const value = String(raw).trim().toLowerCase()
            if (!spec.values.includes(value)) {
                throw new ConfigError(`Valor "${raw}" inválido em ${attr}. Valores aceitos: ${spec.values.join(', ')}.`, { attr })
            }
            return value
        }
        default: {
            const value = String(raw).trim()
            if (!value) throw new ConfigError(`${attr} não pode ser vazio.`, { attr })
            return value
        }
    }
}

function validateOption(key, value, source) {
    const spec = OPTION_SPECS[key]
    if (value === null && spec.default === null) return null
    if (typeof value === 'string' || (spec.type !== 'list' && typeof value !== 'boolean' && typeof value !== 'number')) {
        return parseOptionValue(spec, value, `${source}.${key}`)
    }
    if (spec.type === 'bool' && typeof value !== 'boolean') throw new ConfigError(`${source}.${key} deve ser booleano.`)
    if ((spec.type === 'int' || spec.type === 'duration') && !Number.isFinite(value)) throw new ConfigError(`${source}.${key} deve ser numérico.`)
    if (spec.type === 'list') {
        if (!Array.isArray(value)) throw new ConfigError(`${source}.${key} deve ser uma lista.`)
        return [...value]
    }
    return value
}

/** Lê a configuração efetiva de um formulário. */
export function readFormConfig(form, jsOptions = {}) {
    if (jsOptions != null && !isPlainObject(jsOptions)) throw new ConfigError('A expressão de x-form deve resultar em um objeto simples.')
    const config = {}
    for (const [key, spec] of Object.entries(OPTION_SPECS)) {
        let value = spec.default
        if (key in globalConfig.options) value = globalConfig.options[key]
        if (jsOptions && key in jsOptions) value = validateOption(key, jsOptions[key], 'x-form')
        if (form.hasAttribute(spec.attr)) value = parseOptionValue(spec, form.getAttribute(spec.attr), spec.attr)
        config[key] = value
    }
    for (const key of Object.keys(NON_ATTRIBUTE_DEFAULTS)) {
        let value = globalConfig.extra[key] ?? NON_ATTRIBUTE_DEFAULTS[key]
        if (jsOptions && key in jsOptions) value = mergeExtra(key, value, jsOptions[key])
        config[key] = value
    }
    if (jsOptions) {
        for (const key of Object.keys(jsOptions)) {
            if (!(key in OPTION_SPECS) && !(key in NON_ATTRIBUTE_DEFAULTS)) throw new ConfigError(`Opção desconhecida em x-form: "${key}".`)
        }
    }
    config.headers = { ...config.headers, ...readDotAttributes(form, 'data-form-header.') }
    return config
}

/** Atributos com ponto (data-form-msg.required) são lidos explicitamente, nunca via dataset. */
export function readDotAttributes(el, prefix) {
    const out = {}
    for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith(prefix)) {
            const key = attr.name.slice(prefix.length)
            if (!key) throw new ConfigError(`Atributo "${attr.name}" sem sufixo.`, { attr: attr.name })
            out[key] = attr.value
        }
    }
    return out
}

/**
 * Resolve opção herdável para um controle: campo -> ancestral mais próximo dentro do form -> form.
 * Controles associados pelo atributo form fora da árvore herdam apenas do próprio elemento e do form.
 */
export function resolveFieldOption(controls, form, formConfig, key) {
    const spec = OPTION_SPECS[key]
    for (const control of controls) {
        if (control.hasAttribute(spec.attr)) return parseOptionValue(spec, control.getAttribute(spec.attr), spec.attr)
    }
    const first = controls[0]
    if (first && form.contains(first)) {
        let node = first.parentElement
        while (node && node !== form) {
            if (node.hasAttribute(spec.attr)) return parseOptionValue(spec, node.getAttribute(spec.attr), spec.attr)
            node = node.parentElement
        }
    }
    return formConfig[key]
}

export function getGlobalExtra(key) {
    return globalConfig.extra[key] ?? NON_ATTRIBUTE_DEFAULTS[key]
}
