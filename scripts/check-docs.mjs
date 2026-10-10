/**
 * Confere os exemplos de docs/*.html contra a biblioteca real:
 *   - todo atributo data-form-* usado existe no código-fonte;
 *   - todo data-form-v é aceito pelo parser (regras, parâmetros, combinações);
 *   - toda máscara de data-form-mask está registrada;
 *   - todo $form.metodo( e AlpineForm.metodo existe na API pública;
 *   - todo link interno aponta para uma página e âncora existentes.
 *
 *   node scripts/check-docs.mjs      (ou: npm run docs:check)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const ROOT = new URL('../', import.meta.url)
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const key of ['window', 'document', 'HTMLElement', 'HTMLFormElement', 'CustomEvent', 'MutationObserver', 'Node', 'Element', 'HTMLInputElement', 'Event', 'File', 'Blob', 'FormData', 'DOMParser']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key]
}

const { AlpineForm } = await import(new URL('src/index.js', ROOT))
const { parseRules } = await import(new URL('src/core/rule-parser.js', ROOT))
const { BUILTIN_MASKS } = await import(new URL('src/masks/definitions.js', ROOT))
const inspectors = await import(new URL('src/inspectors/index.js', ROOT))
AlpineForm.use(inspectors.default)
const rascunho = await import(new URL('src/rascunho/index.js', ROOT))
AlpineForm.use(rascunho.default)
const lista = await import(new URL('src/lista/index.js', ROOT))
AlpineForm.use(lista.default)
const opcoes = await import(new URL('src/opcoes/index.js', ROOT))
AlpineForm.use(opcoes.default)
const preencher = await import(new URL('src/preencher/index.js', ROOT))
AlpineForm.use(preencher.default)

function walk(dir) {
    return readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap(entry => {
        const rel = `${dir}${entry.name}`
        return entry.isDirectory() ? walk(`${rel}/`) : rel.endsWith('.js') ? [rel] : []
    })
}
const knownAttributes = new Set()
for (const file of walk('src/')) {
    for (const m of readFileSync(new URL(file, ROOT), 'utf8').matchAll(/['[,](data-form-[a-z0-9.-]*[a-z0-9])[\]'=]/g)) knownAttributes.add(m[1])
}
const knownPrefixes = ['data-form-msg.', 'data-form-header.']
const publicMethods = new Set(Object.keys(AlpineForm.attach(Object.assign(document.createElement('form'), { id: 'x' }))))
const globalApi = new Set(Object.keys(AlpineForm))
const customValidators = new Set()

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const problems = []
const pages = readdirSync(new URL('docs/', ROOT)).filter(f => f.endsWith('.html'))
const anchors = new Map(pages.map(p => [p, new Set([...readFileSync(new URL(`docs/${p}`, ROOT), 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))]))

// validadores registrados nos próprios exemplos (AlpineForm.validator('nome', ...)) são aceitos
for (const page of pages) {
    const html = decode(readFileSync(new URL(`docs/${page}`, ROOT), 'utf8'))
    for (const m of html.matchAll(/AlpineForm\.validator\('([a-z_][a-z0-9_]*)'/g)) customValidators.add(m[1])
    for (const m of html.matchAll(/AlpineForm\.fieldAttributes\(\[([^\]]*)\]/g)) {
        for (const a of m[1].matchAll(/'([^']+)'/g)) knownAttributes.add(a[1])
    }
}
for (const name of customValidators) if (!AlpineForm.registry.has('validator', name)) AlpineForm.validator(name, { rest: { name: 'args', type: 'string' }, validate: () => true })

let blocks = 0
for (const page of pages) {
    const raw = readFileSync(new URL(`docs/${page}`, ROOT), 'utf8')
    const report = msg => problems.push(`${page}: ${msg}`)

    for (const m of raw.matchAll(/href="([a-z0-9-]+\.html)?(?:#([^"]+))?"/g)) {
        const target = m[1] || page
        if (!m[1] && !m[2]) continue
        if (!anchors.has(target)) report(`link para página inexistente ${m[0]}`)
        else if (m[2] && !anchors.get(target).has(m[2])) report(`âncora inexistente ${m[0]}`)
    }

    const codes = [...raw.matchAll(/<code data-lang="(\w+)">([\s\S]*?)<\/code>/g)].map(m => ({ lang: m[1], text: decode(m[2]) }))
    const inline = [...raw.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(m => decode(m[1]))
    blocks += codes.length
    const all = [...codes.map(c => c.text), ...inline]

    for (const text of all) {
        for (const m of text.matchAll(/\b(data-form-[A-Za-z0-9.-]*[A-Za-z0-9])/g)) {
            const attr = m[1]
            if (knownAttributes.has(attr) || knownPrefixes.some(p => attr.startsWith(p) && attr.length > p.length)) continue
            if (/^data-form-[a-z-]+-\*?$/.test(attr)) continue
            report(`atributo desconhecido "${attr}"`)
        }
    }
    for (const { text } of codes) {
        if (text.includes('<!-- Errado -->')) continue   // contraexemplo intencional
        for (const m of text.matchAll(/(?<![:\w-])data-form-v="([^"]*)"/g)) {
            if (m[1].includes('${') || m[1].includes('…')) continue
            try {
                parseRules(m[1])
            } catch (error) {
                report(`data-form-v="${m[1]}": ${error.message}`)
            }
        }
        for (const m of text.matchAll(/(?<![:\w-])data-form-mask="([^"]*)"/g)) {
            if (!BUILTIN_MASKS[m[1]]) report(`máscara desconhecida "${m[1]}"`)
        }
        for (const m of text.matchAll(/\$form\.([a-zA-Z]+)\s*\(/g)) {
            if (!publicMethods.has(m[1])) report(`método $form.${m[1]}() não existe`)
        }
        for (const m of text.matchAll(/\bAlpineForm\.([a-zA-Z]+)/g)) {
            if (!globalApi.has(m[1])) report(`AlpineForm.${m[1]} não existe`)
        }
    }
}

if (problems.length) {
    console.error(problems.join('\n'))
    console.error(`\n${problems.length} problema(s) em ${pages.length} páginas.`)
    process.exit(1)
}
console.log(`OK: ${pages.length} páginas, ${blocks} blocos de código conferidos.`)
