import { test } from '@playwright/test'
import { open, state, waitPhase, expect } from './helpers.js'

test.describe('rascunho automático (módulo alpine-form-rascunho)', () => {
    test('preenche, recarrega e recupera; senha e campo ignorado nunca vão para o storage; sucesso apaga', async ({ page }) => {
        await open(page, 'rascunho')
        await page.evaluate(() => localStorage.clear())
        await page.reload()
        await page.waitForFunction(() => window.AlpineForm.get('rascunho-cadastro')?.ready)

        await page.fill('#r-nome', 'Maria Silva')
        await page.fill('#r-email', `rascunho${Date.now()}@exemplo.com`)
        await page.click('#r-cpf')
        await page.keyboard.type('52998224725')
        await page.fill('#r-senha', 'segredo123')
        await page.fill('#r-senha2', 'segredo123')
        await page.check('input[value=telefone]')
        await page.fill('#r-obs', 'nao-guardar')
        await expect.poll(() => page.evaluate(() => localStorage.getItem('alpineform:rascunho:rascunho-cadastro'))).toContain('529.982.247-25')
        const guardado = await page.evaluate(() => localStorage.getItem('alpineform:rascunho:rascunho-cadastro'))
        expect(guardado).not.toMatch(/segredo123|nao-guardar/)

        await page.reload()
        await page.waitForFunction(() => window.AlpineForm.get('rascunho-cadastro')?.ready)
        await expect(page.locator('#r-nome')).toHaveValue('Maria Silva')
        await expect(page.locator('#r-cpf')).toHaveValue('529.982.247-25')
        await expect(page.locator('input[value=telefone]')).toBeChecked()
        await expect(page.locator('#r-senha')).toHaveValue('')
        await expect(page.locator('#r-obs')).toHaveValue('')
        await expect(page.getByText('Recuperamos o que você tinha preenchido')).toBeVisible()
        expect(await state(page, 'rascunho-cadastro', s => s.errors)).toEqual({})

        await page.fill('#r-senha', 'segredo123')
        await page.fill('#r-senha2', 'segredo123')
        await page.check('input[name=termos]')
        await page.click('#rascunho-cadastro button[type=submit]')
        await waitPhase(page, 'rascunho-cadastro', ['success', 'error'])
        expect(await state(page, 'rascunho-cadastro', s => s.phase)).toBe('success')
        await page.waitForTimeout(600)
        expect(await page.evaluate(() => localStorage.getItem('alpineform:rascunho:rascunho-cadastro'))).toBeNull()
    })

    test('"Limpar" apaga o rascunho', async ({ page }) => {
        await open(page, 'rascunho')
        await page.fill('#r-nome', 'Temporário')
        await expect.poll(() => page.evaluate(() => localStorage.getItem('alpineform:rascunho:rascunho-cadastro'))).toContain('Temporário')
        await page.click('#rascunho-cadastro button[type=reset]')
        await expect.poll(() => page.evaluate(() => localStorage.getItem('alpineform:rascunho:rascunho-cadastro'))).toBeNull()
    })
})
