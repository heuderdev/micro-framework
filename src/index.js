import * as registry from './core/registry.js'
import { configure, resetGlobalConfig, OPTION_SPECS, globalOption } from './core/config.js'
import { FormController, getController, controllerForElement } from './core/controller.js'
import { services, setMaskProvider, setChunkService } from './core/services.js'
import { EVENTS } from './core/events.js'
import { DEFAULT_MESSAGES } from './core/messages.js'
import { ConfigError, OperationalError, StateError, SerializationError, AbortError, AlpineFormError } from './core/errors.js'
import { registerBuiltinValidators } from './validators/index.js'
import { registerBuiltinNormalizers } from './core/normalizers.js'
import { xhrTransport } from './transport/xhr.js'
import { fetchTransport } from './transport/fetch.js'
import { defaultResponseAdapter, laravelResponseAdapter, joomlaResponseAdapter, parseBody, normalizeErrors } from './transport/response.js'
import { defaultRemoteAdapter } from './core/remote.js'
import { createDefaultAdapter, DefaultUiAdapter, DEFAULT_CLASSES } from './ui/default-adapter.js'
import { inspectImage } from './files/image-inspector.js'
import { parseRules, tokenize } from './core/rule-parser.js'
import { parseSize, formatBytes } from './lib/size.js'
import { compareDecimal, toFixedScale } from './lib/decimal.js'
import { withRetry, backoffDelay } from './transport/retry.js'

export const VERSION = '1.0.0'

function registerBuiltins() {
    registerBuiltinValidators()
    registerBuiltinNormalizers()
    const add = (kind, name, value, fn) => {
        if (!registry.has(kind, name)) fn(name, value)
    }
    add('transport', 'xhr', xhrTransport, registry.registerTransport)
    add('transport', 'fetch', fetchTransport, registry.registerTransport)
    add('responseAdapter', 'default', defaultResponseAdapter, registry.registerResponseAdapter)
    add('responseAdapter', 'laravel', laravelResponseAdapter, registry.registerResponseAdapter)
    add('responseAdapter', 'joomla', joomlaResponseAdapter, registry.registerResponseAdapter)
    add('remoteAdapter', 'default', defaultRemoteAdapter, registry.registerRemoteAdapter)
    add('uiAdapter', 'default', createDefaultAdapter, registry.registerUiAdapter)
    add('fileInspector', 'image', { inspect: inspectImage }, registry.registerFileInspector)
}

registerBuiltins()

/** Console permitido para este form? Respeita data-form-log no form e AlpineForm.configure({ log }). */
function canLog(form) {
    const attr = form?.getAttribute?.('data-form-log')
    return (attr ?? globalOption('log')) !== 'none'
}

/** Lista (e avisa no console) formulários x-form sem controlador. Executado uma vez após alpine:initialized. */
function diagnoseUninitialized() {
    const missing = []
    for (const form of document.querySelectorAll('form[x-form]')) {
        if (!getController(form)) {
            missing.push(form)
            if (canLog(form)) console.warn('[AlpineForm] <form x-form> não foi inicializado. O Alpine só processa elementos dentro de um componente: adicione x-data ao <form> ou a um ancestral (e verifique x-ignore).', form)
        }
    }
    return missing
}

/**
 * Plugin Alpine: registra a diretiva x-form e a mágica $form.
 * Usa apenas APIs públicas: Alpine.directive, Alpine.magic, Alpine.reactive, Alpine.nextTick.
 */
export function AlpineFormPlugin(Alpine) {
    services.Alpine = Alpine
    Alpine.directive('form', (el, { expression }, { evaluate, cleanup }) => {
        try {
            const options = expression ? evaluate(expression) : {}
            const controller = new FormController(el, options, { reactive: Alpine.reactive, nextTick: cb => Alpine.nextTick(cb) })
            cleanup(() => controller.destroy())
        } catch (error) {
            if ((error?.kind === 'state')) {
                if (canLog(el)) console.warn('[AlpineForm]', error.message, el)
                return
            }
            el.setAttribute('data-form-state', 'config-error')
            if (canLog(el)) console.error('[AlpineForm]', error.message, el)
        }
    })
    Alpine.magic('form', el => controllerForElement(el)?.state ?? null)
    for (const setup of registry.getAlpineSetups()) setup(Alpine)
    if (typeof document !== 'undefined') document.addEventListener('alpine:initialized', diagnoseUninitialized, { once: true })
}

export const AlpineForm = {
    version: VERSION,
    plugin: AlpineFormPlugin,
    configure,
    resetConfig: resetGlobalConfig,
    options: OPTION_SPECS,
    validator: registry.registerValidator,
    normalizer: registry.registerNormalizer,
    mask: registry.registerMask,
    transport: registry.registerTransport,
    responseAdapter: registry.registerResponseAdapter,
    remoteAdapter: registry.registerRemoteAdapter,
    uiAdapter: registry.registerUiAdapter,
    fileInspector: registry.registerFileInspector,
    component: registry.registerComponent,
    fieldAttributes: registry.registerFieldAttributes,
    formHook: registry.registerFormHook,
    /** Módulos registram diretivas/mágicas do Alpine; roda na hora se o Alpine já estiver instalado. */
    alpine(setup) {
        registry.registerAlpineSetup(setup)
        if (services.Alpine) setup(services.Alpine)
        return AlpineForm
    },
    registry: { get: registry.get, has: registry.has, names: registry.names, unregister: registry.unregister },
    use(plugin) {
        registry.usePlugin(plugin, AlpineForm)
        return AlpineForm
    },
    /** Estado/API pública de um formulário já inicializado (elemento ou id). */
    get(formOrId) {
        const form = typeof formOrId === 'string' ? document.getElementById(formOrId) : formOrId
        if (form && form.tagName !== 'FORM') return null
        return form ? getController(form)?.state ?? null : null
    },
    /** Inicialização manual (sem diretiva). Com o plugin instalado, o estado é reativo pelo Alpine. */
    attach(form, options = {}) {
        const Alpine = services.Alpine
        const controller = new FormController(form, options, Alpine ? { reactive: Alpine.reactive, nextTick: cb => Alpine.nextTick(cb) } : {})
        return controller.state
    },
    diagnose: diagnoseUninitialized,
    internals: { setMaskProvider, setChunkService, services, getController, parseRules, tokenize, parseBody, normalizeErrors, withRetry, backoffDelay, DefaultUiAdapter, DEFAULT_CLASSES, globalOption },
    utils: { parseSize, formatBytes, compareDecimal, toFixedScale },
    events: EVENTS,
    messages: DEFAULT_MESSAGES,
    errors: { AlpineFormError, ConfigError, OperationalError, StateError, SerializationError, AbortError },
}

export { ConfigError, OperationalError, StateError, SerializationError, AbortError, EVENTS, DEFAULT_MESSAGES }
export default AlpineFormPlugin
