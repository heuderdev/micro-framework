/**
 * Eventos são CustomEvent disparados no <form>, com bubbles: true.
 * Cancelamento via event.preventDefault() somente nos eventos listados em CANCELABLE.
 */
export const EVENTS = {
    ready: 'form:ready',
    change: 'form:change',
    validating: 'form:validating',
    validated: 'form:validated',
    invalid: 'form:invalid',
    beforeSubmit: 'form:before-submit',
    submit: 'form:submit',
    progress: 'form:progress',
    uploaded: 'form:uploaded',
    processing: 'form:processing',
    success: 'form:success',
    error: 'form:error',
    cancel: 'form:cancel',
    reset: 'form:reset',
    destroy: 'form:destroy',
    fieldAdded: 'form:field-added',
    fieldRemoved: 'form:field-removed',
    reveal: 'form:reveal',
    configError: 'form:config-error',
}

const CANCELABLE = new Set([EVENTS.beforeSubmit, EVENTS.submit, EVENTS.reset, EVENTS.reveal])

export function dispatch(target, name, detail = {}) {
    const event = new CustomEvent(name, { bubbles: true, cancelable: CANCELABLE.has(name), detail })
    return target.dispatchEvent(event)
}
