import { expect } from '@playwright/test'

/** Abre um exemplo e espera todos os <form x-form> inicializarem. Falha em erro de página. */
export async function open(page, name) {
    const problems = []
    page.on('pageerror', error => problems.push(`[pageerror] ${error.message}`))
    await page.goto(`/examples/${name}.php`)
    await page.waitForFunction(() => {
        const forms = Array.from(document.querySelectorAll('form[x-form]'))
        return window.AlpineForm && forms.length > 0 && forms.every(f => window.AlpineForm.get(f)?.ready)
    })
    return problems
}

/** Lê (serializável) uma parte do estado público de um formulário. */
export function state(page, formId, pick = s => ({ phase: s.phase, errors: s.errors, result: s.result, error: s.error })) {
    return page.evaluate(([id, fn]) => JSON.parse(JSON.stringify(new Function('s', `return (${fn})(s)`)(window.AlpineForm.get(id)))), [formId, pick.toString()])
}

export async function waitPhase(page, formId, phases, timeout = 20_000) {
    const list = Array.isArray(phases) ? phases : [phases]
    await page.waitForFunction(([id, ps]) => ps.includes(window.AlpineForm.get(id)?.phase), [formId, list], { timeout })
}

export function caret(page, selector) {
    return page.locator(selector).evaluate(el => [el.selectionStart, el.selectionEnd])
}

export async function setCaret(page, selector, start, end = start) {
    await page.locator(selector).evaluate((el, [s, e]) => {
        el.focus()
        el.setSelectionRange(s, e)
    }, [start, end])
}

export { expect }
