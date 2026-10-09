import { ConfigError, isConfigError } from './errors.js'
import { parseRules, compilePattern } from './rule-parser.js'
import { readDotAttributes, resolveFieldOption, parseOptionValue, OPTION_SPECS } from './config.js'
import { parseNormalizers, applyNormalizers } from './normalizers.js'
import * as registry from './registry.js'
import { uid, valuesEqual, isVisible } from '../lib/utils.js'

const TEXT_TYPES = new Set(['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'datetime-local', 'time', 'month', 'week', 'color', 'range', ''])
const DATE_TYPES = { date: 'date', 'datetime-local': 'datetime', time: 'time', month: 'month', week: 'week' }
const NUMERIC_RULES = new Set(['numeric', 'integer', 'decimal', 'min_value', 'max_value', 'positive', 'negative', 'multiple_of'])
const REPRESENTATIONS = ['raw', 'formatted', 'canonical']

/** Atributos de campo reconhecidos pelo núcleo (extensões registram os seus). */
registry.registerFieldAttributes([
    'data-form-v', 'data-form-msg', 'data-form-label', 'data-form-error-target', 'data-form-pattern', 'data-form-pattern-flags',
    'data-form-normalize', 'data-form-submit-value', 'data-form-sensitive', 'data-form-ignore', 'data-form-name',
    'data-form-component', 'data-form-unchecked-value', 'data-form-date-kind',
    'data-form-remote', 'data-form-remote-method', 'data-form-remote-debounce', 'data-form-remote-timeout', 'data-form-remote-fields',
    'data-form-remote-param', 'data-form-remote-cache', 'data-form-remote-cache-ttl', 'data-form-remote-inconclusive', 'data-form-remote-adapter',
    'data-form-remote-allow-query',
    'data-form-files-append', 'data-form-files-duplicates', 'data-form-preview', 'data-form-existing-remove-name',
    'data-form-mask', 'data-form-mask-validation-value', 'data-form-chunked',
    ...Object.values(OPTION_SPECS).filter(s => s.inherit).map(s => s.attr),
], ['data-form-msg.'])

export function controlKind(control, groupSize, name) {
    if (control.hasAttribute('data-form-component')) return 'component'
    const tag = control.tagName
    if (tag === 'SELECT') return control.multiple ? 'select-multiple' : 'select'
    if (tag === 'TEXTAREA') return 'text'
    const type = (control.getAttribute('type') || 'text').toLowerCase()
    if (type === 'checkbox') return groupSize > 1 || /\[\]$/.test(name) ? 'checkbox-group' : 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'file') return 'file'
    if (type === 'hidden') return 'hidden'
    return 'text'
}

export class Field {
    constructor(controller, { key, name, controls, companions = [] }) {
        this.id = uid('f')
        this.controller = controller
        this.form = controller.form
        this.key = key
        this.name = name
        this.controls = controls
        this.companions = companions
        this.kind = controlKind(controls[0], controls.length, name)
        const first = controls[0]
        this.inputType = first.tagName === 'TEXTAREA' ? 'textarea' : first.tagName === 'INPUT' ? (first.getAttribute('type') || 'text').toLowerCase() : first.tagName.toLowerCase()
        this.runToken = 0
        this.abort = null
        this.debouncer = null
        this.composing = false
        this.mask = null
        this.files = null
        this.remote = null
        this.component = null
        this.configError = null
        this.rules = []
        this.state = null
        this.uiState = {}
    }

    get primary() {
        return this.controls[0]
    }

    /** Lê e valida todos os atributos do campo. Erros ficam em this.configError, nunca aprovam o campo. */
    configure() {
        this.configError = null
        try {
            this.readConfiguration()
        } catch (error) {
            if (!isConfigError(error)) throw error
            this.configError = error
            this.rules = []
        }
    }

    readConfiguration() {
        const controls = this.controls
        const formConfig = this.controller.config
        this.checkUnknownAttributes()
        this.options = {}
        for (const [key, spec] of Object.entries(OPTION_SPECS)) {
            if (spec.inherit) this.options[key] = resolveFieldOption(controls, this.form, formConfig, key)
        }

        const rulesSource = this.groupAttribute('data-form-v')
        this.rules = rulesSource == null ? [] : parseRules(rulesSource)
        this.refs = new Set(this.rules.flatMap(rule => rule.refs))

        this.messages = {}
        for (const control of controls) Object.assign(this.messages, readDotAttributes(control, 'data-form-msg.'))
        this.genericMessage = this.groupAttribute('data-form-msg')
        this.label = this.computeLabel()
        this.sensitive = this.inputType === 'password' || this.groupAttribute('data-form-sensitive') !== null

        this.patternRegex = null
        if (this.rules.some(rule => rule.name === 'pattern')) {
            this.patternRegex = compilePattern(this.groupAttribute('data-form-pattern'), this.groupAttribute('data-form-pattern-flags') || '', formConfig.patternMaxLength)
        } else if (this.groupAttribute('data-form-pattern') !== null) {
            throw new ConfigError('data-form-pattern declarado sem a regra "pattern" em data-form-v.')
        }

        const normalize = this.groupAttribute('data-form-normalize')
        if (normalize && (this.sensitive || this.kind === 'file')) {
            throw new ConfigError('Normalizadores não são aplicados a senhas, campos sensíveis ou arquivos.')
        }
        this.normalizers = parseNormalizers(normalize)

        this.dateKind = DATE_TYPES[this.inputType] || null
        const dateKindAttr = this.groupAttribute('data-form-date-kind')
        if (dateKindAttr) {
            if (!['date', 'datetime', 'time', 'month', 'week'].includes(dateKindAttr)) throw new ConfigError(`data-form-date-kind="${dateKindAttr}" inválido.`)
            this.dateKind = dateKindAttr
        }
        this.dateFormat = DATE_TYPES[this.inputType] ? 'iso' : this.options.dateFormat

        this.mask = null
        const maskName = this.groupAttribute('data-form-mask')
        if (maskName !== null) {
            const provider = this.controller.services.maskProvider
            if (!provider) throw new ConfigError('data-form-mask requer o módulo de máscaras (alpine-form-masks).')
            if (this.kind !== 'text' || !['text', 'tel', 'search', 'textarea', ''].includes(this.inputType === 'textarea' ? 'textarea' : this.inputType)) {
                throw new ConfigError(`Máscaras só se aplicam a input type="text", "tel" ou "search" (recebido "${this.inputType}"). Não use type="number" com máscara.`)
            }
            this.mask = provider.attach(this, maskName)
            if (this.mask.dateKind && !dateKindAttr) this.dateKind = this.mask.dateKind
        }

        this.numeric = this.inputType === 'number' || this.inputType === 'range' || !!this.mask?.numeric || this.rules.some(rule => NUMERIC_RULES.has(rule.name))

        this.validateAs = this.readRepresentation('data-form-mask-validation-value', this.mask?.defaults?.validation)
        this.submitAs = this.readRepresentation('data-form-submit-value', this.mask?.defaults?.submit)

        const uncheckedValue = this.groupAttribute('data-form-unchecked-value')
        if (uncheckedValue !== null && this.kind !== 'checkbox') throw new ConfigError('data-form-unchecked-value só se aplica a checkbox individual.')
        this.uncheckedValue = uncheckedValue

        if (this.kind === 'component') {
            const name = this.primary.getAttribute('data-form-component')
            this.component = registry.get('component', name)
            if (!this.component) throw new ConfigError(`Componente "${name}" não registrado (AlpineForm.component).`)
        }

        if (this.kind === 'hidden' && this.mask) throw new ConfigError('Máscara em input hidden não é suportada.')
        if (this.groupAttribute('data-form-chunked') !== null) {
            if (this.kind !== 'file') throw new ConfigError('data-form-chunked só se aplica a input type="file".')
            if (!this.controller.services.chunks) throw new ConfigError('data-form-chunked requer o módulo de chunks (alpine-form-chunks).')
        }
    }

    checkUnknownAttributes() {
        for (const control of this.controls) {
            for (const attr of Array.from(control.attributes)) {
                if (attr.name.startsWith('data-form-') && !registry.isKnownFieldAttribute(attr.name)) {
                    throw new ConfigError(`Atributo desconhecido "${attr.name}" no campo "${this.name}". Verifique a grafia ou carregue o módulo correspondente.`)
                }
            }
        }
    }

    readRepresentation(attr, fallback) {
        const raw = this.groupAttribute(attr)
        if (raw === null) return fallback || 'canonical'
        const value = raw.trim().toLowerCase()
        if (!REPRESENTATIONS.includes(value)) throw new ConfigError(`${attr}="${raw}" inválido. Use raw, formatted ou canonical.`)
        return value
    }

    /** Lê um atributo entre os controles do grupo; valores divergentes geram ConfigError. */
    groupAttribute(attr) {
        let found = null
        for (const control of this.controls) {
            if (!control.hasAttribute(attr)) continue
            const value = control.getAttribute(attr)
            if (found !== null && found !== value) {
                throw new ConfigError(`Valores divergentes de ${attr} no grupo "${this.name}". Declare o atributo em apenas um controle ou use o mesmo valor.`)
            }
            found = value
        }
        return found
    }

    computeLabel() {
        const explicit = this.groupAttribute('data-form-label')
        if (explicit) return explicit
        const control = this.primary
        if (this.controls.length > 1 || this.kind === 'radio' || this.kind === 'checkbox-group') {
            const fieldset = control.closest('fieldset')
            const legend = fieldset?.querySelector(':scope > legend')
            if (legend && this.controls.every(c => fieldset.contains(c))) return legend.textContent.trim()
        }
        const labels = control.labels ? Array.from(control.labels) : []
        if (labels.length) {
            const text = labels.map(l => l.textContent.trim()).filter(Boolean).join(' ')
            if (text) return text.replace(/\s*\*\s*$/, '')
        }
        const aria = control.getAttribute('aria-label')
        if (aria) return aria
        return this.name
    }

    get disabled() {
        if (this.kind === 'component') return this.primary.hasAttribute('data-form-disabled') || this.primary.closest('fieldset:disabled') !== null
        return this.controls.every(control => control.disabled || control.matches(':disabled'))
    }

    /** Política de visibilidade: só dispensa validação se data-form-hidden="skip" e o campo não estiver visível. */
    get skipped() {
        if (this.options?.hidden !== 'skip') return false
        if (this.kind === 'hidden') return false
        return !this.controls.some(control => isVisible(control))
    }

    get enabledControls() {
        return this.controls.filter(control => !control.disabled && !control.matches(':disabled'))
    }

    /** Valor exibido/selecionado, sem transformação. */
    readDisplay() {
        const controls = this.enabledControls
        switch (this.kind) {
            case 'select-multiple':
                return controls.flatMap(c => Array.from(c.selectedOptions).filter(o => !o.disabled).map(o => o.value))
            case 'checkbox': {
                const c = controls[0]
                return c && c.checked ? c.value : null
            }
            case 'checkbox-group':
                return controls.filter(c => c.checked).map(c => c.value)
            case 'radio':
                return controls.find(c => c.checked)?.value ?? null
            case 'file':
                return this.files ? this.files.newItems() : []
            case 'component':
                return this.component.getValue(this.primary)
            default:
                return controls[0] ? controls[0].value : null
        }
    }

    get checked() {
        return this.kind === 'checkbox' ? !!this.enabledControls[0]?.checked : undefined
    }

    /** Separa valor exibido, bruto, formatado e canônico. */
    representations(display = this.readDisplay()) {
        if (this.mask && typeof display === 'string') {
            const reps = this.mask.represent(display)
            return { display, raw: reps.raw, formatted: reps.formatted, canonical: applyNormalizers(reps.canonical, this.normalizers, { field: this }) }
        }
        if (this.kind === 'file') return { display, raw: display, formatted: display, canonical: display }
        const canonical = display == null ? display : applyNormalizers(display, this.normalizers, { field: this })
        return { display, raw: display, formatted: display, canonical }
    }

    validationValue() {
        return this.representations()[this.validateAs]
    }

    submitValue() {
        return this.representations()[this.submitAs]
    }

    getValue(as = 'canonical') {
        if (as === 'validation') return this.validationValue()
        if (as === 'submit') return this.submitValue()
        const reps = this.representations()
        if (!(as in reps)) throw new ConfigError(`Representação desconhecida "${as}". Use display, raw, formatted, canonical, validation ou submit.`)
        return reps[as]
    }

    /** Valor usado para dirty: bruto da máscara ou valor exibido; arquivos comparados por id. */
    comparableValue() {
        if (this.kind === 'file') return { items: this.files ? this.files.newItems().map(i => i.id) : [], removed: this.files ? this.files.removedExistingIds() : [] }
        const display = this.readDisplay()
        if (this.mask && typeof display === 'string') return this.mask.represent(display).raw
        return display
    }

    isDirty() {
        const current = this.comparableValue()
        if (this.kind === 'file') return current.items.length > 0 || current.removed.length > 0
        return !valuesEqual(current, this.initialComparable)
    }

    snapshotInitial() {
        this.initialComparable = this.comparableValue()
        this.initialDisplay = this.readDisplay()
    }

    /** Define o valor pela API: aceita representação de entrada (display/raw/formatted/canonical). */
    setValue(value, as = 'display') {
        const controls = this.controls
        switch (this.kind) {
            case 'select-multiple': {
                const values = new Set((Array.isArray(value) ? value : [value]).map(String))
                for (const c of controls) for (const option of c.options) option.selected = values.has(option.value)
                break
            }
            case 'checkbox': {
                const c = controls[0]
                c.checked = value === true || (value != null && value !== false && String(value) === c.value)
                break
            }
            case 'checkbox-group': {
                const values = new Set((Array.isArray(value) ? value : [value]).filter(v => v != null).map(String))
                for (const c of controls) c.checked = values.has(c.value)
                break
            }
            case 'radio':
                for (const c of controls) c.checked = value != null && c.value === String(value)
                break
            case 'file':
                throw new ConfigError('Use addFiles()/removeFile() para campos de arquivo; navegadores não permitem definir arquivos por valor.')
            case 'component':
                this.component.setValue(this.primary, value)
                break
            default: {
                const text = value == null ? '' : String(value)
                if (this.mask) this.mask.setFrom(text, as)
                else controls[0].value = text
            }
        }
    }

    infoForValidators() {
        return {
            key: this.key,
            name: this.name,
            kind: this.kind,
            inputType: this.inputType,
            label: this.label,
            numeric: this.numeric,
            dateKind: this.dateKind,
            dateFormat: this.dateFormat,
            existingCount: this.files ? this.files.keptExistingCount() : 0,
            checked: this.checked,
            sensitive: this.sensitive,
        }
    }

    hasRules() {
        return this.rules.length > 0 || !!this.remote || this.configError !== null
    }

    /** Opção de validação efetiva respeitando sobrescrita por campo. */
    option(key) {
        if (this.options && key in this.options) return this.options[key]
        return this.controller.config[key]
    }

    readOption(attr, spec) {
        const raw = this.groupAttribute(attr)
        return raw === null ? null : parseOptionValue(spec, raw, attr)
    }
}
