/**
 * Acesso a propriedades do <form> imune a "DOM clobbering": um controle chamado name="id",
 * "elements", "submit" ou "reset" sobrescreve form.id, form.elements, form.submit() e form.reset().
 * Por isso usamos os getters/métodos do protótipo e getAttribute.
 */
const proto = () => HTMLFormElement.prototype

export function formId(form) {
    return Element.prototype.getAttribute.call(form, 'id') || ''
}

export function formElements(form) {
    return Array.from(Object.getOwnPropertyDescriptor(proto(), 'elements').get.call(form))
}

export function formReset(form) {
    proto().reset.call(form)
}

export function formSubmit(form) {
    proto().submit.call(form)
}

export function formRequestSubmit(form, submitter) {
    if (typeof proto().requestSubmit !== 'function') {
        formSubmit(form)
        return
    }
    if (submitter) proto().requestSubmit.call(form, submitter)
    else proto().requestSubmit.call(form)
}
