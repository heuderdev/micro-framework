import Alpine from 'alpinejs'
import { AlpineFormPlugin, AlpineForm } from '../../src/index.js'

let started = false

export function startAlpine(...plugins) {
    if (started) return Alpine
    for (const plugin of plugins) AlpineForm.use(plugin)
    window.Alpine = Alpine
    Alpine.plugin(AlpineFormPlugin)
    Alpine.start()
    started = true
    return Alpine
}

export const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

export async function flush(times = 3) {
    for (let i = 0; i < times; i++) {
        await Promise.resolve()
        await tick(0)
    }
}

export async function mount(html) {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    document.body.appendChild(wrapper)
    await flush()
    const form = wrapper.querySelector('form')
    return { wrapper, form, api: form ? AlpineForm.get(form) : null }
}

export function type(el, value, { inputType = 'insertText' } = {}) {
    el.focus?.()
    el.value = value
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: value }))
}

export function blur(el) {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

export function change(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function fakeTransport(handler) {
    const calls = []
    const transport = async request => {
        calls.push(request)
        return handler(request, calls.length)
    }
    transport.calls = calls
    return transport
}

export function jsonResponse(status, body, headers = {}) {
    const all = { 'content-type': 'application/json', ...headers }
    return {
        status,
        statusText: '',
        url: 'http://localhost/api',
        redirected: false,
        headers: { get: name => all[name.toLowerCase()] ?? null },
        text: body === undefined ? '' : JSON.stringify(body),
    }
}

export function textResponse(status, text, contentType = 'text/html') {
    return { status, statusText: '', url: 'http://localhost/api', redirected: false, headers: { get: n => (n.toLowerCase() === 'content-type' ? contentType : null) }, text }
}

export { Alpine, AlpineForm }
