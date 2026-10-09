import { ConfigError } from './errors.js'

const stores = {
    validator: new Map(),
    normalizer: new Map(),
    mask: new Map(),
    transport: new Map(),
    responseAdapter: new Map(),
    remoteAdapter: new Map(),
    uiAdapter: new Map(),
    fileInspector: new Map(),
    component: new Map(),
}

const fieldAttributes = new Set()
const fieldAttributePrefixes = new Set()
const formHooks = []
const plugins = new Set()

const NAME_RE = /^[a-z][a-z0-9_-]*$/i

function register(kind, name, definition, { replace = false } = {}) {
    if (!NAME_RE.test(name)) throw new ConfigError(`Nome inválido para ${kind}: "${name}". Use letras, números, "_" ou "-".`)
    const store = stores[kind]
    if (store.has(name) && !replace) {
        throw new ConfigError(`${kind} "${name}" já registrado. Use { replace: true } para substituir conscientemente.`)
    }
    store.set(name, definition)
    return definition
}

export function registerValidator(name, definition, options) {
    if (typeof definition === 'function') definition = { validate: definition }
    if (!definition || typeof definition.validate !== 'function') {
        throw new ConfigError(`Validador "${name}" precisa de uma função validate(value, ctx).`)
    }
    return register('validator', name, { name, params: [], presence: false, async: false, ...definition }, options)
}

export function registerNormalizer(name, fn, options) {
    if (typeof fn !== 'function') throw new ConfigError(`Normalizador "${name}" precisa ser uma função.`)
    return register('normalizer', name, fn, options)
}

export function registerMask(name, factory, options) {
    if (typeof factory !== 'function') throw new ConfigError(`Máscara "${name}" precisa ser uma fábrica (config) => mask.`)
    return register('mask', name, factory, options)
}

export function registerTransport(name, fn, options) {
    if (typeof fn !== 'function') throw new ConfigError(`Transporte "${name}" precisa ser uma função.`)
    return register('transport', name, fn, options)
}

export function registerResponseAdapter(name, fn, options) {
    if (typeof fn !== 'function') throw new ConfigError(`Adaptador de resposta "${name}" precisa ser uma função.`)
    return register('responseAdapter', name, fn, options)
}

export function registerRemoteAdapter(name, fn, options) {
    if (typeof fn !== 'function') throw new ConfigError(`Adaptador remoto "${name}" precisa ser uma função.`)
    return register('remoteAdapter', name, fn, options)
}

export function registerUiAdapter(name, factory, options) {
    if (typeof factory !== 'function') throw new ConfigError(`Adaptador de UI "${name}" precisa ser uma fábrica (ctx) => adapter.`)
    return register('uiAdapter', name, factory, options)
}

export function registerFileInspector(name, definition, options) {
    if (typeof definition === 'function') definition = { inspect: definition }
    if (!definition || typeof definition.inspect !== 'function') throw new ConfigError(`Inspetor "${name}" precisa de inspect(file, ctx).`)
    return register('fileInspector', name, definition, options)
}

export function registerComponent(name, definition, options) {
    const required = ['getValue', 'setValue', 'subscribe']
    for (const method of required) {
        if (!definition || typeof definition[method] !== 'function') {
            throw new ConfigError(`Adaptador de componente "${name}" precisa implementar ${required.join(', ')}.`)
        }
    }
    return register('component', name, definition, options)
}

export function get(kind, name) {
    return stores[kind].get(name)
}

export function has(kind, name) {
    return stores[kind].has(name)
}

export function names(kind) {
    return Array.from(stores[kind].keys())
}

export function unregister(kind, name) {
    return stores[kind].delete(name)
}

/** Extensões declaram os atributos de campo que interpretam, para que erros de digitação sejam detectados. */
export function registerFieldAttributes(list = [], prefixes = []) {
    for (const attr of list) fieldAttributes.add(attr)
    for (const prefix of prefixes) fieldAttributePrefixes.add(prefix)
}

export function isKnownFieldAttribute(name) {
    if (fieldAttributes.has(name)) return true
    for (const prefix of fieldAttributePrefixes) if (name.startsWith(prefix)) return true
    return false
}

/** Ganchos executados para cada formulário criado (usados por módulos opcionais como chunks). */
export function registerFormHook(hook) {
    formHooks.push(hook)
    return () => {
        const index = formHooks.indexOf(hook)
        if (index >= 0) formHooks.splice(index, 1)
    }
}

export function getFormHooks() {
    return formHooks.slice()
}

export function usePlugin(plugin, api) {
    if (typeof plugin !== 'function') throw new ConfigError('AlpineForm.use() espera uma função (AlpineForm) => void.')
    if (plugins.has(plugin)) return
    plugins.add(plugin)
    plugin(api)
}
