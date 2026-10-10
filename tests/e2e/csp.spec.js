import { test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { state, waitPhase, expect } from './helpers.js'

/*
 * Página servida com CSP estrita (sem 'unsafe-eval'/'unsafe-inline') e versão CSP do Alpine.
 * Com ?tt=1 a política exige também Trusted Types. Nenhuma violação de CSP é aceita.
 */
const PNG = readFileSync(new URL('../../node_modules/playwright-core/lib/server/chromium/appIcon.png', import.meta.url))

for (const variante of ['', '?tt=1']) {
    test(`CSP estrita${variante ? ' + Trusted Types' : ''}: validação, máscara, remota, envio e upload sem violações`, async ({ page }) => {
        const problems = []
        page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
        page.on('console', m => {
            if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`)
        })
        await page.addInitScript(() => {
            document.addEventListener('securitypolicyviolation', e => console.error(`CSP violada: ${e.violatedDirective} ${e.blockedURI}`))
        })

        const response = await page.goto(`/examples/csp.php${variante}`)
        expect(response.headers()['content-security-policy']).toContain("script-src 'self'")
        expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval')
        await page.waitForFunction(() => ['csp-cadastro', 'csp-arquivo'].every(id => window.AlpineForm.get(id)?.ready))

        await page.fill('#nome', 'ab')
        await page.press('#nome', 'Tab')
        await expect(page.locator('#nome')).toHaveAttribute('aria-invalid', 'true')

        await page.click('#cpf')
        await page.keyboard.type('52998224725')
        await expect(page.locator('#cpf')).toHaveValue('529.982.247-25')

        await page.fill('#email', 'admin@exemplo.com')
        await page.press('#email', 'Tab')
        await expect.poll(() => state(page, 'csp-cadastro', s => s.fields.email.errors)).toEqual(['Este e-mail já está cadastrado.'])

        await page.check('input[value=pj]')
        await expect(page.locator('#cnpj')).toBeVisible()
        await page.check('input[value=pf]')
        await expect(page.locator('#cnpj')).toBeHidden()

        await page.fill('#nome', 'Maria Silva')
        await page.fill('#email', `csp${Date.now()}@exemplo.com`)
        await page.fill('#senha', 'segredo123')
        await page.fill('#senha_confirmacao', 'segredo123')
        await page.check('input[name=termos]')
        await page.click('#csp-cadastro button[type=submit]')
        await waitPhase(page, 'csp-cadastro', ['success', 'error'])
        expect(await state(page, 'csp-cadastro', s => s.phase)).toBe('success')
        await expect(page.locator('#csp-cadastro .ok')).toHaveText('Cadastro realizado com sucesso.')

        const upload = page.waitForRequest(r => r.url().endsWith('/api/upload'))
        await page.setInputFiles('#foto', { name: 'foto.png', mimeType: 'image/png', buffer: PNG })
        await expect(page.locator('#csp-arquivo img')).toHaveAttribute('src', /^blob:/)
        await page.click('#csp-arquivo button[type=submit]')
        expect((await upload).headers()['x-origem']).toBe('exemplo-csp')
        await waitPhase(page, 'csp-arquivo', ['success', 'error'])
        expect(await state(page, 'csp-arquivo', s => s.phase)).toBe('success')
        await expect(page.locator('#csp-arquivo .hint')).toHaveText('Arquivo recebido pelo servidor.')

        expect(problems).toEqual([])
    })
}
