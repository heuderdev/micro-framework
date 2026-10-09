import { afterEach } from 'vitest'

if (typeof globalThis.CSS === 'undefined') globalThis.CSS = {}
if (typeof CSS.escape !== 'function') CSS.escape = value => String(value).replace(/["\\]/g, ch => `\\${ch}`)
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = function () {}
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = cb => setTimeout(cb, 0)

/* jsdom não implementa Blob.arrayBuffer/text (presentes em todos os navegadores suportados). Polyfill só para testes. */
function readAs(blob, method) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader[method](blob)
    })
}
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () { return readAs(this, 'readAsArrayBuffer').then(buffer => { const copy = Buffer.from(new Uint8Array(buffer)); return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) }) }
if (typeof Blob !== 'undefined' && !Blob.prototype.text) Blob.prototype.text = function () { return readAs(this, 'readAsText') }

afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
})
