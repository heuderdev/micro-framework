import { ConfigError, StateError, OperationalError, AbortError, isAbort, isConfigError, isSerializationError } from './errors.js'
import { readFormConfig } from './config.js'
import { Field } from './field.js'
import { FileManager } from '../files/file-manager.js'
import { RemoteValidator } from './remote.js'
import { resolveMessage, safeValuePlaceholder, DEFAULT_MESSAGES, interpolate } from './messages.js'
import { fieldIsEmpty } from '../validators/presence.js'
import * as registry from './registry.js'
import { services } from './services.js'
import { dispatch, EVENTS } from './events.js'
import { collectEntries, toFormData, toUrlSearchParams, toJsonObject, entriesSnapshot } from './serializer.js'
import { nameToKey, normalizeErrorKey } from '../lib/paths.js'
import { uid, randomId, debounce, sleep, valuesEqual, prefersReducedMotion, isPlainObject, cssEscape } from '../lib/utils.js'
import { ProgressTracker, emptyProgress } from '../transport/progress.js'
import { isCrossOrigin } from '../transport/xhr.js'
import { JobPoller, saveJob, loadJob, clearJob } from '../jobs/poller.js'
import { ProgressUi } from '../ui/progress-ui.js'
import { formId, formElements, formReset, formRequestSubmit } from '../lib/dom.js'

const controllers = new WeakMap()
const MANAGED_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA'])
const SKIP_TYPES = new Set(['submit', 'button', 'reset', 'image'])
const CHOICE_KINDS = new Set(['select', 'select-multiple', 'checkbox', 'checkbox-group', 'radio', 'file', 'component'])
const ACTIVE_PHASES = new Set(['validating', 'uploading', 'paused', 'awaiting', 'processing'])
const OBSERVED_ATTRIBUTES = ['name', 'disabled', 'type', 'multiple', 'form', 'data-form-v', 'data-form-mask', 'data-form-mask-pattern', 'data-form-remote', 'data-form-ignore', 'data-form-label', 'data-form-validation', 'data-form-hidden', 'data-form-submit-value', 'data-form-normalize', 'data-form-pattern']

export function getController(form) {
    return controllers.get(form) || null
}

/** Resolve o formulário de um elemento: ancestral form[x-form]/controlado, atributo form, ou data-form-for. */
export function controllerForElement(el) {
    if (!el) return null
    if (el.tagName === 'FORM' && controllers.has(el)) return controllers.get(el)
    const owner = el.form instanceof HTMLFormElement ? el.form : el.closest?.('form')
    if (owner && controllers.has(owner)) return controllers.get(owner)
    const marker = el.closest?.('[data-form-for]')
    if (marker) {
        const target = document.getElementById(marker.getAttribute('data-form-for'))
        if (target && controllers.has(target)) return controllers.get(target)
    }
    return null
}

function initialState() {
    return {
        ready: false,
        phase: 'idle',
        pristine: true,
        dirty: false,
        validating: false,
        submitting: false,
        uploading: false,
        awaitingResponse: false,
        processing: false,
        paused: false,
        success: false,
        canceled: false,
        failed: false,
        submitted: false,
        submitCount: 0,
        progress: emptyProgress(),
        errors: {},
        generalErrors: [],
        configErrors: [],
        result: null,
        error: null,
        status: '',
        job: null,
        uploads: {},
        fields: {},
    }
}

/**
 * Controlador de um formulário. Um por <form x-form>; estado isolado; nenhum dado em store global.
 */
export class FormController {
    constructor(form, options = {}, env = {}) {
        if (!(form instanceof HTMLFormElement)) throw new ConfigError('x-form deve ser usado em um elemento <form>.')
        if (form.parentElement?.closest('form')) {
            throw new ConfigError('Formulário aninhado dentro de outro <form> detectado. HTML não permite formulários aninhados; use o atributo form="id" nos controles ou separe os formulários.')
        }
        if (controllers.has(form)) throw new StateError('Este formulário já foi inicializado pelo AlpineForm.')
        this.form = form
        this.env = { reactive: x => x, nextTick: cb => setTimeout(cb, 0), ...env }
        this.uid = uid('af')
        this.config = readFormConfig(form, options || {})
        this.services = services
        this.fields = new Map()
        this.controlIndex = new Map()
        this.dependents = new Map()
        this.cleanups = []
        this.externalCleanups = new Map()
        this.destroyed = false
        this.submission = null
        this.poller = null
        this.tracker = new ProgressTracker()
        this.pendingRefresh = null
        this.dirtyConfigControls = new Set()
        this.allowNativeOnce = false
        this.idempotency = null
        this.lastSubmitSnapshot = null

        this.state = this.env.reactive(Object.assign(initialState(), this.publicMethods()))
        const uiFactory = registry.get('uiAdapter', this.config.ui)
        if (!uiFactory) throw new ConfigError(`Adaptador de UI "${this.config.ui}" não registrado.`)
        this.ui = uiFactory({ form, uid: this.uid, controller: this })
        this.progressUi = new ProgressUi(this)
        this.extensions = registry.getFormHooks().map(hook => hook(this)).filter(Boolean)

        controllers.set(form, this)
        this.installListeners()
        this.observe()
        this.env.nextTick(() => this.initialize())
    }

    publicMethods() {
        const c = this
        return {
            validate: () => c.validate(),
            validateField: name => c.validateFieldByName(name),
            submit: options => c.submit(options),
            cancel: () => c.cancel(),
            reset: () => c.reset(),
            resetValidation: () => c.resetValidation(),
            setValue: (name, value, options) => c.setValue(name, value, options),
            getValue: (name, options) => c.getValue(name, options),
            getValues: options => c.getValues(options),
            setErrors: (errors, options) => c.setErrors(errors, options),
            clearErrors: name => c.clearErrors(name),
            refresh: () => c.refresh(),
            destroy: () => c.destroy(),
            addFiles: (name, files) => c.addFiles(name, files),
            removeFile: (name, id) => c.removeFile(name, id),
            removeExisting: (name, id, removed) => c.removeExisting(name, id, removed),
            pauseUpload: name => c.callExtension('pauseUpload', name),
            resumeUpload: name => c.callExtension('resumeUpload', name),
            getUploadSession: name => c.callExtensionSync('getUploadSession', name),
            cancelJob: () => c.cancelJob(),
            clearRemoteCache: name => c.clearRemoteCache(name),
            field: name => c.resolveField(name)?.state ?? null,
            has: name => !!c.resolveField(name),
            hasError: name => (c.resolveField(name)?.state.errors.length ?? 0) > 0,
            firstError: name => c.resolveField(name)?.state.errors[0] ?? null,
            diagnostics: () => c.diagnostics(),
        }
    }

    log(level, ...args) {
        if (level === 'error' || this.config.debug) console[level]('[AlpineForm]', ...args)
    }

    initialize() {
        if (this.destroyed) return
        this.refresh()
        this.state.ready = true
        this.updateAggregate()
        this.resumePersistedJob()
        dispatch(this.form, EVENTS.ready, { form: this.form, fields: Array.from(this.fields.keys()) })
    }

    /* ------------------------------------------------------------------ descoberta */

    isManageable(el) {
        if (!MANAGED_TAGS.has(el.tagName)) return false
        if (el.tagName === 'INPUT' && SKIP_TYPES.has((el.getAttribute('type') || 'text').toLowerCase())) return false
        if (el.hasAttribute('data-form-ignore')) return false
        return true
    }

    discover() {
        const configErrors = []
        const byName = new Map()
        for (const el of formElements(this.form)) {
            if (!this.isManageable(el)) continue
            const name = el.getAttribute('name')
            if (!name) {
                if (el.hasAttribute('data-form-v')) configErrors.push({ field: null, message: 'Campo com data-form-v sem atributo name: não será validado nem enviado.', element: el })
                continue
            }
            if (!byName.has(name)) byName.set(name, [])
            byName.get(name).push(el)
        }
        for (const el of Array.from(this.form.querySelectorAll('[data-form-component]'))) {
            const name = el.getAttribute('data-form-name')
            if (!name) {
                configErrors.push({ field: null, message: 'data-form-component exige data-form-name.', element: el })
                continue
            }
            if (!byName.has(name)) byName.set(name, [])
            byName.get(name).push(el)
        }
        const groups = []
        for (const [name, list] of byName) {
            const typeOf = el => (el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : el.tagName.toLowerCase())
            const radios = list.filter(el => typeOf(el) === 'radio')
            const checkboxes = list.filter(el => typeOf(el) === 'checkbox')
            const hiddens = list.filter(el => typeOf(el) === 'hidden')
            let rest = list
            if (radios.length) {
                groups.push({ name, key: nameToKey(name), controls: radios, companions: hiddens })
                rest = list.filter(el => !radios.includes(el) && !hiddens.includes(el))
            } else if (checkboxes.length) {
                groups.push({ name, key: nameToKey(name), controls: checkboxes, companions: hiddens })
                rest = list.filter(el => !checkboxes.includes(el) && !hiddens.includes(el))
            }
            if (rest.length === 1 && rest.length === list.length) {
                groups.push({ name, key: nameToKey(name), controls: rest, companions: [] })
            } else if (rest.length) {
                const base = nameToKey(name)
                rest.forEach((el, index) => groups.push({ name, key: `${base}.${index}`, controls: [el], companions: [] }))
            }
        }
        return { groups, configErrors }
    }

    fieldForControl(el) {
        return this.controlIndex.get(el) || null
    }

    resolveField(nameOrKey) {
        if (nameOrKey == null) return null
        if (typeof nameOrKey === 'object' && nameOrKey instanceof Field) return nameOrKey
        const text = String(nameOrKey)
        if (this.fields.has(text)) return this.fields.get(text)
        const key = nameToKey(text)
        if (this.fields.has(key)) return this.fields.get(key)
        for (const field of this.fields.values()) if (field.name === text) return field
        return null
    }

    componentFields() {
        return Array.from(this.fields.values()).filter(f => f.kind === 'component')
    }

    /** Sincroniza campos com o DOM atual. Idempotente; preserva estado de campos que continuam presentes. */
    refresh() {
        if (this.destroyed) return []
        const { groups, configErrors } = this.discover()
        const seen = new Set()
        const keys = new Set()
        for (const group of groups) {
            let field = null
            for (const control of group.controls) {
                const existing = this.controlIndex.get(control)
                if (existing && !seen.has(existing)) {
                    field = existing
                    break
                }
            }
            if (keys.has(group.key)) {
                configErrors.push({ field: group.key, message: `Mais de um campo resulta na chave "${group.key}". Renomeie para evitar ambiguidade.` })
                continue
            }
            keys.add(group.key)
            if (!field) {
                field = this.createField(group)
            } else {
                const controlsChanged = !valuesEqualList(field.controls, group.controls)
                const keyChanged = field.key !== group.key
                const configDirty = group.controls.some(c => this.dirtyConfigControls.has(c))
                if (keyChanged) this.rekeyField(field, group.key)
                field.name = group.name
                if (controlsChanged) {
                    for (const control of field.controls) if (this.controlIndex.get(control) === field) this.controlIndex.delete(control)
                    field.controls = group.controls
                    field.companions = group.companions
                    for (const control of group.controls) this.controlIndex.set(control, field)
                }
                if (controlsChanged || keyChanged || configDirty) this.reconfigureField(field)
            }
            seen.add(field)
        }
        for (const field of Array.from(this.fields.values())) {
            if (!seen.has(field)) this.destroyField(field)
        }
        this.dirtyConfigControls.clear()
        for (const field of this.fields.values()) {
            if (field.configError) configErrors.push({ field: field.key, message: field.configError.message })
        }
        this.state.configErrors = configErrors.map(e => ({ field: e.field, message: e.message }))
        for (const error of configErrors) this.log('error', error.message, error.element || this.resolveField(error.field)?.primary || '')
        if (configErrors.length) dispatch(this.form, EVENTS.configError, { errors: this.state.configErrors })
        this.rebuildDependencies()
        this.bindExternalControls()
        this.progressUi.refresh()
        this.bindExternalUi()
        for (const field of this.fields.values()) if (field.files) this.renderFiles(field)
        this.renderProgress()
        this.updateAggregate()
        return Array.from(this.fields.keys())
    }

    createField(group) {
        const field = new Field(this, group)
        for (const control of group.controls) this.controlIndex.set(control, field)
        this.fields.set(field.key, field)
        this.state.fields[field.key] = {
            key: field.key,
            name: field.name,
            label: field.name,
            kind: field.kind,
            value: null,
            filled: false,
            initialValue: null,
            touched: false,
            dirty: false,
            validated: false,
            validating: false,
            localErrors: [],
            serverErrors: [],
            errors: [],
            valid: false,
            invalid: false,
            remote: 'idle',
            configError: null,
            disabled: false,
            files: [],
            existing: [],
        }
        field.state = this.state.fields[field.key]
        this.setupField(field)
        field.snapshotInitial()
        field.state.initialValue = this.publicValue(field, field.initialDisplay)
        this.syncFieldValue(field)
        dispatch(this.form, EVENTS.fieldAdded, { field: field.key, name: field.name })
        return field
    }

    setupField(field) {
        field.configure()
        if (field.kind === 'file' && !field.files) {
            const attr = n => field.groupAttribute(n)
            const filesCfg = this.config.files
            const append = attr('data-form-files-append')
            const duplicates = attr('data-form-files-duplicates') || filesCfg.duplicates
            const preview = attr('data-form-preview')
            if (!['ignore', 'allow'].includes(duplicates)) {
                field.configError = field.configError || new ConfigError('data-form-files-duplicates deve ser "ignore" ou "allow".')
            }
            field.files = new FileManager(field, {
                append: append !== null ? append !== 'false' : filesCfg.append,
                duplicates,
                preview: preview !== null ? preview !== 'false' : filesCfg.preview,
                previewMaxBytes: filesCfg.previewMaxBytes,
                removeName: attr('data-form-existing-remove-name'),
            })
            field.files.fromInput()
        }
        field.remote?.clearCache()
        field.remote = null
        if (!field.configError && field.groupAttribute('data-form-remote') !== null) {
            try {
                field.remote = new RemoteValidator(field, {
                    config: this.config,
                    transport: (...args) => this.transportFor('remote')(...args),
                    headersFor: () => this.securityHeaders(),
                })
            } catch (error) {
                if (!isConfigError(error)) throw error
                field.configError = error
            }
        }
        if (field.kind === 'component' && field.component && !field.unsubscribe) {
            const unsubscribe = field.component.subscribe(field.primary, () => this.handleValueChange(field, 'change'))
            field.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : () => {}
        }
        field.debouncer?.cancel()
        field.debouncer = debounce(() => this.validateField(field, { trigger: 'input' }), field.option('debounce'))
        field.state.label = field.label || field.name
        field.state.kind = field.kind
        field.state.configError = field.configError ? field.configError.message : null
        if (field.configError) {
            field.state.localErrors = [this.message(field, '__config')]
            field.state.validated = true
            this.composeErrors(field)
        }
        this.renderField(field)
    }

    reconfigureField(field) {
        const wasMasked = field.mask
        wasMasked?.destroy?.()
        field.mask = null
        this.setupField(field)
        if (field.state.validated && !field.configError) this.validateField(field, { trigger: 'refresh' })
    }

    rekeyField(field, newKey) {
        const state = this.state.fields[field.key]
        delete this.state.fields[field.key]
        delete this.state.errors[field.key]
        this.fields.delete(field.key)
        field.key = newKey
        state.key = newKey
        this.state.fields[newKey] = state
        field.state = this.state.fields[newKey]
        this.fields.set(newKey, field)
        if (field.state.errors.length) this.state.errors[newKey] = field.state.errors.slice()
    }

    destroyField(field) {
        field.unsubscribe?.()
        field.unsubscribe = null
        field.debouncer?.cancel()
        field.abort?.abort()
        field.runToken += 1
        field.mask?.destroy?.()
        field.files?.destroy()
        field.remote?.clearCache()
        this.ui.removeField(field)
        this.externalCleanups.get(field)?.()
        this.externalCleanups.delete(field)
        for (const control of field.controls) if (this.controlIndex.get(control) === field) this.controlIndex.delete(control)
        if (this.fields.get(field.key) === field) {
            this.fields.delete(field.key)
            delete this.state.fields[field.key]
            delete this.state.errors[field.key]
        }
        dispatch(this.form, EVENTS.fieldRemoved, { field: field.key, name: field.name })
    }

    rebuildDependencies() {
        this.dependents = new Map()
        for (const field of this.fields.values()) {
            for (const ref of field.refs || []) {
                const target = this.resolveField(ref)
                if (!target) continue
                if (!this.dependents.has(target)) this.dependents.set(target, new Set())
                this.dependents.get(target).add(field)
            }
            for (const ref of field.remote?.extraFields || []) {
                const target = this.resolveField(ref)
                if (!target) continue
                if (!this.dependents.has(target)) this.dependents.set(target, new Set())
                this.dependents.get(target).add(field)
            }
        }
    }

    /** Ciclos (ex.: a same:b e b same:a) são permitidos; a propagação é de um nível e não entra em laço. */
    dependencyCycles() {
        const cycles = []
        const visit = (node, path) => {
            for (const next of this.dependents.get(node) || []) {
                const index = path.indexOf(next)
                if (index >= 0) {
                    cycles.push([...path.slice(index), next].map(f => f.key))
                    continue
                }
                if (path.length < 50) visit(next, [...path, next])
            }
        }
        for (const field of this.fields.values()) visit(field, [field])
        const unique = new Map()
        for (const cycle of cycles) unique.set([...new Set(cycle)].sort().join('|'), cycle)
        return Array.from(unique.values())
    }

    diagnostics() {
        return {
            configErrors: this.state.configErrors.slice(),
            cycles: this.dependencyCycles(),
            fields: Array.from(this.fields.values()).map(f => ({ key: f.key, name: f.name, kind: f.kind, rules: f.rules.map(r => r.name), mask: f.mask?.name ?? null, remote: !!f.remote, refs: Array.from(f.refs || []) })),
        }
    }

    /* ------------------------------------------------------------------ listeners */

    on(target, type, handler, options) {
        target.addEventListener(type, handler, options)
        return () => target.removeEventListener(type, handler, options)
    }

    installListeners() {
        const form = this.form
        const handlers = this.controlHandlers()
        for (const [type, handler, options] of handlers) this.cleanups.push(this.on(form, type, handler, options))
        this.cleanups.push(this.on(form, 'submit', e => this.onSubmit(e)))
        this.cleanups.push(this.on(form, 'reset', e => this.onNativeReset(e)))
        this.cleanups.push(this.on(form, 'click', e => this.onClick(e)))
        this.cleanups.push(this.on(form, 'dragover', e => this.onDrag(e, true)))
        this.cleanups.push(this.on(form, 'dragleave', e => this.onDrag(e, false)))
        this.cleanups.push(this.on(form, 'drop', e => this.onDrop(e)))
    }

    controlHandlers() {
        return [
            ['beforeinput', e => this.onBeforeInput(e), true],
            ['input', e => this.onMaskInput(e), true],
            ['input', e => this.onInput(e), false],
            ['change', e => this.onChange(e), false],
            ['focusout', e => this.onBlur(e), false],
            ['compositionstart', e => this.onComposition(e, true), false],
            ['compositionend', e => this.onComposition(e, false), false],
        ]
    }

    /** Controles associados pelo atributo form fora da árvore do <form> recebem listeners próprios. */
    bindExternalControls() {
        for (const field of this.fields.values()) {
            const external = field.controls.filter(c => !this.form.contains(c))
            if (!external.length) {
                this.externalCleanups.get(field)?.()
                this.externalCleanups.delete(field)
                continue
            }
            if (this.externalCleanups.has(field)) continue
            const removers = []
            for (const control of external) {
                for (const [type, handler, options] of this.controlHandlers()) removers.push(this.on(control, type, handler, options))
            }
            this.externalCleanups.set(field, () => removers.forEach(r => r()))
        }
    }

    bindExternalUi() {
        this.externalUiCleanup?.()
        const removers = []
        if (formId(this.form)) {
            for (const root of document.querySelectorAll(`[data-form-for="${cssEscape(formId(this.form))}"]`)) {
                if (this.form.contains(root)) continue
                removers.push(this.on(root, 'click', e => this.onClick(e)))
                removers.push(this.on(root, 'dragover', e => this.onDrag(e, true)))
                removers.push(this.on(root, 'dragleave', e => this.onDrag(e, false)))
                removers.push(this.on(root, 'drop', e => this.onDrop(e)))
            }
        }
        this.externalUiCleanup = () => removers.forEach(r => r())
    }

    observe() {
        if (typeof MutationObserver !== 'function') return
        this.observer = new MutationObserver(records => this.onMutations(records))
        this.observer.observe(this.form, { childList: true, subtree: true, attributes: true, attributeFilter: OBSERVED_ATTRIBUTES })
        for (const control of formElements(this.form)) {
            if (!this.form.contains(control)) this.observer.observe(control, { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES })
        }
    }

    onMutations(records) {
        let relevant = false
        for (const record of records) {
            if (record.type === 'attributes') {
                /* conteúdo gerado pela biblioteca (lista de arquivos, erros, resumo) não reconfigura campos;
                   sem este filtro, o type="button" do "Remover" re-renderizaria a lista em ciclo */
                if (record.target.closest?.('[data-form-generated]')) continue
                /* botões (cancelar, pausar, submit com :disabled) não são campos; o submitter é lido no envio */
                if (record.target.tagName === 'BUTTON') continue
                relevant = true
                if (record.attributeName !== 'name') this.dirtyConfigControls.add(record.target)
                continue
            }
            for (const node of [...record.addedNodes, ...record.removedNodes]) {
                if (node.nodeType !== 1) continue
                if (node.hasAttribute('data-form-generated') || node.closest?.('[data-form-generated]')) continue
                if (MANAGED_TAGS.has(node.tagName) || node.hasAttribute('data-form-component') || node.hasAttribute('data-form-existing') ||
                    node.querySelector?.('input,select,textarea,[data-form-component],[data-form-existing],[data-form-progress],[data-form-status],[data-form-file-list]') ||
                    node.hasAttribute('data-form-file-list') || node.hasAttribute('data-form-progress') || node.hasAttribute('data-form-status')) {
                    relevant = true
                }
            }
        }
        if (!relevant || this.pendingRefresh) return
        this.pendingRefresh = setTimeout(() => {
            this.pendingRefresh = null
            if (this.destroyed) return
            for (const field of this.fields.values()) field.files?.scanExisting()
            this.refresh()
        }, 0)
    }

    targetField(event) {
        const el = event.target
        if (!el || el.nodeType !== 1) return null
        if (el.matches?.('[data-form-component]')) return this.fieldForControl(el)
        return this.fieldForControl(el) || (el.closest ? this.fieldForControl(el.closest('[data-form-component]')) : null)
    }

    onBeforeInput(event) {
        const field = this.targetField(event)
        field?.mask?.handleBeforeInput?.(event)
    }

    onMaskInput(event) {
        const field = this.targetField(event)
        if (!field?.mask) return
        if (event.isComposing || field.composing) return
        field.mask.handleInput(event)
    }

    onComposition(event, active) {
        const field = this.targetField(event)
        if (!field) return
        field.composing = active
        if (!active) {
            field.mask?.handleInput?.(event)
            this.handleValueChange(field, 'input')
        }
    }

    onInput(event) {
        const field = this.targetField(event)
        if (!field || field.kind === 'file') return
        if (event.isComposing || field.composing) return
        this.handleValueChange(field, 'input')
    }

    onChange(event) {
        const field = this.targetField(event)
        if (!field) return
        if (field.kind === 'file') {
            field.files.fromInput()
            this.renderFiles(field)
        }
        if (field.mask) field.mask.handleChange?.(event)
        this.handleValueChange(field, 'change')
    }

    onBlur(event) {
        const field = this.targetField(event)
        if (!field) return
        if (event.relatedTarget && field.controls.includes(event.relatedTarget)) return
        field.mask?.handleBlur?.(event)
        const mode = field.option('validation')
        field.state.touched = true
        if (mode === 'live' || mode === 'blur' || mode === 'input') {
            field.debouncer.cancel()
            this.validateField(field, { trigger: 'blur' })
        }
    }

    onClick(event) {
        const el = event.target?.closest?.('[data-form-cancel],[data-form-pause],[data-form-resume],[data-form-existing-remove]')
        if (!el) return
        if (el.hasAttribute('data-form-cancel')) {
            event.preventDefault()
            this.cancel()
        } else if (el.hasAttribute('data-form-pause')) {
            event.preventDefault()
            this.callExtension('pauseUpload').catch(error => this.log('error', error))
        } else if (el.hasAttribute('data-form-resume')) {
            event.preventDefault()
            this.callExtension('resumeUpload').catch(error => this.log('error', error))
        } else if (el.hasAttribute('data-form-existing-remove')) {
            event.preventDefault()
            const container = el.closest('[data-form-existing]')
            if (!container) return
            this.removeExisting(container.getAttribute('data-form-existing'), container.getAttribute('data-form-existing-id'))
        }
    }

    dropzoneField(event) {
        const zone = event.target?.closest?.('[data-form-dropzone]')
        if (!zone) return null
        const field = this.resolveField(zone.getAttribute('data-form-dropzone'))
        return field && field.kind === 'file' ? { zone, field } : null
    }

    onDrag(event, over) {
        const target = this.dropzoneField(event)
        if (!target) return
        if (over) event.preventDefault()
        if (!over && target.zone.contains(event.relatedTarget)) return
        this.ui.setDropzoneOver(target.zone, over)
    }

    onDrop(event) {
        const target = this.dropzoneField(event)
        if (!target) return
        event.preventDefault()
        this.ui.setDropzoneOver(target.zone, false)
        const files = event.dataTransfer?.files
        if (files && files.length) this.addFiles(target.field, files)
    }

    /* ------------------------------------------------------------------ valores e estado */

    publicValue(field, display) {
        if (field.sensitive) return null
        if (field.kind === 'file') return (display || []).map(item => ({ id: item.id, name: item.name, size: item.size, type: item.type }))
        return Array.isArray(display) ? display.slice() : display
    }

    syncFieldValue(field) {
        const display = field.readDisplay()
        const state = field.state
        state.value = this.publicValue(field, display)
        state.filled = !fieldIsEmpty(field.kind === 'file' ? display : display, field.infoForValidators())
        state.dirty = field.isDirty()
        state.disabled = field.disabled
        if (field.files) {
            state.files = field.files.snapshot()
            state.existing = field.files.existingSnapshot()
        }
    }

    handleValueChange(field, trigger, { propagate = true, silent = false } = {}) {
        this.syncFieldValue(field)
        if (field.state.serverErrors.length && field.option('serverErrors') === 'clear-on-change') {
            field.state.serverErrors = []
            this.composeErrors(field)
            this.renderField(field)
            this.renderSummary()
        }
        this.updateAggregate()
        if (!silent) {
            dispatch(this.form, EVENTS.change, {
                field: field.key,
                name: field.name,
                value: field.sensitive ? undefined : field.state.value,
                trigger,
            })
        }
        const mode = field.option('validation')
        const choice = CHOICE_KINDS.has(field.kind)
        if (trigger === 'change' && choice) field.state.touched = true
        if (mode === 'live') {
            if (trigger === 'change' && choice) this.validateNow(field, 'change')
            else if (trigger === 'input' && (field.state.touched || field.state.validated)) field.debouncer()
        } else if (mode === 'input') {
            if (trigger === 'input') field.debouncer()
            else if (trigger === 'change') this.validateNow(field, 'change')
        } else if (mode === 'change') {
            if (trigger === 'change') this.validateNow(field, 'change')
        } else if ((mode === 'blur' || mode === 'submit') && field.state.validated && trigger !== 'api') {
            field.debouncer()
        }
        if (propagate) this.propagate(field)
    }

    validateNow(field, trigger) {
        field.debouncer.cancel()
        return this.validateField(field, { trigger })
    }

    /** Revalida dependentes já validados/tocados. Um nível por mudança de valor: ciclos não geram laço. */
    propagate(source, visited = new Set([source])) {
        for (const dependent of this.dependents.get(source) || []) {
            if (visited.has(dependent)) continue
            visited.add(dependent)
            if (dependent.state.validated || dependent.state.touched || this.state.submitted) {
                dependent.remote?.invalidate?.(dependent.validationValue(), this.remoteExtras(dependent))
                this.validateField(dependent, { trigger: 'dependency' })
            }
        }
    }

    updateAggregate() {
        let dirty = false
        let validating = false
        for (const field of this.fields.values()) {
            if (field.state.dirty) dirty = true
            if (field.state.validating) validating = true
        }
        this.state.dirty = dirty
        this.state.pristine = !dirty
        this.state.validating = validating || this.state.phase === 'validating'
    }

    setPhase(phase) {
        this.state.phase = phase
        this.state.submitting = ACTIVE_PHASES.has(phase)
        this.state.uploading = phase === 'uploading' || phase === 'paused'
        this.state.paused = phase === 'paused'
        this.state.awaitingResponse = phase === 'awaiting'
        this.state.processing = phase === 'processing'
        this.state.success = phase === 'success'
        this.state.canceled = phase === 'canceled'
        this.state.failed = phase === 'error'
        if (ACTIVE_PHASES.has(phase)) this.form.setAttribute('aria-busy', 'true')
        else this.form.removeAttribute('aria-busy')
        this.form.setAttribute('data-form-state', phase)
        this.updateAggregate()
        this.renderProgress()
    }

    statusText() {
        const s = this.state
        const m = key => this.formMessage(key, { percent: s.progress.percent ?? '', status: s.result?.status ?? '' })
        switch (s.phase) {
            case 'validating': return m('status.validating')
            case 'uploading': return s.progress.percent == null ? m('status.uploading') : m('status.uploading_percent')
            case 'paused': return m('status.paused')
            case 'awaiting': return m('status.awaiting')
            case 'processing': {
                const job = s.job
                const base = job?.progress != null ? this.formMessage('status.processing_percent', { percent: job.progress }) : m('status.processing')
                return job?.message ? `${base} ${job.message}` : base
            }
            case 'success': return s.result?.message || m('status.success')
            case 'error': return s.error?.message || m('status.error')
            case 'canceled': return s.error?.message || m('status.canceled')
            default: return ''
        }
    }

    renderProgress() {
        this.state.status = this.statusText()
        this.progressUi.render(this.state, this.state.status)
    }

    /* ------------------------------------------------------------------ mensagens */

    formMessage(key, vars = {}) {
        const template = this.config.messages[key] ?? DEFAULT_MESSAGES[key] ?? key
        return interpolate(template, vars)
    }

    message(field, rule, { variant = null, vars = {}, fallback = null } = {}) {
        return resolveMessage({
            rule,
            variant,
            fieldMessages: field.messages || {},
            genericMessage: rule.startsWith('__') || rule.includes('.') || rule === 'pending' ? null : field.genericMessage,
            configMessages: fallback ? { ...this.config.messages, [rule]: this.config.messages[rule] ?? fallback } : this.config.messages,
            vars: { field: field.label || field.name, ...vars },
        })
    }

    ruleVars(field, rule, value) {
        const vars = { value: safeValuePlaceholder(value, field.sensitive) }
        for (const [key, param] of Object.entries(rule.params || {})) {
            if (Array.isArray(param)) vars[key] = param.map(p => (p && typeof p === 'object' ? p.text ?? p.ref ?? p.literal ?? p.keyword : p)).join(', ')
            else if (param && typeof param === 'object') {
                if (param.ref) vars[key] = this.resolveField(param.ref)?.label ?? param.ref
                else vars[key] = param.text ?? param.literal ?? param.keyword ?? ''
            } else vars[key] = param
        }
        if (vars.other == null && rule.refs?.length) vars.other = this.resolveField(rule.refs[0])?.label ?? rule.refs[0]
        if (Array.isArray(rule.params?.values)) vars.allowed = rule.params.values.join(', ')
        return vars
    }

    composeErrors(field) {
        const state = field.state
        state.errors = [...state.localErrors, ...state.serverErrors]
        state.invalid = state.errors.length > 0
        state.valid = state.validated && !state.validating && !state.invalid && state.remote !== 'pending'
        if (state.errors.length) this.state.errors[field.key] = state.errors.slice()
        else delete this.state.errors[field.key]
    }

    /* ------------------------------------------------------------------ validação */

    otherInfo(ref, field) {
        const other = this.resolveField(ref)
        if (!other) throw new ConfigError(`O campo "${field.name}" referencia "${ref}", que não existe neste formulário.`)
        const info = other.infoForValidators()
        return { ...info, value: other.disabled ? null : other.validationValue(), exists: true }
    }

    validationContext(field, rule, signal) {
        const controller = this
        return {
            field: field.infoForValidators(),
            rule,
            params: rule.params,
            signal,
            config: this.config,
            clock: this.config.clock || (() => new Date()),
            other: ref => controller.otherInfo(ref, field),
            attribute: name => field.groupAttribute(name),
            pattern: () => {
                if (!field.patternRegex) throw new ConfigError('A regra "pattern" exige data-form-pattern.')
                return field.patternRegex
            },
            inspect: (name, item) => {
                const inspector = registry.get('fileInspector', name)
                if (!inspector) throw new ConfigError(`Inspetor de arquivo "${name}" não registrado.`)
                return field.files.inspect(name, item, (file, opts) => inspector.inspect(file, { ...opts, field: field.infoForValidators(), attribute: attr => field.groupAttribute(attr) }))
            },
            configError: message => {
                throw new ConfigError(message)
            },
        }
    }

    /** Executa uma regra e normaliza o retorno em null (válido) ou { messages, items }. */
    async runRule(field, rule, value, signal) {
        const ctx = this.validationContext(field, rule, signal)
        let result = rule.def.validate(value, ctx)
        if (result && typeof result.then === 'function') result = await result
        if (result === true || result === undefined || result === null) return null
        if (typeof result === 'string') return { messages: [this.message(field, rule.name, { fallback: result, vars: this.ruleVars(field, rule, value) })], items: [] }
        if (result === false) result = { valid: false }
        if (result.valid === true) return null
        const baseVars = this.ruleVars(field, rule, value)
        const ruleName = result.rule || rule.name
        if (Array.isArray(result.items) && result.items.length) {
            const items = result.items.map(item => ({
                id: item.id,
                message: this.message(field, ruleName, { variant: item.variant ?? result.variant ?? null, vars: { ...baseVars, ...(result.vars || {}), ...(item.vars || {}) }, fallback: result.message }),
            }))
            return { messages: [items[0].message, ...items.slice(1).map(i => i.message)], items }
        }
        return {
            messages: [this.message(field, ruleName, { variant: result.variant ?? null, vars: { ...baseVars, ...(result.vars || {}) }, fallback: result.message })],
            items: [],
        }
    }

    remoteExtras(field) {
        return (field.remote?.extraFields || []).map(ref => {
            const other = this.resolveField(ref)
            return [other ? other.name : ref, other ? other.submitValue() : '']
        })
    }

    /**
     * Valida um campo. Cada execução recebe um token; resultados de execuções antigas são descartados.
     * Ordem: badInput nativo -> regras de presença -> (vazio? encerra) -> regras síncronas -> assíncronas -> remota.
     */
    async validateField(field, { trigger = 'api', snapshotValue, remoteDebounce = true } = {}) {
        if (this.destroyed || !this.fields.has(field.key)) return { valid: true, skipped: true }
        field.abort?.abort()
        const token = ++field.runToken
        const abort = new AbortController()
        field.abort = abort
        const signal = abort.signal
        const state = field.state
        const finish = (localErrors, extra = {}) => {
            if (token !== field.runToken) return { valid: localErrors.length === 0, stale: true }
            state.localErrors = localErrors
            state.validated = true
            state.validating = false
            if (extra.remote) state.remote = extra.remote
            if (field.files) {
                const itemErrors = extra.itemErrors || new Map()
                for (const item of field.files.items) item.errors = itemErrors.get(item.id) || []
                state.files = field.files.snapshot()
                this.renderFiles(field)
            }
            this.composeErrors(field)
            this.updateAggregate()
            this.renderField(field, extra.info)
            if (this.state.submitted) this.renderSummary()
            dispatch(this.form, EVENTS.validated, { field: field.key, valid: !state.invalid, errors: state.errors.slice(), trigger })
            return { valid: state.errors.length === 0, errors: state.errors.slice(), localErrors }
        }

        if (field.configError) return finish([this.message(field, '__config')], { remote: 'idle' })
        if (field.disabled || field.skipped) {
            const result = finish([], { remote: 'idle' })
            state.validated = false
            state.valid = false
            this.renderField(field)
            return { ...result, skipped: true }
        }
        if (field.kind === 'hidden' && !field.rules.length) return finish([])

        const value = snapshotValue !== undefined ? snapshotValue : field.validationValue()
        const info = field.infoForValidators()
        const errorsMode = field.option('errors')
        const errors = []
        const itemErrors = new Map()
        const collect = outcome => {
            errors.push(...(errorsMode === 'first' ? outcome.messages.slice(0, 1) : outcome.messages))
            for (const item of outcome.items) itemErrors.set(item.id, [...(itemErrors.get(item.id) || []), item.message])
        }

        state.validating = true
        this.updateAggregate()
        dispatch(this.form, EVENTS.validating, { field: field.key, trigger })
        try {
            if (field.inputType === 'number' && field.primary.validity?.badInput) {
                return finish([this.message(field, 'numeric')], { remote: 'idle' })
            }
            for (const rule of field.rules.filter(r => r.def.presence)) {
                const outcome = await this.runRule(field, rule, value, signal)
                if (outcome) {
                    collect(outcome)
                    if (errorsMode === 'first') break
                }
            }
            if (errors.length) return finish(errors, { remote: 'idle', itemErrors })
            if (fieldIsEmpty(value, info)) return finish([], { remote: 'idle' })

            const others = field.rules.filter(r => !r.def.presence)
            for (const rule of others.filter(r => !r.def.async)) {
                const outcome = await this.runRule(field, rule, value, signal)
                if (outcome) {
                    collect(outcome)
                    if (errorsMode === 'first') break
                }
            }
            if (!errors.length) {
                for (const rule of others.filter(r => r.def.async)) {
                    if (signal.aborted) return { valid: false, stale: true }
                    const outcome = await this.runRule(field, rule, value, signal)
                    if (outcome) {
                        collect(outcome)
                        if (errorsMode === 'first') break
                    }
                }
            }
            if (errors.length || !field.remote) return finish(errors, { remote: 'idle', itemErrors })
            return await this.runRemote(field, value, { token, signal, trigger, remoteDebounce, finish, itemErrors })
        } catch (error) {
            if (isAbort(error) || signal.aborted) {
                if (token === field.runToken) {
                    state.validating = false
                    this.updateAggregate()
                }
                return { valid: false, stale: true }
            }
            if (isConfigError(error)) {
                field.configError = error
                state.configError = error.message
                this.log('error', `Campo "${field.name}":`, error.message)
                this.state.configErrors = [...this.state.configErrors, { field: field.key, message: error.message }]
                return finish([this.message(field, '__config')], { remote: 'idle' })
            }
            this.log('error', `Falha ao validar "${field.name}":`, error)
            return finish([this.formMessage('remote.error')], { remote: 'idle' })
        }
    }

    async runRemote(field, value, { token, signal, trigger, remoteDebounce, finish, itemErrors }) {
        const remote = field.remote
        const state = field.state
        if (token !== field.runToken) return { valid: false, stale: true }
        state.remote = 'pending'
        state.localErrors = []
        this.composeErrors(field)
        this.renderField(field)
        if (remoteDebounce && (trigger === 'input' || trigger === 'dependency') && remote.debounce > 0) {
            await sleep(remote.debounce, signal)
        }
        const extras = this.remoteExtras(field)
        const result = await remote.validate(value, extras, { signal })
        if (token !== field.runToken || !valuesEqual(field.validationValue(), value)) return { valid: false, stale: true }
        if (result.valid === true) return finish([], { remote: 'valid', itemErrors })
        if (result.valid === false) {
            const message = this.message(field, 'remote', { fallback: result.message || null })
            return finish([message], { remote: 'invalid', itemErrors })
        }
        if (remote.inconclusivePolicy === 'block') return finish([this.message(field, 'remote.error')], { remote: 'inconclusive', itemErrors })
        return finish([], { remote: 'inconclusive', itemErrors, info: this.message(field, 'remote.inconclusive') })
    }

    async validateFieldByName(name) {
        const field = this.resolveField(name)
        if (!field) throw new ConfigError(`Campo "${name}" não encontrado neste formulário.`)
        field.debouncer.cancel()
        field.state.touched = true
        return this.validateField(field, { trigger: 'api', remoteDebounce: false })
    }

    /** Valida todos os campos (respeitando disabled/skip). Retorna { valid, errors, invalidFields }. */
    async validate({ trigger = 'api' } = {}) {
        const fields = Array.from(this.fields.values())
        for (const field of fields) field.debouncer.cancel()
        const results = await Promise.all(fields.map(field => this.validateField(field, { trigger, remoteDebounce: false })))
        const invalidFields = fields.filter((field, i) => !results[i].skipped && field.state.errors.length > 0)
        const errors = {}
        for (const field of invalidFields) errors[field.key] = field.state.errors.slice()
        const formConfigErrors = this.state.configErrors.filter(e => !e.field)
        const valid = invalidFields.length === 0 && formConfigErrors.length === 0
        if (!valid) dispatch(this.form, EVENTS.invalid, { errors, trigger })
        return { valid, errors, invalidFields: invalidFields.map(f => f.key) }
    }

    valueSnapshot() {
        const map = new Map()
        for (const field of this.fields.values()) map.set(field, JSON.stringify(field.comparableValue()))
        return map
    }

    /**
     * Política de snapshot no submit: valida, compara os valores com o instante inicial da validação e,
     * se algo mudou durante validações assíncronas, valida de novo (até 2 vezes) antes de serializar.
     */
    async validateForSubmit() {
        for (let attempt = 0; attempt < 3; attempt++) {
            const before = this.valueSnapshot()
            const result = await this.validate({ trigger: 'submit' })
            const after = this.valueSnapshot()
            let changed = before.size !== after.size
            if (!changed) for (const [field, value] of before) if (after.get(field) !== value) changed = true
            if (!changed) return result
        }
        return { valid: false, changed: true, errors: {}, invalidFields: [] }
    }

    /* ------------------------------------------------------------------ UI */

    fieldView(field, info) {
        const s = field.state
        let status = 'idle'
        let messages = []
        if (field.configError) {
            status = 'invalid'
            messages = s.errors.length ? s.errors : [this.message(field, '__config')]
        } else if (s.remote === 'pending' && !s.localErrors.length) {
            status = 'pending'
            messages = s.serverErrors.slice()
            info = info || this.message(field, 'pending')
        } else if (s.errors.length && (s.validated || s.serverErrors.length)) {
            status = 'invalid'
            messages = s.errors
        } else if (s.validated && !s.validating) {
            status = 'valid'
        }
        if (field.option('errors') === 'first') messages = messages.slice(0, 1)
        return { status, messages, info: info || null, showValid: field.option('showValid') }
    }

    renderField(field, info) {
        if (this.destroyed) return
        try {
            this.ui.renderField(field, this.fieldView(field, info))
        } catch (error) {
            if (!isConfigError(error)) throw error
            field.configError = error
            field.state.configError = error.message
            this.log('error', error.message)
        }
    }

    renderSummary() {
        const mode = this.config.summary
        if (mode === 'none') return
        const items = []
        for (const message of this.state.generalErrors) items.push({ text: message })
        for (const field of this.orderedFields()) {
            if (!field.state.errors.length) continue
            const hasInline = field.kind !== 'hidden' || field.groupAttribute('data-form-error-target')
            if (mode === 'all' || !hasInline) {
                for (const text of field.option('errors') === 'first' ? field.state.errors.slice(0, 1) : field.state.errors) {
                    items.push({ text: hasInline ? `${field.label}: ${text}` : text, field: hasInline ? field : null, onActivate: hasInline ? () => this.focusField(field) : null })
                }
            }
        }
        const formConfig = this.state.configErrors.filter(e => !e.field)
        if (formConfig.length && this.state.submitted) items.push({ text: this.formMessage('submit.config') })
        this.ui.renderSummary({ title: items.length ? this.formMessage('summary.title') : null, items })
    }

    renderFiles(field) {
        if (!field.files) return
        const names = new Set([field.name, field.name.replace(/\[\]$/, ''), field.key])
        const containers = []
        const roots = [this.form]
        if (formId(this.form)) for (const el of document.querySelectorAll(`[data-form-for="${cssEscape(formId(this.form))}"]`)) roots.push(el)
        for (const root of roots) {
            for (const el of root.querySelectorAll('[data-form-file-list]')) if (names.has(el.getAttribute('data-form-file-list'))) containers.push(el)
        }
        if (containers.length) for (const item of field.files.items) field.files.previewFor(item)
        field.state.files = field.files.snapshot()
        field.state.existing = field.files.existingSnapshot()
        for (const container of containers) {
            this.ui.renderFileList(field, container, field.state.files, {
                onRemove: id => {
                    this.removeFile(field, id)
                    if (!field.files.items.length) field.primary.focus()
                },
            })
        }
        for (const entry of field.files.existing) this.ui.renderExisting(entry)
    }

    orderedFields() {
        return Array.from(this.fields.values()).sort((a, b) => {
            if (a.primary === b.primary) return 0
            return a.primary.compareDocumentPosition(b.primary) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        })
    }

    /** Dispara form:reveal (para abas/accordions/modais abrirem) e então foca e rola até o campo. */
    async focusField(field) {
        const control = field.kind === 'radio' || field.kind === 'checkbox-group' ? field.controls.find(c => c.checked) || field.primary : field.primary
        dispatch(control, EVENTS.reveal, { field: field.key, name: field.name, element: control })
        await this.config.hooks.reveal?.(control, field.state)
        await new Promise(resolve => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0)))
        if (this.config.scroll !== 'none' && typeof control.scrollIntoView === 'function') {
            const behavior = this.config.scroll === 'smooth' && !prefersReducedMotion() ? 'smooth' : 'auto'
            control.scrollIntoView({ block: 'center', behavior })
        }
        if (typeof control.focus === 'function') control.focus({ preventScroll: true })
    }

    focusFirstInvalid() {
        if (this.config.focus === 'none') return
        const first = this.orderedFields().find(f => f.state.errors.length && f.kind !== 'hidden' && !f.disabled)
        if (first) this.focusField(first)
        else this.ui.focusSummary()
    }

    /* ------------------------------------------------------------------ API de valores */

    getValue(name, { as = 'canonical' } = {}) {
        const field = this.resolveField(name)
        if (!field) throw new ConfigError(`Campo "${name}" não encontrado neste formulário.`)
        return field.getValue(as)
    }

    getValues({ as = 'submit', format = 'object', submitter = null } = {}) {
        if (format === 'entries') return collectEntries(this, { as, submitter }).map(e => [e.name, e.value])
        if (format !== 'object') throw new ConfigError('getValues: format deve ser "object" ou "entries".')
        const out = {}
        for (const field of this.orderedFields()) {
            if (field.disabled) continue
            const value = field.kind === 'file' ? field.files.newItems().map(i => i.file) : field.getValue(as)
            if (Object.prototype.hasOwnProperty.call(out, field.name)) out[field.name] = [].concat(out[field.name], value)
            else out[field.name] = value
        }
        return out
    }

    setValue(name, value, { as = 'display', touch = false, validate = null, silent = false } = {}) {
        const field = this.resolveField(name)
        if (!field) throw new ConfigError(`Campo "${name}" não encontrado neste formulário.`)
        field.setValue(value, as)
        if (touch) field.state.touched = true
        this.handleValueChange(field, 'api', { silent })
        if (validate === true || (validate !== false && field.state.validated)) this.validateField(field, { trigger: 'api', remoteDebounce: false })
        return field.getValue('display')
    }

    addFiles(name, files) {
        const field = this.resolveField(name)
        if (!field || field.kind !== 'file') throw new ConfigError(`Campo de arquivo "${name?.name ?? name}" não encontrado.`)
        field.files.add(files)
        this.renderFiles(field)
        this.handleValueChange(field, 'change')
        return field.state.files
    }

    removeFile(name, id) {
        const field = this.resolveField(name)
        if (!field || field.kind !== 'file') throw new ConfigError(`Campo de arquivo "${name?.name ?? name}" não encontrado.`)
        const removed = field.files.remove(id)
        if (removed) {
            this.renderFiles(field)
            this.handleValueChange(field, 'change')
        }
        return removed
    }

    removeExisting(name, id, removed) {
        const field = this.resolveField(name)
        if (!field || field.kind !== 'file') throw new ConfigError(`Campo de arquivo "${name}" não encontrado.`)
        const changed = field.files.toggleExisting(id, removed)
        if (changed) {
            this.renderFiles(field)
            this.handleValueChange(field, 'change')
        }
        return changed
    }

    clearRemoteCache(name) {
        if (name) this.resolveField(name)?.remote?.clearCache()
        else for (const field of this.fields.values()) field.remote?.clearCache()
    }

    /* ------------------------------------------------------------------ erros */

    resolveErrorTarget(rawKey) {
        const key = normalizeErrorKey(rawKey)
        const direct = this.fields.get(key) || this.resolveField(rawKey)
        if (direct) return { field: direct }
        const match = /^(.*)\.(\d+)$/.exec(key)
        if (match) {
            const parent = this.fields.get(match[1])
            if (parent?.kind === 'file') return { field: parent, fileIndex: Number(match[2]) }
            if (parent && (parent.kind === 'checkbox-group' || parent.kind === 'select-multiple')) return { field: parent }
        }
        return null
    }

    /**
     * Aplica erros vindos do servidor. Com `snapshot`, erros de campos cujo valor mudou desde o envio
     * são descartados (não se aplica resposta antiga a valor novo).
     */
    applyServerErrors(errors, { general = [], snapshot = null, fileOrder = null } = {}) {
        const generalErrors = [...general]
        const touchedFields = new Set()
        for (const [rawKey, messages] of Object.entries(errors || {})) {
            const target = this.resolveErrorTarget(rawKey)
            if (!target) {
                generalErrors.push(...messages)
                continue
            }
            const field = target.field
            if (snapshot && snapshot.has(field) && snapshot.get(field) !== JSON.stringify(field.comparableValue())) continue
            if (target.fileIndex != null) {
                const ids = fileOrder?.get(field) || field.files.items.map(i => i.id)
                const item = field.files.items.find(i => i.id === ids[target.fileIndex])
                const label = item ? item.name : `#${target.fileIndex + 1}`
                if (item) item.errors = [...item.errors, ...messages]
                field.state.serverErrors = [...field.state.serverErrors, ...messages.map(m => `${label}: ${m}`)]
                this.renderFiles(field)
            } else {
                field.state.serverErrors = [...field.state.serverErrors, ...messages]
                if (field.remote) field.remote.invalidate(field.validationValue(), this.remoteExtras(field))
            }
            touchedFields.add(field)
        }
        for (const field of touchedFields) {
            field.state.touched = true
            this.composeErrors(field)
            this.renderField(field)
        }
        this.state.generalErrors = [...this.state.generalErrors, ...generalErrors]
        this.renderSummary()
        return { fields: Array.from(touchedFields).map(f => f.key), general: generalErrors }
    }

    setErrors(errors, { general = [], replace = true } = {}) {
        if (!isPlainObject(errors) && !Array.isArray(errors)) throw new ConfigError('setErrors espera um objeto { campo: mensagens }.')
        if (replace) this.clearServerErrors()
        const list = Array.isArray(errors) ? { _general: errors } : errors
        const normalized = {}
        const extraGeneral = [...general]
        for (const [key, value] of Object.entries(list)) {
            const messages = (Array.isArray(value) ? value : [value]).filter(m => typeof m === 'string' && m)
            if (['', '_', '_general', '*'].includes(key)) extraGeneral.push(...messages)
            else normalized[key] = messages
        }
        return this.applyServerErrors(normalized, { general: extraGeneral })
    }

    clearServerErrors() {
        for (const field of this.fields.values()) {
            if (!field.state.serverErrors.length) continue
            field.state.serverErrors = []
            if (field.files) for (const item of field.files.items) item.errors = []
            this.composeErrors(field)
            this.renderField(field)
            if (field.files) this.renderFiles(field)
        }
        this.state.generalErrors = []
    }

    clearErrors(name) {
        if (name != null) {
            const field = this.resolveField(name)
            if (!field) throw new ConfigError(`Campo "${name}" não encontrado neste formulário.`)
            field.runToken += 1
            field.abort?.abort()
            field.state.localErrors = []
            field.state.serverErrors = []
            field.state.validated = false
            field.state.validating = false
            field.state.remote = 'idle'
            if (field.files) for (const item of field.files.items) item.errors = []
            this.composeErrors(field)
            this.renderField(field)
            if (field.files) this.renderFiles(field)
            this.renderSummary()
            return
        }
        for (const field of this.fields.values()) {
            if (field.configError) continue
            this.clearErrors(field)
        }
        this.state.generalErrors = []
        this.state.error = null
        this.renderSummary()
        this.updateAggregate()
    }

    resetValidation() {
        this.clearErrors()
        for (const field of this.fields.values()) {
            field.state.touched = false
            field.state.valid = false
            field.state.invalid = false
        }
        this.state.submitted = false
        this.renderSummary()
    }

    /* ------------------------------------------------------------------ envio */

    onSubmit(event) {
        if (this.allowNativeOnce) {
            this.allowNativeOnce = false
            return
        }
        event.preventDefault()
        if (this.destroyed) return
        this.submit({ submitter: event.submitter || null }).catch(error => this.log('error', error))
    }

    securityHeaders(url) {
        if (url && isCrossOrigin(url)) return {}
        const headers = {}
        const csrf = this.config.csrf
        if (csrf && csrf.meta && csrf.header) {
            const meta = document.querySelector(`meta[name="${csrf.meta}"]`)
            const token = meta?.getAttribute('content')
            if (token) headers[csrf.header] = token
        }
        return headers
    }

    resolveTarget(submitter) {
        const form = this.form
        const attrOf = name => (submitter && submitter.hasAttribute(name) ? submitter.getAttribute(name) : null)
        const rawAction = attrOf('formaction') ?? this.config.endpoint ?? form.getAttribute('action') ?? ''
        const url = new URL(rawAction || globalThis.location.href, globalThis.location.href)
        const method = (attrOf('formmethod') || this.config.method || form.getAttribute('method') || 'get').toLowerCase()
        let encoding = this.config.encoding
        const enctype = attrOf('formenctype') || (this.form.hasAttribute('data-form-encoding') ? null : form.getAttribute('enctype'))
        if (enctype === 'application/x-www-form-urlencoded') encoding = 'urlencoded'
        else if (enctype === 'multipart/form-data') encoding = 'multipart'
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) throw new ConfigError(`Método HTTP "${method}" não suportado.`)
        return { url, method, encoding, noValidate: !!submitter?.hasAttribute('formnovalidate') }
    }

    buildRequestBody(entries, target) {
        if (target.method === 'get') {
            const params = toUrlSearchParams(entries)
            const url = new URL(target.url.href)
            url.search = params.toString()
            return { url: url.href, body: null, headers: {} }
        }
        if (target.encoding === 'json') {
            const object = toJsonObject(entries, { nesting: this.config.nesting, jsonFiles: this.config.jsonFiles })
            return { url: target.url.href, body: JSON.stringify(object), headers: { 'Content-Type': 'application/json' } }
        }
        if (target.encoding === 'urlencoded') {
            return { url: target.url.href, body: toUrlSearchParams(entries).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } }
        }
        return { url: target.url.href, body: toFormData(entries), headers: {} }
    }

    /** Transporte por finalidade: submit usa data-form-transport; remote/job/chunk usam um transporte registrado com esse nome, se houver. */
    transportFor(purpose) {
        let name
        if (purpose === 'submit') name = this.config.transport
        else if (registry.has('transport', purpose)) name = purpose
        else name = purpose === 'chunk' ? 'xhr' : 'fetch'
        const transport = registry.get('transport', name)
        if (!transport) throw new ConfigError(`Transporte "${name}" não registrado.`)
        return transport
    }

    idempotencyKey(fingerprint) {
        if (!this.config.idempotency) return null
        if (this.idempotency && this.idempotency.fingerprint === fingerprint && this.idempotency.reusable) return this.idempotency.key
        this.idempotency = { key: randomId(16), fingerprint, reusable: false }
        return this.idempotency.key
    }

    submit({ submitter = null } = {}) {
        if (this.destroyed) return Promise.reject(new StateError('Formulário destruído.'))
        if (this.submission) return this.submission.promise
        const submission = { controller: new AbortController(), promise: null }
        this.submission = submission
        submission.promise = this.runSubmit(submitter, submission).finally(() => {
            if (this.submission === submission) this.submission = null
        })
        return submission.promise
    }

    async runSubmit(submitter, submission) {
        const signal = submission.controller.signal
        const state = this.state
        state.submitted = true
        state.submitCount += 1
        state.error = null
        state.result = null
        state.job = null
        this.state.progress = emptyProgress()
        if (!dispatch(this.form, EVENTS.beforeSubmit, { submitter })) return this.endSubmit({ ok: false, reason: 'prevented' }, 'idle')
        if ((await this.config.hooks.beforeSubmit?.(this.state, { submitter })) === false) return this.endSubmit({ ok: false, reason: 'prevented' }, 'idle')

        let target
        try {
            target = this.resolveTarget(submitter)
        } catch (error) {
            return this.failSubmit('config', error.message, { error })
        }

        this.clearServerErrors()
        this.renderSummary()
        this.setPhase('validating')
        if (!target.noValidate) {
            const validation = await this.validateForSubmit()
            if (signal.aborted) return this.endSubmit({ ok: false, reason: 'canceled' }, 'canceled')
            if (validation.changed) return this.failSubmit('changed', this.formMessage('submit.changed'))
            if (!validation.valid) {
                this.setPhase('idle')
                this.renderSummary()
                this.focusFirstInvalid()
                return { ok: false, reason: 'invalid', errors: validation.errors }
            }
        }
        if (this.state.configErrors.length) return this.failSubmit('config', this.formMessage('submit.config'))

        if (this.config.transport === 'native') return this.nativeSubmit(submitter)

        const snapshot = this.valueSnapshot()
        const fileOrder = new Map()
        for (const field of this.fields.values()) if (field.files) fileOrder.set(field, field.files.items.map(i => i.id))
        const replacements = new Map()
        const sendContext = {
            signal,
            replacements,
            controller: this,
            setPhase: phase => this.setPhase(phase),
            setProgress: progress => {
                this.state.progress = progress
                this.renderProgress()
                dispatch(this.form, EVENTS.progress, { ...progress, phase: this.state.phase })
            },
        }
        try {
            for (const extension of this.extensions) {
                if (extension.beforeSend) await extension.beforeSend(sendContext)
            }
        } catch (error) {
            if (isAbort(error) || signal.aborted) return this.endSubmit({ ok: false, reason: 'canceled' }, 'canceled')
            return this.failSubmit(error.kind || 'upload', error.message, { error })
        }

        let request
        try {
            const entries = collectEntries(this, { submitter, replacements })
            const built = this.buildRequestBody(entries, target)
            const fingerprint = JSON.stringify(entriesSnapshot(entries))
            const headers = {
                Accept: 'application/json, text/plain;q=0.5, */*;q=0.1',
                'X-Requested-With': 'XMLHttpRequest',
                ...this.config.headers,
                ...this.securityHeaders(built.url),
                ...built.headers,
            }
            const key = this.idempotencyKey(fingerprint)
            if (key) headers['Idempotency-Key'] = key
            request = {
                url: built.url,
                method: target.method.toUpperCase(),
                headers,
                body: built.body,
                credentials: this.config.credentials,
                timeout: this.config.timeout,
                signal,
                onUploadProgress: progress => this.onUploadProgress(progress),
                onUploadComplete: () => this.onUploadComplete(),
            }
        } catch (error) {
            if (isSerializationError(error)) return this.failSubmit('serialization', error.message, { error })
            if (isConfigError(error)) return this.failSubmit('config', error.message, { error })
            throw error
        }

        if (!dispatch(this.form, EVENTS.submit, { request: { url: request.url, method: request.method, headers: request.headers }, submitter })) {
            return this.endSubmit({ ok: false, reason: 'prevented' }, 'idle')
        }
        await this.config.hooks.beforeRequest?.(request, this.state)

        this.keepProgress = !!sendContext.keepProgress
        if (!this.keepProgress) {
            this.tracker.start()
            this.state.progress = this.tracker.snapshot()
        }
        this.setPhase('uploading')

        let raw
        try {
            raw = await this.transportFor('submit')(request)
        } catch (error) {
            return this.handleTransportError(error, request)
        }
        if (this.state.phase === 'uploading') this.onUploadComplete()

        const adapterName = this.config.responseAdapter
        const adapter = registry.get('responseAdapter', adapterName)
        if (!adapter) return this.failSubmit('config', `Adaptador de resposta "${adapterName}" não registrado.`)
        let result
        try {
            result = adapter(raw, { form: this.form, request })
        } catch (error) {
            return this.failSubmit('parse', this.formMessage('submit.parse'), { error })
        }
        await this.config.hooks.afterResponse?.(result, this.state)
        if (this.idempotency) this.idempotency.reusable = ['server', 'rate_limited'].includes(result.kind)
        return this.handleResult(result, { snapshot, fileOrder, signal })
    }

    nativeSubmit(submitter) {
        this.setPhase('idle')
        this.allowNativeOnce = true
        formRequestSubmit(this.form, submitter && submitter.form === this.form ? submitter : null)
        return { ok: true, native: true }
    }

    onUploadProgress(progress) {
        if (this.state.phase !== 'uploading' || this.keepProgress) return
        this.tracker.update(progress)
        this.state.progress = this.tracker.snapshot()
        this.renderProgress()
        dispatch(this.form, EVENTS.progress, { ...this.state.progress, phase: 'uploading' })
    }

    onUploadComplete() {
        if (this.state.phase !== 'uploading') return
        this.tracker.markUploaded()
        this.state.progress = this.tracker.snapshot()
        this.setPhase('awaiting')
        dispatch(this.form, EVENTS.uploaded, { ...this.state.progress })
    }

    handleTransportError(error, request) {
        if (isAbort(error)) return this.endSubmit({ ok: false, reason: 'canceled' }, 'canceled')
        const uploadComplete = !!error.details?.uploadComplete
        if (this.idempotency) this.idempotency.reusable = true
        if (error.kind === 'timeout') {
            const message = uploadComplete ? this.formMessage('submit.unknown') : this.formMessage('submit.timeout')
            return this.failSubmit(uploadComplete ? 'unknown' : 'timeout', message, { error })
        }
        if (uploadComplete) return this.failSubmit('unknown', this.formMessage('submit.unknown'), { error })
        const message = error.details?.crossOrigin ? this.formMessage('submit.cors') : this.formMessage('submit.network')
        return this.failSubmit('network', message, { error, url: request.url })
    }

    async handleResult(result, { snapshot, fileOrder, signal }) {
        this.state.result = { status: result.status, kind: result.kind, message: result.message, data: result.data, requestId: result.requestId }
        if (result.kind === 'accepted' && result.job) return this.runJob(result.job, signal, result)
        if (result.ok) return this.succeed(result)

        const applied = this.applyServerErrors(result.errors, { general: result.generalErrors, snapshot, fileOrder })
        const kind = result.kind || 'http'
        let message = result.message
        if (kind === 'html') {
            message = this.formMessage('submit.html')
            this.log('error', 'Resposta HTML inesperada:', result.diagnostic)
        } else if (!message) {
            const key = {
                validation: 'submit.validation', logical: 'submit.logical', auth: 'submit.auth', forbidden: 'submit.forbidden',
                csrf: 'submit.csrf', too_large: 'submit.too_large', rate_limited: 'submit.rate_limited', server: 'submit.server', parse: 'submit.parse',
            }[kind] || 'submit.http'
            message = this.formMessage(key, { status: result.status })
        }
        if (result.requestId) this.log('warn', `request_id: ${result.requestId}`)
        const onlyFieldErrors = applied.fields.length > 0 && kind === 'validation' && !result.message
        if (!onlyFieldErrors && !this.state.generalErrors.includes(message)) {
            this.state.generalErrors = [message, ...this.state.generalErrors]
            this.renderSummary()
        }
        return this.failSubmit(kind, message, { result, focus: true })
    }

    async runJob(job, signal, result) {
        const statusUrl = job.statusUrl && !isCrossOrigin(job.statusUrl) ? job.statusUrl : this.config.jobUrl ? this.config.jobUrl.replace('{id}', encodeURIComponent(job.id)) : null
        if (!statusUrl) return this.failSubmit('config', 'Resposta 202 sem status_url e sem data-form-job-url configurado.')
        this.state.job = { id: job.id, status: 'queued', progress: null, message: result?.message ?? null, statusUrl, cancelUrl: job.cancelUrl || (this.config.jobCancelUrl ? this.config.jobCancelUrl.replace('{id}', encodeURIComponent(job.id)) : null) }
        if (this.config.jobPersist) saveJob(this.form, { id: job.id, statusUrl })
        this.setPhase('processing')
        dispatch(this.form, EVENTS.processing, { job: { ...this.state.job } })
        const poller = new JobPoller({
            job,
            url: statusUrl,
            transport: this.transportFor('job'),
            headers: this.securityHeaders(statusUrl),
            credentials: this.config.credentials,
            interval: this.config.jobInterval,
            maxInterval: this.config.jobMaxInterval,
            timeout: this.config.jobTimeout,
            onUpdate: update => {
                this.state.job = { ...this.state.job, status: update.status, progress: update.progress, message: update.message }
                this.renderProgress()
                dispatch(this.form, EVENTS.processing, { job: { ...this.state.job } })
            },
        })
        this.poller = poller
        const onAbort = () => poller.stop()
        signal?.addEventListener('abort', onAbort, { once: true })
        let final
        try {
            final = await poller.run()
        } catch (error) {
            if (isAbort(error)) return this.endSubmit({ ok: false, reason: 'canceled', job: this.state.job }, 'canceled', this.formMessage('status.observation_stopped'))
            if (error.kind !== 'job-timeout') clearJob(this.form)
            const message = error.kind === 'job-timeout' ? this.formMessage('job.timeout') : error.message
            return this.failSubmit(error.kind || 'job', message, { error })
        } finally {
            signal?.removeEventListener('abort', onAbort)
            if (this.poller === poller) this.poller = null
        }
        clearJob(this.form)
        if (final.status === 'succeeded') {
            return this.succeed({ ok: true, status: 200, kind: 'success', message: final.message, data: final.result, job: final, redirect: final.result?.redirect ?? null })
        }
        const message = final.status === 'canceled' ? this.formMessage('job.canceled') : (final.error?.message || final.message || this.formMessage('job.failed'))
        return this.failSubmit(final.status === 'canceled' ? 'job-canceled' : 'job-failed', message, { result: final })
    }

    resumePersistedJob() {
        if (!this.config.jobPersist) return
        const saved = loadJob(this.form)
        if (!saved || this.submission) return
        const submission = { controller: new AbortController(), promise: null }
        this.submission = submission
        submission.promise = this.runJob({ id: saved.id, statusUrl: saved.statusUrl }, submission.controller.signal, null)
            .catch(error => this.log('error', error))
            .finally(() => {
                if (this.submission === submission) this.submission = null
            })
    }

    async cancelJob() {
        const job = this.state.job
        if (!job || !job.cancelUrl) throw new StateError('Nenhum processamento cancelável em andamento (o backend não informou cancel_url).')
        const raw = await this.transportFor('job')({ url: job.cancelUrl, method: 'DELETE', headers: { Accept: 'application/json', ...this.securityHeaders(job.cancelUrl) }, credentials: this.config.credentials, timeout: 15000 })
        if (raw.status < 200 || raw.status >= 300) throw new OperationalError(`O servidor recusou o cancelamento (HTTP ${raw.status}).`, { kind: 'job-cancel', status: raw.status })
        return true
    }

    succeed(result) {
        this.state.result = { status: result.status, kind: result.kind, message: result.message, data: result.data, requestId: result.requestId ?? null, job: result.job ?? null }
        this.state.error = null
        this.setPhase('success')
        dispatch(this.form, EVENTS.success, { result: this.state.result })
        if (this.config.resetOnSuccess) this.reset({ keepPhase: true })
        if (this.config.redirect === 'response' && result.redirect) this.safeRedirect(result.redirect)
        return { ok: true, result: this.state.result }
    }

    safeRedirect(target) {
        let url
        try {
            url = new URL(String(target), globalThis.location.href)
        } catch {
            this.log('warn', 'Redirecionamento ignorado: URL inválida.', target)
            return false
        }
        const allowed = (url.protocol === 'http:' || url.protocol === 'https:') &&
            (url.origin === globalThis.location.origin || this.config.redirectOrigins.includes(url.origin))
        if (!allowed) {
            this.log('warn', 'Redirecionamento ignorado: origem não permitida.', url.origin)
            return false
        }
        globalThis.location.assign(url.href)
        return true
    }

    failSubmit(kind, message, { error = null, result = null, focus = false } = {}) {
        this.state.error = { kind, message, status: result?.status ?? null, requestId: result?.requestId ?? null, diagnostic: result?.diagnostic ?? null }
        if (error && !isConfigError(error) && !isAbort(error)) this.log('error', error)
        if (kind === 'config') this.log('error', message)
        const generalKinds = new Set(['network', 'timeout', 'unknown', 'config', 'serialization', 'changed', 'job', 'job-failed', 'job-canceled', 'job-timeout', 'job-missing', 'job-http', 'job-contract', 'upload', 'upload-failed'])
        if (generalKinds.has(kind) && !this.state.generalErrors.includes(message)) {
            this.state.generalErrors = [...this.state.generalErrors, message]
        }
        this.setPhase('error')
        this.renderSummary()
        dispatch(this.form, EVENTS.error, { error: { ...this.state.error }, result: result ? { status: result.status, kind: result.kind, errors: result.errors } : null })
        if (focus || generalKinds.has(kind)) this.focusFirstInvalid()
        return { ok: false, reason: kind, error: this.state.error }
    }

    endSubmit(outcome, phase, message = null) {
        if (phase === 'canceled') {
            this.state.error = { kind: 'canceled', message: message || this.formMessage('status.canceled') }
            this.setPhase('canceled')
            dispatch(this.form, EVENTS.cancel, { reason: outcome.reason, job: outcome.job ?? null })
        } else {
            this.setPhase(phase)
        }
        return outcome
    }

    /** Cancela validação/upload/espera em andamento. Durante processamento, encerra apenas a observação. */
    cancel() {
        let canceled = false
        if (this.submission) {
            this.submission.controller.abort(new AbortError())
            canceled = true
        }
        if (this.poller) {
            this.poller.stop()
            canceled = true
        }
        for (const extension of this.extensions) if (extension.cancel?.()) canceled = true
        return canceled
    }

    async callExtension(method, name) {
        return this.callExtensionSync(method, name)
    }

    /** Variante síncrona para consultas (ex.: getUploadSession), que não devem devolver Promise. */
    callExtensionSync(method, name) {
        for (const extension of this.extensions) {
            if (typeof extension[method] === 'function') return extension[method](name)
        }
        throw new StateError(`${method}() requer o módulo de chunks (alpine-form-chunks).`)
    }

    /* ------------------------------------------------------------------ reset e destroy */

    onNativeReset(event) {
        if (this.internalReset) return
        if (!dispatch(this.form, EVENTS.reset, { source: 'native' })) {
            event.preventDefault()
            return
        }
        this.cancel()
        setTimeout(() => this.afterReset(), 0)
    }

    reset({ keepPhase = false } = {}) {
        if (this.destroyed) return false
        if (!keepPhase && !dispatch(this.form, EVENTS.reset, { source: 'api' })) return false
        if (!keepPhase) this.cancel()
        this.internalReset = true
        try {
            formReset(this.form)
        } finally {
            this.internalReset = false
        }
        this.afterReset({ keepPhase })
        return true
    }

    afterReset({ keepPhase = false } = {}) {
        if (this.destroyed) return
        for (const field of this.fields.values()) {
            field.debouncer.cancel()
            field.abort?.abort()
            field.runToken += 1
            field.files?.reset()
            field.mask?.afterReset?.()
            field.state.touched = false
            field.state.validated = false
            field.state.validating = false
            field.state.localErrors = field.configError ? [this.message(field, '__config')] : []
            field.state.serverErrors = []
            field.state.remote = 'idle'
            this.syncFieldValue(field)
            this.composeErrors(field)
            this.renderField(field)
            if (field.files) this.renderFiles(field)
        }
        this.state.generalErrors = []
        this.state.submitted = false
        this.state.error = null
        if (!keepPhase) {
            this.state.result = null
            this.state.job = null
            this.state.progress = emptyProgress()
            this.setPhase('idle')
        }
        this.renderSummary()
        this.updateAggregate()
    }

    destroy() {
        if (this.destroyed) return
        this.cancel()
        this.destroyed = true
        clearTimeout(this.pendingRefresh)
        this.observer?.disconnect()
        for (const cleanup of this.cleanups) cleanup()
        this.cleanups = []
        this.externalUiCleanup?.()
        for (const field of Array.from(this.fields.values())) {
            field.unsubscribe?.()
            field.debouncer?.cancel()
            field.abort?.abort()
            field.mask?.destroy?.()
            field.files?.destroy()
            this.ui.removeField(field)
            this.externalCleanups.get(field)?.()
        }
        this.externalCleanups.clear()
        for (const extension of this.extensions) extension.destroy?.()
        this.ui.destroy()
        this.progressUi.destroy()
        this.form.removeAttribute('aria-busy')
        this.form.removeAttribute('data-form-state')
        controllers.delete(this.form)
        this.fields.clear()
        this.controlIndex.clear()
        dispatch(this.form, EVENTS.destroy, {})
    }
}

function valuesEqualList(a, b) {
    return a.length === b.length && a.every((item, i) => item === b[i])
}
