/**
 * Carrega cada exemplo HTML de docs/*.html no Chrome real, com todos os módulos,
 * e confere que os formulários inicializam sem erro de configuração nem erro no console.
 *
 *   npm run serve:test   (servidor em 127.0.0.1:8099; ou deixe o Playwright reutilizar um já aberto)
 *   node scripts/check-docs-browser.mjs
 *
 * Fragmentos sem <form> são envolvidos num formulário de teste. Blocos JS da mesma página
 * que registram extensões (AlpineForm.validator/normalizer/remoteAdapter/component) são
 * executados antes do Alpine, como nas instruções da documentação.
 * Blocos com PHP, Blade, reticências ou marcados como "Errado" são ignorados.
 */
import { chromium } from 'playwright'
import { readFileSync, readdirSync } from 'node:fs'

const ROOT = new URL('../', import.meta.url)
const BASE = process.env.DOCS_BASE_URL || 'http://127.0.0.1:8099'
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const EXTENSION_JS = /AlpineForm\.(validator|normalizer|remoteAdapter|component)\(/

const blocks = []
for (const file of readdirSync(new URL('docs/', ROOT)).filter(f => f.endsWith('.html'))) {
    const raw = readFileSync(new URL(`docs/${file}`, ROOT), 'utf8')
    const setup = [...raw.matchAll(/<code data-lang="js">([\s\S]*?)<\/code>/g)]
        .map(m => decode(m[1]))
        .filter(t => EXTENSION_JS.test(t) && !/^\s*(import|export) /m.test(t))
        .join('\n')
    for (const m of raw.matchAll(/<code data-lang="html">([\s\S]*?)<\/code>/g)) {
        const text = decode(m[1])
        if (/<\?php|\{\{|<!doctype|<head>|<link |Errado/.test(text)) continue
        if (!/data-form|x-form|\$form/.test(text)) continue
        if (/\.\.\.|…/.test(text)) continue
        if (/^\s*<(form|div)[^>]*>\s*$/.test(text)) continue
        blocks.push({ file, text, setup })
    }
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' })
let failures = 0
for (const [index, block] of blocks.entries()) {
    const hasForm = /<form[\s>]/.test(block.text) && /<\/form>/.test(block.text)
    const body = hasForm
        ? block.text
        : `<form id="wrap" x-data="{ tipo: 'pf', entrega: 'retirada', temCupom: false, itens: [{ id: 1 }], seq: 1, aba: 'dados' }" x-form action="/api/demo/sucesso" method="post" novalidate>\n${block.text}\n</form>`
    const html = `<!doctype html><html><head><meta charset="utf-8">
<script src="/dist/alpine-form.js"></script>
<script src="/dist/alpine-form-masks.js"></script>
<script src="/dist/alpine-form-chunks.js"></script>
<script src="/dist/alpine-form-inspectors.js"></script>
<script src="/dist/alpine-form-bootstrap.js"></script>
<script src="/dist/alpine-form-rascunho.js"></script>
<script src="/dist/alpine-form-lista.js"></script>
<script>${block.setup}</script>
<script defer src="/vendor/alpine.min.js"></script>
</head><body>${body}</body></html>`

    const page = await browser.newPage()
    const problems = []
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
    page.on('console', m => {
        if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) problems.push(`${m.type()}: ${m.text()}`)
    })
    await page.route(`${BASE}/__snippet`, route => route.fulfill({ contentType: 'text/html', body: html }))
    await page.goto(`${BASE}/__snippet`)
    await page.waitForTimeout(250)
    const results = await page.evaluate(async () => {
        const out = []
        for (const form of document.querySelectorAll('form[x-form]')) {
            const state = window.AlpineForm.get(form)
            if (!state) {
                out.push('formulário NÃO inicializado')
                continue
            }
            try {
                await state.validate()
            } catch (error) {
                out.push(`validate: ${error.message}`)
            }
            for (const e of state.configErrors) out.push(`config: ${e.message}`)
        }
        return out
    })
    const all = [...new Set([...results, ...problems])]
    if (all.length) {
        failures += 1
        console.log(`\n### ${block.file} (#${index})\n${block.text.slice(0, 200).replace(/\s+/g, ' ')}\n  - ${all.join('\n  - ')}`)
    }
    await page.close()
}
await browser.close()
console.log(`\n${blocks.length} exemplos carregados no navegador, ${failures} com problemas.`)
process.exit(failures ? 1 : 0)
