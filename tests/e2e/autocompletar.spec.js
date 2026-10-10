import { test } from '@playwright/test'
import { expect } from './helpers.js'

async function abrir(page) {
    const problemas = []
    page.on('pageerror', e => problemas.push(e.message))
    page.on('console', m => {
        if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.text())
    })
    await page.goto('/examples/autocompletar.php')
    return problemas
}

test.describe('autocompletar (módulo alpine-form-autocompletar)', () => {
    test('busca na API real, teclado escolhe, copia e-mail/UF e envia o id', async ({ page }) => {
        const problemas = await abrir(page)
        const buscas = []
        page.on('request', r => {
            if (r.url().includes('/api/demo/clientes')) buscas.push(new URL(r.url()).searchParams.get('busca'))
        })
        const input = page.locator('#p-cliente')
        await input.pressSequentially('ana alm', { delay: 30 })
        const opcoes = page.locator('#pedido [role=option]')
        await expect(opcoes.first()).toBeVisible()
        expect(buscas).toEqual(['ana alm'])
        await expect(input).toHaveAttribute('aria-expanded', 'true')
        await page.keyboard.press('ArrowDown')
        await expect(input).toHaveAttribute('aria-activedescendant', /-0$/)
        const texto = (await opcoes.first().locator('.af-autocompletar-texto').textContent()).trim()
        await page.keyboard.press('Enter')
        await expect(input).toHaveValue(texto)
        await expect(input).toHaveAttribute('aria-expanded', 'false')
        await expect(page.locator('#p-email')).toHaveValue(/@exemplo\.com$/)
        await expect(page.locator('#p-uf')).toHaveValue(/^[A-Z]{2}$/)

        await page.click('#pedido button[type=submit]')
        await expect(page.locator('#pedido pre')).toContainText('"cliente_id": "17"')
        expect(problemas).toEqual([])
    })

    test('texto sem escolha é recusado pelo required; clique escolhe; edição e desfazer', async ({ page }) => {
        const problemas = await abrir(page)
        const input = page.locator('#p-cliente')
        await input.pressSequentially('lucas', { delay: 20 })
        await expect(page.locator('#pedido [role=option]').first()).toBeVisible()
        await page.keyboard.press('Escape')                       // fecha a lista sem escolher
        await expect(input).toHaveAttribute('aria-expanded', 'false')
        await input.press('Enter')                                 // lista fechada: Enter envia o formulário
        await expect(input).toHaveAttribute('aria-invalid', 'true')
        await expect(input).toBeFocused()

        await input.fill('')
        await input.pressSequentially('lucas', { delay: 20 })
        await page.locator('#pedido [role=option]').first().click()
        await expect(input).not.toHaveAttribute('aria-invalid', 'true')

        const edicao = page.locator('#e-cliente')
        await expect(page.locator('#e-valor')).toHaveText('17')
        await edicao.fill('')
        await edicao.pressSequentially('bruno', { delay: 20 })
        await page.locator('#edicao [role=option]').first().click()
        await expect(page.locator('#e-valor')).not.toHaveText('17')
        await page.click('#edicao button:has-text("Desfazer")')
        await expect(page.locator('#e-valor')).toHaveText('17')
        await expect(edicao).toHaveValue('Ana Almeida')
        expect(problemas).toEqual([])
    })
})
