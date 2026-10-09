import { ConfigError } from '../core/errors.js'
import { parseBool, parseInteger, parseList } from '../core/config.js'

export const MASK_ATTRIBUTES = [
    'data-form-mask-pattern',
    'data-form-mask-placeholder',
    'data-form-mask-locale',
    'data-form-mask-currency',
    'data-form-mask-scale',
    'data-form-mask-negative',
    'data-form-mask-max-digits',
    'data-form-mask-pad',
    'data-form-mask-grouping',
    'data-form-mask-case',
    'data-form-mask-card-brands',
]

export function readMaskConfig(field) {
    const attr = name => field.groupAttribute(name)
    const bool = name => (attr(name) === null ? null : parseBool(attr(name), name))
    const caseAttr = attr('data-form-mask-case')
    if (caseAttr !== null && !['upper', 'lower'].includes(caseAttr)) throw new ConfigError('data-form-mask-case deve ser "upper" ou "lower".')
    const placeholder = attr('data-form-mask-placeholder')
    if (placeholder !== null && Array.from(placeholder).length !== 1) throw new ConfigError('data-form-mask-placeholder deve ser um único caractere, ex.: "_".')
    return {
        pattern: attr('data-form-mask-pattern'),
        placeholder,
        locale: attr('data-form-mask-locale') || field.controller.config.locale || 'pt-BR',
        currency: (attr('data-form-mask-currency') || 'BRL').toUpperCase(),
        scale: attr('data-form-mask-scale') === null ? null : parseInteger(attr('data-form-mask-scale'), 'data-form-mask-scale', { min: 0, max: 10 }),
        negative: bool('data-form-mask-negative') ?? false,
        maxDigits: attr('data-form-mask-max-digits') === null ? 15 : parseInteger(attr('data-form-mask-max-digits'), 'data-form-mask-max-digits', { min: 1, max: 30 }),
        pad: bool('data-form-mask-pad'),
        grouping: bool('data-form-mask-grouping'),
        case: caseAttr,
        cardBrands: attr('data-form-mask-card-brands') ? parseList(attr('data-form-mask-card-brands')) : null,
    }
}

function placeholderFrom(pattern, char) {
    let out = ''
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i]
        if (ch === '\\') {
            out += pattern[i + 1] ?? ''
            i += 1
        } else out += ch === '9' || ch === 'A' || ch === '*' || ch === 'X' ? char : ch
    }
    return out
}

/**
 * Liga uma máscara a um campo. O núcleo chama os handlers a partir de listeners delegados em
 * fase de captura no <form>, portanto a formatação acontece antes de x-model e de listeners do usuário.
 *
 * Cursor: restaurado com setSelectionRange somente quando o input está focado.
 * Undo/redo: o navegador mantém sua própria pilha; como o valor é reescrito por script, desfazer
 * pode pular estados intermediários (limitação documentada). O resultado é sempre reformatado.
 */
export function attachMask(field, name, registry) {
    const factory = registry.get('mask', name)
    if (!factory) throw new ConfigError(`Máscara desconhecida "${name}". Registradas: ${registry.names('mask').join(', ')}.`)
    const el = field.primary
    const config = readMaskConfig(field)
    const mask = factory(config, { field: field.infoForValidators?.() ?? null, element: el })
    for (const method of ['format', 'represent', 'fromValue']) {
        if (typeof mask?.[method] !== 'function') throw new ConfigError(`A máscara "${name}" não implementa ${method}().`)
    }
    const original = { inputmode: el.getAttribute('inputmode'), placeholder: el.getAttribute('placeholder') }
    const added = { inputmode: false, placeholder: false }
    if (mask.inputmode && original.inputmode === null) {
        el.setAttribute('inputmode', mask.inputmode)
        added.inputmode = true
    }
    if (config.placeholder && original.placeholder === null && mask.placeholderPattern) {
        el.setAttribute('placeholder', placeholderFrom(mask.placeholderPattern, config.placeholder))
        added.placeholder = true
    }

    let pasting = false
    const isFocused = () => el.ownerDocument.activeElement === el
    const setCaret = position => {
        if (!isFocused() || typeof el.setSelectionRange !== 'function') return
        try {
            el.setSelectionRange(position, position)
        } catch {
            /* tipos sem seleção */
        }
    }
    const reformat = () => {
        const result = mask.format(el.value, null)
        if (result.value !== el.value) el.value = result.value
    }
    reformat()

    return {
        name,
        mask,
        numeric: !!mask.numeric,
        dateKind: mask.dateKind || null,
        defaults: mask.defaults || { validation: 'canonical', submit: 'canonical' },
        represent: display => mask.represent(display),
        setFrom(text, as = 'display') {
            el.value = mask.fromValue(text, as)
        },
        handleBeforeInput(event) {
            if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') pasting = true
            const backward = event.inputType === 'deleteContentBackward'
            const forward = event.inputType === 'deleteContentForward'
            if (!(backward || forward) || typeof mask.deleteAcrossLiteral !== 'function') return
            const start = el.selectionStart
            if (start == null || start !== el.selectionEnd) return
            const result = mask.deleteAcrossLiteral(el.value, start, backward ? 'backward' : 'forward')
            if (!result) return
            event.preventDefault()
            const formatted = mask.format(result.value, result.caret)
            el.value = formatted.value
            setCaret(formatted.caret)
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: event.inputType }))
        },
        handleInput(event) {
            const paste = pasting || event?.inputType === 'insertFromPaste' || event?.inputType === 'insertFromDrop'
            pasting = false
            const value = el.value
            const caret = isFocused() && el.selectionStart != null ? el.selectionStart : null
            const result = mask.format(value, caret, { paste })
            if (result.value !== value) el.value = result.value
            if (caret != null) setCaret(result.caret)
        },
        handleChange() {
            reformat()
        },
        handleBlur() {
            if (typeof mask.onBlur !== 'function') return
            const next = mask.onBlur(el.value)
            if (next !== el.value) {
                el.value = next
                el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }))
            }
        },
        afterReset() {
            reformat()
        },
        destroy() {
            if (added.inputmode) el.removeAttribute('inputmode')
            if (added.placeholder) el.removeAttribute('placeholder')
        },
    }
}
