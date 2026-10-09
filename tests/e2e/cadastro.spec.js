import { test } from '@playwright/test'
import { open, state, waitPhase, expect } from './helpers.js'

test.describe('cadastro com validação ao vivo (backend real)', () => {
    test('erros só após interação, máscara de CPF, validação remota e envio com sucesso', async ({ page }) => {
        const problems = await open(page, 'cadastro')
        await expect(page.locator('.af-error:visible')).toHaveCount(0)

        await page.fill('#nome', 'ab')
        await page.press('#nome', 'Tab')
        await expect(page.locator('#nome')).toHaveAttribute('aria-invalid', 'true')
        const describedBy = await page.locator('#nome').getAttribute('aria-describedby')
        await expect(page.locator(`#${describedBy.split(' ').at(-1)}`)).toHaveText('Digite pelo menos 3 caracteres.')

        await page.fill('#nome', 'Maria Silva')
        await expect(page.locator('#nome')).not.toHaveAttribute('aria-invalid', 'true')

        await page.click('#cpf')
        await page.keyboard.type('52998224725')
        await expect(page.locator('#cpf')).toHaveValue('529.982.247-25')

        await page.fill('#email', 'admin@exemplo.com')
        await page.press('#email', 'Tab')
        await expect.poll(() => state(page, 'cadastro', s => s.fields.email.errors)).toEqual(['Este e-mail já está cadastrado.'])
        await page.fill('#email', 'nova.pessoa@exemplo.com')
        await expect.poll(() => state(page, 'cadastro', s => s.fields.email.errors)).toEqual([])

        await page.fill('#senha', 'segredo123')
        await page.fill('#senha_confirmacao', 'segredo12')
        await page.press('#senha_confirmacao', 'Tab')
        await expect.poll(() => state(page, 'cadastro', s => s.fields.senha_confirmacao.errors)).toEqual(['As senhas não conferem.'])
        await page.fill('#senha', 'segredo12')
        await expect.poll(() => state(page, 'cadastro', s => s.fields.senha_confirmacao.errors)).toEqual([])

        await page.check('input[name=termos]')
        const posted = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/cadastro'))
        await page.click('button[type=submit]')
        const request = await posted
        /* exibido formatado, enviado bruto (data-form-submit-value="raw"); um único valor, sem hidden duplicado */
        expect(request.postData()).toMatch(/name="cpf"\r\n\r\n52998224725\r\n/)
        expect(request.postData().match(/name="cpf"/g)).toHaveLength(1)
        expect(request.headers()['idempotency-key']).toBeTruthy()
        await waitPhase(page, 'cadastro', ['success', 'error'])
        const final = await state(page, 'cadastro')
        expect(final.phase).toBe('success')
        expect(final.result.data.id).toMatch(/^[0-9a-f]{16}$/)
        expect(problems).toEqual([])
    })

    test('envio inválido mostra os erros nos campos, foca o primeiro e não chama o servidor', async ({ page }) => {
        await open(page, 'cadastro')
        let posted = false
        page.on('request', request => {
            if (request.method() === 'POST' && request.url().endsWith('/api/cadastro')) posted = true
        })
        await page.click('button[type=submit]')
        await expect(page.locator('#nome')).toBeFocused()
        await expect(page.locator('#nome')).toHaveAttribute('aria-invalid', 'true')
        await expect(page.locator('#cpf')).toHaveAttribute('aria-invalid', 'true')
        /* resumo padrão (data-form-summary="general") só lista erros sem campo */
        await expect(page.locator('.af-summary')).toHaveCount(0)
        expect(posted).toBe(false)
    })

    test('erro geral do servidor (sem campo) aparece no resumo', async ({ page }) => {
        await open(page, 'cadastro')
        await page.fill('#nome', 'erro geral')
        await page.fill('#email', 'geral@exemplo.com')
        await page.click('#cpf')
        await page.keyboard.type('52998224725')
        await page.fill('#senha', 'segredo123')
        await page.fill('#senha_confirmacao', 'segredo123')
        await page.check('input[name=termos]')
        await page.click('button[type=submit]')
        await waitPhase(page, 'cadastro', ['success', 'error'])
        const s = await state(page, 'cadastro', s => ({ phase: s.phase, general: s.generalErrors }))
        expect(s.phase).toBe('error')
        expect(s.general.length).toBeGreaterThan(0)
        await expect(page.locator('.af-summary')).toContainText(s.general[0])
    })
})
