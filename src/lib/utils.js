let uidCounter = 0

export function uid(prefix = 'af') {
    uidCounter += 1
    return `${prefix}${uidCounter}`
}

export function randomId(bytes = 16) {
    const c = globalThis.crypto
    if (c && typeof c.getRandomValues === 'function') {
        const buf = new Uint8Array(bytes)
        c.getRandomValues(buf)
        return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
    }
    throw new Error('crypto.getRandomValues indisponível: não é possível gerar identificadores imprevisíveis.')
}

export function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

export function debounce(fn, wait) {
    let timer = null
    const debounced = (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            fn(...args)
        }, wait)
    }
    debounced.cancel = () => {
        clearTimeout(timer)
        timer = null
    }
    debounced.flush = (...args) => {
        debounced.cancel()
        fn(...args)
    }
    debounced.pending = () => timer !== null
    return debounced
}

export function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason)
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        const onAbort = () => {
            clearTimeout(timer)
            reject(signal.reason)
        }
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

export function cssEscape(value) {
    if (globalThis.CSS && typeof CSS.escape === 'function') return CSS.escape(value)
    return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch.codePointAt(0).toString(16)} `)
}

export function isEmptyValue(value) {
    if (value === null || value === undefined) return true
    if (typeof value === 'string') return value.trim() === ''
    if (Array.isArray(value)) return value.length === 0
    return false
}

/** Comprimento em code points (emoji 😀 conta 1; sequências ZWJ contam cada code point). */
export function textLength(value) {
    let count = 0
    for (const _ of String(value)) count += 1
    return count
}

export function arraysEqual(a, b) {
    if (a === b) return true
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => valuesEqual(item, b[index]))
}

export function valuesEqual(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) return arraysEqual(a, b)
    if (a && b && typeof a === 'object' && typeof b === 'object' && 'id' in a && 'id' in b) return a.id === b.id
    return a === b
}

export function toArray(value) {
    if (value == null) return []
    return Array.isArray(value) ? value : [value]
}

export function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isVisible(el) {
    if (!el || !el.isConnected) return false
    if (typeof el.checkVisibility === 'function') return el.checkVisibility()
    return el.getClientRects().length > 0
}

export function truncate(text, max = 60) {
    const chars = Array.from(String(text))
    return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('')
}
