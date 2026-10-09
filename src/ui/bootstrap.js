export const BOOTSTRAP_CLASSES = {
    invalid: 'is-invalid',
    valid: 'is-valid',
    pending: 'af-pending',
    error: 'invalid-feedback d-block',
    errorItem: 'd-block',
    errorPending: 'af-error--pending text-body-secondary',
    summary: 'alert alert-danger',
    summaryTitle: 'fw-semibold mb-1',
    summaryList: 'mb-0',
    fileList: 'list-group mt-2',
    fileItem: 'list-group-item d-flex align-items-center gap-2',
    fileItemInvalid: 'list-group-item-danger',
    fileThumb: 'rounded border',
    fileName: 'text-break',
    fileSize: 'text-body-secondary small',
    fileErrors: 'text-danger small',
    fileRemove: 'btn btn-sm btn-outline-danger ms-auto',
    existingRemoved: 'opacity-50 text-decoration-line-through',
    dropzoneOver: 'border-primary bg-body-tertiary',
}

/**
 * Adaptador Bootstrap 5 (compatível com as classes is-invalid/invalid-feedback do Bootstrap 4).
 * Posicionamento: após .input-group, dentro de .form-floating, após o último .form-check do grupo.
 * O Bootstrap não é carregado pela biblioteca; inclua o CSS dele na página.
 * A classe base vem da API pública (AlpineForm.internals.DefaultUiAdapter) para não duplicar o núcleo no bundle.
 */
export function makeBootstrapAdapter(DefaultUiAdapter) {
    return class BootstrapUiAdapter extends DefaultUiAdapter {
        constructor(ctx, options = {}) {
            super(ctx, { ...options, classes: { ...BOOTSTRAP_CLASSES, ...(options.classes || {}) } })
        }

        anchorFor(field) {
            const last = field.controls[field.controls.length - 1]
            if (field.kind === 'radio' || field.kind === 'checkbox-group' || field.kind === 'checkbox') {
                const check = last.closest('.form-check')
                if (check) {
                    if (field.controls.length > 1) {
                        const fieldset = field.primary.closest('fieldset')
                        if (fieldset && field.controls.every(c => fieldset.contains(c))) return { parent: fieldset, before: null }
                    }
                    return { parent: check.parentNode, before: check.nextSibling }
                }
            }
            const floating = last.closest('.form-floating')
            if (floating) return { parent: floating, before: null }
            const group = last.closest('.input-group')
            if (group) return { parent: group.parentNode, before: group.nextSibling }
            return super.anchorFor(field)
        }
    }
}

/**
 * Registra o adaptador "bootstrap". Ative por formulário com data-form-ui="bootstrap"
 * ou globalmente com AlpineForm.configure({ ui: 'bootstrap' }).
 */
export default function bootstrapPlugin(AlpineForm) {
    if (AlpineForm.registry.has('uiAdapter', 'bootstrap')) return
    const BootstrapUiAdapter = makeBootstrapAdapter(AlpineForm.internals.DefaultUiAdapter)
    AlpineForm.uiAdapter('bootstrap', (ctx, options) => new BootstrapUiAdapter(ctx, options))
}
