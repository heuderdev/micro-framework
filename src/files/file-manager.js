import { uid } from '../lib/utils.js'
import { formatBytes } from '../lib/size.js'
import { RASTER_IMAGE_TYPES } from '../validators/files.js'

/**
 * Fonte de verdade da seleção de arquivos de um campo.
 *
 * - A lista interna (this.items) é o que vai para o FormData; o input.files é apenas espelhado.
 * - Remover um item da UI remove-o do envio, mesmo quando o navegador não permite reescrever input.files.
 * - Previews usam object URLs somente para imagens raster (SVG nunca, por conter conteúdo ativo)
 *   e são revogados ao remover, limpar ou destruir.
 */
export class FileManager {
    constructor(field, { append = false, duplicates = 'ignore', preview = true, previewMaxBytes = 20 * 1024 * 1024, removeName = null } = {}) {
        this.field = field
        this.input = field.primary
        this.append = append
        this.duplicates = duplicates
        this.preview = preview
        this.previewMaxBytes = previewMaxBytes
        this.items = []
        this.inspections = new Map()
        this.existing = []
        this.removeName = removeName || `${field.name.replace(/\[\]$/, '')}_remover[]`
        this.canSyncInput = typeof DataTransfer === 'function'
        this.inputInSync = true
        this.scanExisting()
    }

    get multiple() {
        return this.input.multiple
    }

    scanExisting() {
        const root = this.field.form
        const name = this.field.name
        const baseName = name.replace(/\[\]$/, '')
        const previous = new Map(this.existing.map(e => [e.id, e]))
        this.existing = Array.from(root.querySelectorAll('[data-form-existing]'))
            .filter(el => {
                const target = el.getAttribute('data-form-existing')
                return target === name || target === baseName
            })
            .map(el => {
                const id = el.getAttribute('data-form-existing-id')
                const prev = previous.get(id)
                return { id, element: el, removed: prev ? prev.removed : false, name: el.getAttribute('data-form-existing-name') || '' }
            })
            .filter(e => e.id)
    }

    newItems() {
        return this.items.slice()
    }

    keptExistingCount() {
        return this.existing.filter(e => !e.removed).length
    }

    removedExistingIds() {
        return this.existing.filter(e => e.removed).map(e => e.id)
    }

    fingerprint(file) {
        return `${file.name}\u0000${file.size}\u0000${file.lastModified}`
    }

    makeItem(file) {
        return { id: uid('file'), file, name: file.name, size: file.size, type: file.type || '', lastModified: file.lastModified, previewUrl: null, errors: [] }
    }

    /** Chamado no evento change do input. */
    fromInput() {
        const selected = Array.from(this.input.files || [])
        if (this.append && this.multiple) {
            this.add(selected, { fromInput: true })
        } else {
            this.clearItems()
            this.items = selected.map(file => this.makeItem(file))
            this.inputInSync = true
        }
        return this.items
    }

    add(files, { fromInput = false } = {}) {
        const incoming = Array.from(files || [])
        if (!this.multiple) {
            this.clearItems()
            if (incoming[0]) this.items = [this.makeItem(incoming[0])]
            this.syncInput(fromInput && incoming.length <= 1)
            return this.items
        }
        const known = new Set(this.items.map(item => this.fingerprint(item.file)))
        for (const file of incoming) {
            const fp = this.fingerprint(file)
            if (this.duplicates === 'ignore' && known.has(fp)) continue
            known.add(fp)
            this.items.push(this.makeItem(file))
        }
        this.syncInput(false)
        return this.items
    }

    remove(id) {
        const index = this.items.findIndex(item => item.id === id)
        if (index < 0) return false
        const [item] = this.items.splice(index, 1)
        this.releaseItem(item)
        this.syncInput(false)
        return true
    }

    toggleExisting(id, removed) {
        const entry = this.existing.find(e => e.id === String(id))
        if (!entry) return false
        entry.removed = removed === undefined ? !entry.removed : !!removed
        return true
    }

    /** Espelha a lista interna no input quando o navegador permite (DataTransfer). */
    syncInput(alreadyInSync) {
        if (alreadyInSync) {
            this.inputInSync = true
            return
        }
        if (this.canSyncInput) {
            try {
                const dt = new DataTransfer()
                for (const item of this.items) dt.items.add(item.file)
                this.input.files = dt.files
                this.inputInSync = true
                return
            } catch {
                this.canSyncInput = false
            }
        }
        if (this.items.length === 0) {
            this.input.value = ''
            this.inputInSync = true
        } else {
            this.inputInSync = false
        }
    }

    previewFor(item) {
        if (!this.preview || item.previewUrl) return item.previewUrl
        if (!RASTER_IMAGE_TYPES.includes(item.type.toLowerCase()) || item.size > this.previewMaxBytes) return null
        if (typeof URL.createObjectURL !== 'function') return null
        item.previewUrl = URL.createObjectURL(item.file)
        return item.previewUrl
    }

    releaseItem(item) {
        if (item.previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(item.previewUrl)
        item.previewUrl = null
        const inspection = this.inspections.get(item.id)
        if (inspection) {
            inspection.controller.abort()
            this.inspections.delete(item.id)
        }
    }

    clearItems() {
        for (const item of this.items) this.releaseItem(item)
        this.items = []
    }

    /** Após reset do formulário: descarta novos arquivos e desfaz pedidos de remoção. */
    reset() {
        this.clearItems()
        for (const entry of this.existing) entry.removed = false
        this.inputInSync = true
    }

    /** Executa um inspetor uma vez por arquivo; o resultado fica em cache até o arquivo ser removido. */
    inspect(name, item, run) {
        let entry = this.inspections.get(item.id)
        if (!entry) {
            entry = { controller: new AbortController(), results: new Map() }
            this.inspections.set(item.id, entry)
        }
        if (!entry.results.has(name)) {
            const promise = run(item.file, { signal: entry.controller.signal })
            promise.catch(() => entry.results.delete(name))
            entry.results.set(name, promise)
        }
        return entry.results.get(name)
    }

    snapshot() {
        return this.items.map(item => ({
            id: item.id,
            name: item.name,
            size: item.size,
            sizeText: formatBytes(item.size),
            type: item.type,
            previewUrl: item.previewUrl,
            errors: item.errors.slice(),
        }))
    }

    existingSnapshot() {
        return this.existing.map(e => ({ id: e.id, name: e.name, removed: e.removed }))
    }

    destroy() {
        this.clearItems()
        this.inspections.clear()
    }
}
