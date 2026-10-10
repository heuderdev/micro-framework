import { test } from '@playwright/test'
import { expect } from './helpers.js'

const textos = (page, sel) => page.locator(`${sel} option`).allTextContents()

async function abrir(page) {
    const problemas = []
    page.on('pageerror', e => problemas.push(e.message))
    page.on('console', m => {
        if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.text())
    })
    await page.goto('/examples/opcoes.php')
    return problemas
}

test.describe('selects dependentes (módulo alpine-form-opcoes)', () => {
    test('cadeia UF → cidade → bairro com backend real, troca de UF limpa a cadeia e envia', async ({ page }) => {
        const problemas = await abrir(page)
        await expect(page.locator('#e-uf option')).toHaveCount(5)
        await expect(page.locator('#e-cidade')).toBeDisabled()
        await page.selectOption('#e-uf', 'SP')
        await expect(page.locator('#e-cidade')).toHaveAttribute('data-form-opcoes-estado', 'carregando')
        await expect(page.locator('#e-cidade')).toBeEnabled()
        expect(await page.locator('#e-cidade optgroup').evaluateAll(gs => gs.map(g => g.label))).toEqual(['Capital', 'Interior', 'Litoral'])
        await page.selectOption('#e-cidade', '3550308')
        await expect(page.locator('#e-bairro')).toBeEnabled()
        await page.selectOption('#e-bairro', 'Mooca')

        await page.selectOption('#e-uf', 'RJ')
        await expect(page.locator('#e-bairro')).toBeDisabled()
        await expect.poll(() => textos(page, '#e-cidade')).toContain('Niterói')
        await expect(page.locator('#e-cidade')).toHaveValue('')

        await page.selectOption('#e-uf', 'AC')
        await expect.poll(() => textos(page, '#e-cidade')).toContain('Nenhuma cidade para esta UF')

        await page.selectOption('#e-uf', 'MG')
        await expect(page.locator('#e-cidade')).toBeEnabled()
        await page.selectOption('#e-cidade', '3106200')
        await expect(page.locator('#e-bairro')).toBeEnabled()
        await page.selectOption('#e-bairro', 'Savassi')
        await page.click('#endereco button[type=submit]')
        await expect(page.locator('#endereco pre')).toContainText('"bairro": "Savassi"')
        expect(problemas).toEqual([])
    })

    test('edição seleciona os valores salvos em cadeia; linhas repetidas têm cadeias independentes', async ({ page }) => {
        const problemas = await abrir(page)
        await expect(page.locator('#d-bairro')).toHaveValue('Icaraí')
        await expect(page.locator('#d-cidade')).toHaveValue('3303302')
        await expect(page.locator('#d-uf')).toHaveValue('RJ')

        await page.click('#entregas button:has-text("Adicionar entrega")')
        await expect(page.locator('#r-uf-2 option')).toHaveCount(5)
        await page.selectOption('#r-uf-1', 'SP')
        await page.selectOption('#r-uf-2', 'MG')
        await expect.poll(() => textos(page, '#r-cidade-2')).toContain('Uberlândia')
        await expect.poll(() => textos(page, '#r-cidade-1')).toContain('Campinas')
        expect(await textos(page, '#r-cidade-1')).not.toContain('Uberlândia')
        expect(problemas).toEqual([])
    })
})
