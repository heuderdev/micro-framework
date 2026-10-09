import { formatBytes } from '../lib/size.js'
import { cssEscape } from '../lib/utils.js'
import { formId } from '../lib/dom.js'

const ATTRS = [
    'data-form-progress',
    'data-form-progress-bar',
    'data-form-progress-percent',
    'data-form-progress-loaded',
    'data-form-progress-total',
    'data-form-progress-speed',
    'data-form-progress-eta',
    'data-form-progress-elapsed',
    'data-form-status',
    'data-form-cancel',
    'data-form-pause',
    'data-form-resume',
]

/** Só escreve quando muda: reatribuir "disabled" gera registro de mutação mesmo com o mesmo valor. */
function setDisabled(el, disabled) {
    if (el.disabled !== disabled) el.disabled = disabled
}

export function formatDuration(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return '—'
    const s = Math.max(0, Math.round(seconds))
    if (s < 60) return `${s} s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/**
 * Liga elementos declarativos ao estado de envio. Procura dentro do form e em elementos
 * fora dele marcados com data-form-for="<id do form>".
 * Contrato congelado: ver docs/atributos.md (seção Progresso).
 */
export class ProgressUi {
    constructor(controller) {
        this.controller = controller
        this.elements = new Map()
        this.statusOriginal = new Map()
        this.refresh()
    }

    scope() {
        const form = this.controller.form
        const roots = [form]
        if (formId(form)) {
            for (const el of document.querySelectorAll(`[data-form-for="${cssEscape(formId(form))}"]`)) roots.push(el)
        }
        return roots
    }

    refresh() {
        this.elements.clear()
        for (const attr of ATTRS) this.elements.set(attr, [])
        for (const root of this.scope()) {
            for (const attr of ATTRS) {
                if (root !== this.controller.form && root.hasAttribute(attr)) this.elements.get(attr).push(root)
                for (const el of root.querySelectorAll(`[${attr}]`)) {
                    if (!this.elements.get(attr).includes(el)) this.elements.get(attr).push(el)
                }
            }
        }
        for (const el of this.elements.get('data-form-status')) {
            if (!this.statusOriginal.has(el)) {
                this.statusOriginal.set(el, { role: el.getAttribute('role'), live: el.getAttribute('aria-live') })
                if (!el.hasAttribute('role')) el.setAttribute('role', 'status')
                if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite')
            }
        }
    }

    list(attr) {
        return this.elements.get(attr) || []
    }

    render(state, statusText) {
        const p = state.progress
        const phase = state.phase
        for (const el of this.list('data-form-progress')) {
            el.setAttribute('data-form-state', phase)
            el.setAttribute('aria-busy', ['validating', 'uploading', 'awaiting', 'processing'].includes(phase) ? 'true' : 'false')
        }
        for (const el of this.list('data-form-progress-bar')) this.renderBar(el, state)
        this.text('data-form-progress-percent', p.percent == null ? '' : `${p.percent}%`)
        this.text('data-form-progress-loaded', formatBytes(p.loaded))
        this.text('data-form-progress-total', p.total == null ? '—' : formatBytes(p.total))
        this.text('data-form-progress-speed', p.speed == null ? '—' : `${formatBytes(p.speed)}/s`)
        this.text('data-form-progress-eta', formatDuration(p.eta))
        this.text('data-form-progress-elapsed', formatDuration(p.elapsed / 1000))
        this.text('data-form-status', statusText)
        const cancelable = ['validating', 'uploading', 'awaiting', 'processing', 'paused'].includes(phase)
        for (const el of this.list('data-form-cancel')) setDisabled(el, !cancelable)
        const uploads = state.uploads || {}
        const canPause = Object.values(uploads).some(u => u.status === 'uploading')
        const canResume = Object.values(uploads).some(u => u.status === 'paused')
        for (const el of this.list('data-form-pause')) setDisabled(el, !canPause)
        for (const el of this.list('data-form-resume')) setDisabled(el, !canResume)
    }

    renderBar(el, state) {
        const p = state.progress
        const processing = state.phase === 'processing'
        const percent = processing ? state.job?.progress ?? null : p.percent
        const indeterminate = percent == null && ['uploading', 'awaiting', 'processing'].includes(state.phase)
        el.setAttribute('data-indeterminate', indeterminate ? 'true' : 'false')
        if (el.tagName === 'PROGRESS') {
            el.max = 100
            if (percent == null) el.removeAttribute('value')
            else el.value = percent
            return
        }
        if (!el.hasAttribute('role')) el.setAttribute('role', 'progressbar')
        el.setAttribute('aria-valuemin', '0')
        el.setAttribute('aria-valuemax', '100')
        if (percent == null) {
            el.removeAttribute('aria-valuenow')
            el.setAttribute('aria-valuetext', indeterminate ? 'Progresso indeterminado' : '')
            el.style.width = ''
        } else {
            el.setAttribute('aria-valuenow', String(percent))
            el.setAttribute('aria-valuetext', `${percent}%`)
            el.style.width = `${percent}%`
        }
    }

    text(attr, value) {
        for (const el of this.list(attr)) {
            if (el.textContent !== value) el.textContent = value
        }
    }

    destroy() {
        for (const [el, original] of this.statusOriginal) {
            if (original.role == null) el.removeAttribute('role')
            if (original.live == null) el.removeAttribute('aria-live')
        }
        this.statusOriginal.clear()
        this.elements.clear()
    }
}
