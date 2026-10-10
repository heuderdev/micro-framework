import { test } from '@playwright/test'
import { expect } from './helpers.js'

async function abrir(page) {
    const problemas = []
    page.on('pageerror', e => problemas.push(e.message))
    page.on('console', m => {
        if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) problemas.push(m.text())
    })
    await page.goto('/examples/preencher.php')
    await expect(page.locator('#e-uf option')).toHaveCount(5)
    return problemas
}

test.describe('autopreenchimento (módulo alpine-form-preencher)', () => {
    test('CEP preenche endereço, UF e cidade dependentes; não troca o que foi digitado; envia', async ({ page }) => {
        const problemas = await abrir(page)
        await page.fill('#e-bairro', 'Bairro digitado')
        await page.locator('#e-cep').pressSequentially('24020000', { delay: 20 })
        await expect(page.locator('#e-cep')).toHaveValue('24020-000')
        await expect(page.locator('#e-cidade')).toHaveValue('3303302')
        await expect(page.locator('#e-uf')).toHaveValue('RJ')
        await expect(page.locator('#e-logradouro')).toHaveValue('Rua da Conceição')
        await expect(page.locator('#e-bairro')).toHaveValue('Bairro digitado')

        await page.fill('#e-cep', '')
        await page.locator('#e-cep').pressSequentially('30130010', { delay: 20 })
        await expect(page.locator('#e-cidade')).toHaveValue('3106200')
        await expect(page.locator('#e-logradouro')).toHaveValue('Praça Sete de Setembro')

        await page.fill('#e-numero', '42')
        await page.click('#endereco button[type=submit]')
        await expect(page.locator('#endereco pre')).toContainText('"cidade": "3106200"')
        expect(problemas).toEqual([])
    })

    test('CEP inexistente mostra o erro no campo; CNPJ preenche com chaves aninhadas', async ({ page }) => {
        const problemas = await abrir(page)
        await page.locator('#e-cep').pressSequentially('01001001', { delay: 20 })
        await expect(page.locator('#endereco')).toContainText('CEP não encontrado. Confira ou preencha o endereço manualmente.')
        await expect(page.locator('#e-cep')).toHaveAttribute('aria-invalid', 'true')

        await page.locator('#c-cnpj').pressSequentially('11222333000181', { delay: 10 })
        await expect(page.locator('#c-razao')).toHaveValue('Empresa Exemplo Comércio Ltda')
        await expect(page.locator('#c-cep')).toHaveValue('01001-000')
        await expect(page.locator('#c-numero')).toHaveValue('100')
        expect(problemas).toEqual([])
    })
})
