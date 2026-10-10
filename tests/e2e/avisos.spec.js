import { test } from '@playwright/test'
import { expect } from './helpers.js'

async function abrir(page) {
    const problemas = []
    page.on('pageerror', e => problemas.push(e.message))
    page.on('console', m => {
        if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.text())
    })
    await page.goto('/examples/avisos.php')
    return problemas
}

test.describe('avisos e confirmação (módulo alpine-form-avisos)', () => {
    test('cadastro mostra o aviso do servidor e atualiza a lista; avisos pelo código', async ({ page }) => {
        const problemas = await abrir(page)
        await page.fill('#a-nome', 'Aviso E2E')
        await page.fill('#a-email', 'aviso@exemplo.com')
        await page.selectOption('#a-uf', 'MG')
        await page.click('#cadastro button[type=submit]')
        await expect(page.locator('.af-avisos [role=status] .af-aviso--sucesso')).toHaveText(/Cliente cadastrado\./)
        await expect(page.locator('#clientes li').first()).toHaveText('Aviso E2E (MG)')

        await page.click('#b-erro')
        await expect(page.locator('.af-avisos [role=alert] .af-aviso--erro')).toContainText('Não foi possível gerar o relatório.')
        await page.click('#b-fixo')
        const fixo = page.locator('.af-aviso--aviso')
        await fixo.locator('.af-aviso-fechar').click()
        await expect(fixo).toHaveCount(0)
        expect(problemas).toEqual([])
    })

    test('confirmação no botão: Esc e Cancelar não enviam; Excluir envia; teclado preso no diálogo', async ({ page }) => {
        const problemas = await abrir(page)
        const envios = []
        page.on('request', r => {
            if (r.url().includes('/api/demo/sucesso')) envios.push(r.postData())
        })
        await page.click('#b-salvar')
        await expect.poll(() => envios.length).toBe(1)
        await expect(page.locator('dialog.af-confirmar')).toHaveCount(0)

        await page.click('#b-excluir')
        const dialogo = page.locator('dialog.af-confirmar')
        await expect(dialogo).toBeVisible()
        await expect(dialogo.locator('h2')).toHaveText('Excluir pedido?')
        await expect(dialogo.locator('.af-confirmar-cancelar')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(dialogo.locator('.af-confirmar-ok')).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(dialogo).toHaveCount(0)
        await expect(page.locator('#b-excluir')).toBeFocused()

        await page.click('#b-excluir')
        await dialogo.locator('.af-confirmar-cancelar').click()
        await expect(dialogo).toHaveCount(0)
        expect(envios).toHaveLength(1)

        await page.click('#b-excluir')
        await dialogo.locator('.af-confirmar-ok').click()
        await expect.poll(() => envios.length).toBe(2)
        expect(envios[1]).toContain('excluir')
        await expect(page.locator('.af-aviso--sucesso').last()).toContainText('Recebido.')

        await page.click('#b-perguntar')
        await page.locator('dialog.af-confirmar .af-confirmar-ok').click()
        await expect(page.locator('#resposta')).toHaveText('descartou')
        expect(problemas).toEqual([])
    })
})
