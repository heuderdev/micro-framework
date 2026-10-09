import { ConfigError } from '../core/errors.js'
import { formatBytes } from '../lib/size.js'

export const DEFAULT_CLASSES = {
    invalid: 'af-invalid',
    valid: 'af-valid',
    pending: 'af-pending',
    error: 'af-error',
    errorItem: 'af-error__item',
    errorPending: 'af-error--pending',
    groupInvalid: 'af-group-invalid',
    summary: 'af-summary',
    summaryTitle: 'af-summary__title',
    summaryList: 'af-summary__list',
    fileList: 'af-files',
    fileItem: 'af-file',
    fileItemInvalid: 'af-file--invalid',
    fileThumb: 'af-file__thumb',
    fileName: 'af-file__name',
    fileSize: 'af-file__size',
    fileErrors: 'af-file__errors',
    fileRemove: 'af-file__remove',
    existingRemoved: 'af-existing--removed',
    dropzoneOver: 'af-dropzone--over',
}

function classList(value) {
    return String(value || '').split(/\s+/).filter(Boolean)
}

/** Aceita valores com várias classes separadas por espaço (ex.: "invalid-feedback d-block"). */
export function toggleClasses(el, value, force) {
    for (const name of classList(value)) el.classList.toggle(name, force)
}

function addToken(el, attr, token) {
    const tokens = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)
    if (!tokens.includes(token)) {
        tokens.push(token)
        el.setAttribute(attr, tokens.join(' '))
    }
}

function removeToken(el, attr, token) {
    const tokens = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)
    const next = tokens.filter(t => t !== token)
    if (next.length === tokens.length) return
    if (next.length) el.setAttribute(attr, next.join(' '))
    else el.removeAttribute(attr)
}

/**
 * Adaptador de UI padrão (sem framework CSS).
 * - Cria o elemento de erro automaticamente após o controle (ou usa data-form-error-target).
 * - Mensagens via textContent; nenhum HTML vindo do servidor é interpretado.
 * - aria-invalid e aria-describedby são adicionados preservando valores existentes e restaurados no destroy.
 * - Elementos de erro de campo NÃO são live regions: o leitor de tela os lê ao focar o campo
 *   (via aria-describedby), evitando anúncios a cada tecla. O resumo usa role="alert" após o envio.
 */
export class DefaultUiAdapter {
    constructor(ctx, options = {}) {
        this.ctx = ctx
        this.classes = { ...DEFAULT_CLASSES, ...(options.classes || {}) }
        this.records = new Map()
        this.summaryEl = null
        this.summaryCreated = false
    }

    record(field) {
        let rec = this.records.get(field.id)
        if (!rec) {
            rec = { errorEl: null, created: false, target: null, generatedTargetId: false, ariaOriginal: new Map(), describedControls: new Set() }
            this.records.set(field.id, rec)
        }
        return rec
    }

    /** Controles que recebem classes de estado. */
    classTargets(field) {
        if (field.kind === 'component') return [field.primary]
        return field.controls
    }

    ariaTargets(field) {
        if (field.kind === 'component') return [field.primary]
        if ((field.kind === 'radio' || field.kind === 'checkbox-group') && field.controls.length > 1) {
            const fieldset = field.primary.closest('fieldset')
            if (fieldset && field.controls.every(c => fieldset.contains(c))) return [fieldset, ...field.controls]
        }
        return field.controls
    }

    /** Onde inserir o elemento de erro criado automaticamente. */
    anchorFor(field) {
        const last = field.controls[field.controls.length - 1]
        if ((field.kind === 'radio' || field.kind === 'checkbox-group') && field.controls.length > 1) {
            const fieldset = field.primary.closest('fieldset')
            if (fieldset && field.controls.every(c => fieldset.contains(c))) return { parent: fieldset, before: null }
        }
        const label = last.closest('label')
        const anchor = label && label.contains(last) ? label : last
        return { parent: anchor.parentNode, before: anchor.nextSibling }
    }

    createErrorElement(field, id) {
        const el = document.createElement('div')
        el.id = id
        el.className = this.classes.error
        el.hidden = true
        el.setAttribute('data-form-generated', 'error')
        return el
    }

    ensureErrorElement(field) {
        const rec = this.record(field)
        if (rec.errorEl && rec.errorEl.isConnected) return rec.errorEl
        const targetSelector = field.groupAttribute('data-form-error-target')
        if (targetSelector) {
            let target
            try {
                target = document.querySelector(targetSelector)
            } catch {
                throw new ConfigError(`Seletor inválido em data-form-error-target="${targetSelector}".`)
            }
            if (!target) throw new ConfigError(`data-form-error-target="${targetSelector}" não encontrou elemento.`)
            if (!target.id) {
                target.id = `${this.ctx.uid}-${field.id}-err`
                rec.generatedTargetId = true
            }
            rec.errorEl = target
            rec.created = false
            rec.target = target
        } else {
            if (field.kind === 'hidden') return null
            const el = this.createErrorElement(field, `${this.ctx.uid}-${field.id}-err`)
            const { parent, before } = this.anchorFor(field)
            if (!parent) return null
            parent.insertBefore(el, before)
            rec.errorEl = el
            rec.created = true
        }
        for (const control of this.ariaTargets(field)) {
            if (!rec.ariaOriginal.has(control)) {
                rec.ariaOriginal.set(control, {
                    describedby: control.getAttribute('aria-describedby'),
                    invalid: control.getAttribute('aria-invalid'),
                })
            }
            addToken(control, 'aria-describedby', rec.errorEl.id)
            rec.describedControls.add(control)
        }
        return rec.errorEl
    }

    /**
     * view = { status: 'idle'|'valid'|'invalid'|'pending', messages: string[], info: string|null, showValid }
     * info = texto não bloqueante (pendente ou verificação inconclusiva), exibido quando não há erros.
     */
    renderField(field, view) {
        const hasContent = view.messages.length > 0 || !!view.info
        const rec = this.records.get(field.id)
        if (!hasContent && !rec?.errorEl) {
            this.applyClasses(field, view)
            return
        }
        const el = this.ensureErrorElement(field)
        this.applyClasses(field, view)
        if (!el) return
        el.textContent = ''
        if (view.messages.length) {
            for (const message of view.messages) {
                const item = document.createElement('span')
                item.className = this.classes.errorItem
                item.textContent = message
                el.appendChild(item)
            }
            toggleClasses(el, this.classes.errorPending, false)
        } else if (view.info) {
            const item = document.createElement('span')
            item.className = this.classes.errorItem
            item.textContent = view.info
            el.appendChild(item)
            toggleClasses(el, this.classes.errorPending, true)
        } else {
            toggleClasses(el, this.classes.errorPending, false)
        }
        if (this.records.get(field.id)?.created) el.hidden = !hasContent
    }

    applyClasses(field, view) {
        const invalid = view.status === 'invalid'
        for (const control of this.classTargets(field)) {
            toggleClasses(control, this.classes.invalid, invalid)
            toggleClasses(control, this.classes.valid, view.status === 'valid' && !!view.showValid)
            toggleClasses(control, this.classes.pending, view.status === 'pending')
        }
        for (const control of this.ariaTargets(field)) {
            const rec = this.record(field)
            if (!rec.ariaOriginal.has(control)) {
                rec.ariaOriginal.set(control, { describedby: control.getAttribute('aria-describedby'), invalid: control.getAttribute('aria-invalid') })
            }
            if (invalid) control.setAttribute('aria-invalid', 'true')
            else {
                const original = rec.ariaOriginal.get(control)?.invalid
                if (original != null) control.setAttribute('aria-invalid', original)
                else control.removeAttribute('aria-invalid')
            }
        }
    }

    removeField(field) {
        const rec = this.records.get(field.id)
        for (const control of this.classTargets(field)) {
            for (const key of ['invalid', 'valid', 'pending']) toggleClasses(control, this.classes[key], false)
        }
        if (!rec) return
        for (const [control, original] of rec.ariaOriginal) {
            if (rec.errorEl) removeToken(control, 'aria-describedby', rec.errorEl.id)
            if (original.describedby != null && control.getAttribute('aria-describedby') == null) control.setAttribute('aria-describedby', original.describedby)
            if (original.invalid != null) control.setAttribute('aria-invalid', original.invalid)
            else control.removeAttribute('aria-invalid')
        }
        if (rec.errorEl) {
            if (rec.created) rec.errorEl.remove()
            else {
                rec.errorEl.textContent = ''
                toggleClasses(rec.errorEl, this.classes.errorPending, false)
                if (rec.generatedTargetId) rec.errorEl.removeAttribute('id')
            }
        }
        this.records.delete(field.id)
    }

    summaryContainer(create) {
        if (this.summaryEl && this.summaryEl.isConnected) return this.summaryEl
        const form = this.ctx.form
        const selector = form.getAttribute('data-form-summary-target')
        let el = selector ? document.querySelector(selector) : form.querySelector('[data-form-errors-summary]')
        if (selector && !el) throw new ConfigError(`data-form-summary-target="${selector}" não encontrou elemento.`)
        if (!el && create) {
            el = document.createElement('div')
            el.setAttribute('data-form-generated', 'summary')
            el.hidden = true
            form.insertBefore(el, form.firstChild)
            this.summaryCreated = true
        }
        if (el) {
            toggleClasses(el, this.classes.summary, true)
            if (!el.hasAttribute('role')) el.setAttribute('role', 'alert')
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
        }
        this.summaryEl = el
        return el
    }

    /**
     * view = { title, items: [{ text, field? }] }
     */
    renderSummary(view) {
        const el = this.summaryContainer(view.items.length > 0)
        if (!el) return
        el.textContent = ''
        if (!view.items.length) {
            el.hidden = true
            return
        }
        if (view.title) {
            const title = document.createElement('p')
            title.className = this.classes.summaryTitle
            title.textContent = view.title
            el.appendChild(title)
        }
        const list = document.createElement('ul')
        list.className = this.classes.summaryList
        for (const item of view.items) {
            const li = document.createElement('li')
            if (item.field && item.onActivate) {
                const link = document.createElement('a')
                const control = item.field.primary
                link.href = control.id ? `#${control.id}` : '#'
                link.textContent = item.text
                link.addEventListener('click', event => {
                    event.preventDefault()
                    item.onActivate()
                })
                li.appendChild(link)
            } else {
                li.textContent = item.text
            }
            list.appendChild(li)
        }
        el.appendChild(list)
        el.hidden = false
    }

    focusSummary() {
        const el = this.summaryContainer(false)
        if (el && !el.hidden) el.focus({ preventScroll: false })
    }

    /** Lista de arquivos declarada por data-form-file-list="nome". */
    renderFileList(field, container, items, { onRemove }) {
        const previouslyFocused = container.contains(document.activeElement) ? document.activeElement.getAttribute('data-file-id') : null
        container.textContent = ''
        if (!items.length) return
        const list = document.createElement('ul')
        list.className = this.classes.fileList
        list.setAttribute('data-form-generated', 'file-list')
        for (const item of items) {
            const li = document.createElement('li')
            li.className = this.classes.fileItem
            li.setAttribute('data-file-id', item.id)
            if (item.errors.length) toggleClasses(li, this.classes.fileItemInvalid, true)
            if (item.previewUrl) {
                const img = document.createElement('img')
                img.className = this.classes.fileThumb
                img.src = item.previewUrl
                img.alt = `Pré-visualização de ${item.name}`
                img.decoding = 'async'
                img.loading = 'lazy'
                li.appendChild(img)
            }
            const name = document.createElement('span')
            name.className = this.classes.fileName
            name.textContent = item.name
            li.appendChild(name)
            const size = document.createElement('span')
            size.className = this.classes.fileSize
            size.textContent = formatBytes(item.size)
            li.appendChild(size)
            if (item.errors.length) {
                const errors = document.createElement('span')
                errors.className = this.classes.fileErrors
                errors.textContent = item.errors.join(' ')
                li.appendChild(errors)
            }
            const remove = document.createElement('button')
            remove.type = 'button'
            remove.className = this.classes.fileRemove
            remove.textContent = 'Remover'
            remove.setAttribute('aria-label', `Remover ${item.name}`)
            remove.setAttribute('data-file-id', item.id)
            remove.addEventListener('click', () => onRemove(item.id))
            li.appendChild(remove)
            list.appendChild(li)
        }
        container.appendChild(list)
        if (previouslyFocused) {
            const same = container.querySelector(`button[data-file-id="${previouslyFocused}"]`)
            ;(same || container.querySelector('button[data-file-id]'))?.focus()
        }
    }

    renderExisting(entry) {
        toggleClasses(entry.element, this.classes.existingRemoved, entry.removed)
        const button = entry.element.querySelector('[data-form-existing-remove]')
        if (button) button.setAttribute('aria-pressed', entry.removed ? 'true' : 'false')
    }

    setDropzoneOver(el, over) {
        toggleClasses(el, this.classes.dropzoneOver, over)
    }

    destroy() {
        if (this.summaryEl) {
            if (this.summaryCreated) this.summaryEl.remove()
            else this.summaryEl.textContent = ''
        }
        this.summaryEl = null
    }
}

export function createDefaultAdapter(ctx, options) {
    return new DefaultUiAdapter(ctx, options)
}
