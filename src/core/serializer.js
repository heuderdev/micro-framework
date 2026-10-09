import { SerializationError } from './errors.js'
import { splitName, setPath, toPlain } from '../lib/paths.js'
import { formElements } from '../lib/dom.js'

const SKIP_INPUT_TYPES = new Set(['submit', 'button', 'reset', 'image'])

/**
 * Monta a lista de entradas seguindo o algoritmo de "construção da lista de entradas" do HTML:
 * ordem da árvore (form.elements, incluindo controles associados pelo atributo form), ignorando
 * desabilitados, controles sem name, checkbox/radio desmarcados e botões que não originaram o envio.
 * Diferenças intencionais:
 *  - campos com máscara/normalizador usam a representação configurada (data-form-submit-value);
 *  - campos de arquivo usam a lista interna (arquivos removidos na UI não são enviados);
 *  - checkbox com data-form-unchecked-value envia esse valor quando desmarcado;
 *  - componentes externos (data-form-component) são anexados ao final.
 * Nomes repetidos geram entradas repetidas (nunca são colapsados).
 */
export function collectEntries(controller, { submitter = null, as = 'submit', replacements = new Map() } = {}) {
    const form = controller.form
    const entries = []
    for (const el of formElements(form)) {
        const tag = el.tagName
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') continue
        if (el.matches(':disabled')) continue
        const name = el.getAttribute('name')
        const type = tag === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : tag === 'BUTTON' ? (el.getAttribute('type') || 'submit').toLowerCase() : tag.toLowerCase()
        if (tag === 'BUTTON' || SKIP_INPUT_TYPES.has(type)) {
            if (el === submitter && name) entries.push({ name, value: el.value ?? '', control: el })
            continue
        }
        if (!name) continue
        const field = controller.fieldForControl(el)

        if (type === 'checkbox' || type === 'radio') {
            if (el.checked) entries.push({ name, value: el.value, control: el, field })
            else if (type === 'checkbox' && field?.uncheckedValue != null && field.kind === 'checkbox') entries.push({ name, value: field.uncheckedValue, control: el, field })
            continue
        }
        if (tag === 'SELECT') {
            for (const option of Array.from(el.options)) {
                if (option.selected && !option.disabled) entries.push({ name, value: option.value, control: el, field })
            }
            continue
        }
        if (type === 'file') {
            if (replacements.has(field)) {
                for (const value of replacements.get(field)) entries.push({ name, value, control: el, field })
            } else if (field?.files) {
                const items = field.files.newItems()
                if (items.length === 0) entries.push({ name, value: new File([], '', { type: 'application/octet-stream' }), control: el, field, emptyFile: true })
                for (const item of items) entries.push({ name, value: item.file, control: el, field })
            } else {
                const files = Array.from(el.files || [])
                if (files.length === 0) entries.push({ name, value: new File([], '', { type: 'application/octet-stream' }), control: el, emptyFile: true })
                for (const file of files) entries.push({ name, value: file, control: el })
            }
            if (field?.files) {
                for (const id of field.files.removedExistingIds()) entries.push({ name: field.files.removeName, value: id, control: el, field, removal: true })
            }
            continue
        }
        let value = el.value
        if (field && field.kind === 'text' && field.controls[0] === el) {
            const represented = as === 'display' ? field.readDisplay() : field.getValue(as)
            value = represented == null ? '' : String(represented)
        }
        entries.push({ name, value, control: el, field })
        const dirname = el.getAttribute('dirname')
        if (dirname && (type === 'text' || type === 'search' || tag === 'TEXTAREA')) {
            entries.push({ name: dirname, value: el.dir === 'rtl' ? 'rtl' : 'ltr', control: el })
        }
    }
    for (const field of controller.componentFields()) {
        if (field.disabled) continue
        const value = field.getValue(as === 'display' ? 'display' : as)
        const values = Array.isArray(value) ? value : value == null ? [] : [value]
        for (const v of values) entries.push({ name: field.name, value: typeof v === 'string' || v instanceof Blob ? v : String(v), field })
    }
    return entries
}

export function toFormData(entries) {
    const data = new FormData()
    for (const entry of entries) {
        if (entry.value instanceof Blob) data.append(entry.name, entry.value, entry.value.name ?? 'blob')
        else data.append(entry.name, entry.value)
    }
    return data
}

export function toUrlSearchParams(entries) {
    const params = new URLSearchParams()
    for (const entry of entries) params.append(entry.name, entry.value instanceof Blob ? (entry.value.name ?? '') : entry.value)
    return params
}

/**
 * JSON opcional. Política de nomes (data-form-nesting):
 *  - brackets (padrão): itens[0][nome] -> {"itens":[{"nome":...}]}, documentos[] -> lista, "usuario.email" é chave literal
 *  - dots: também divide por ponto ("usuario.email" -> {"usuario":{"email":...}})
 *  - flat: sem aninhamento; nomes repetidos viram lista
 * Arquivos: data-form-json-files="error" (padrão) interrompe o envio; "metadata" envia {name,size,type}.
 * Segmentos __proto__, prototype e constructor são rejeitados.
 */
export function toJsonObject(entries, { nesting = 'brackets', jsonFiles = 'error' } = {}) {
    const root = Object.create(null)
    for (const entry of entries) {
        let value = entry.value
        if (value instanceof Blob) {
            if (entry.emptyFile) continue
            if (jsonFiles !== 'metadata') {
                throw new SerializationError(`O campo "${entry.name}" contém arquivo e a codificação é JSON. Use multipart ou data-form-json-files="metadata".`, { name: entry.name })
            }
            value = { name: value.name ?? '', size: value.size, type: value.type }
        }
        setPath(root, splitName(entry.name, nesting), value, entry.name)
    }
    return toPlain(root)
}

export function entriesSnapshot(entries) {
    return entries.map(entry => [entry.name, entry.value instanceof Blob ? `[arquivo ${entry.value.name ?? ''} ${entry.value.size}B]` : entry.value])
}
