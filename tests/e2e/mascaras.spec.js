import { test } from '@playwright/test'
import { open, state, waitPhase, caret, setCaret, expect } from './helpers.js'

test.describe('máscaras em navegador real', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, 'mascaras')
    })

    test('CPF/CNPJ alterna dinamicamente conforme a quantidade de caracteres', async ({ page }) => {
        await page.click('#documento')
        await page.keyboard.type('52998224725')
        await expect(page.locator('#documento')).toHaveValue('529.982.247-25')
        await page.keyboard.type('000')
        await expect(page.locator('#documento')).toHaveValue('52.998.224/7250-00')
        await page.keyboard.press('Backspace')
        await page.keyboard.press('Backspace')
        await page.keyboard.press('Backspace')
        await expect(page.locator('#documento')).toHaveValue('529.982.247-25')
    })

    test('inserção no meio mantém o cursor logo após o caractere digitado', async ({ page }) => {
        await page.click('#documento')
        await page.keyboard.type('5299822472')
        await expect(page.locator('#documento')).toHaveValue('529.982.247-2')
        await setCaret(page, '#documento', 1)
        await page.keyboard.type('0')
        await expect(page.locator('#documento')).toHaveValue('502.998.224-72')
        expect(await caret(page, '#documento')).toEqual([2, 2])
    })

    test('Backspace logo após um literal apaga o dígito anterior ao separador', async ({ page }) => {
        await page.click('#documento')
        await page.keyboard.type('52998224725')
        await setCaret(page, '#documento', 4)
        await page.keyboard.press('Backspace')
        await expect(page.locator('#documento')).toHaveValue('529.822.472-5')
        expect(await caret(page, '#documento')).toEqual([2, 2])
    })

    test('substituir uma seleção pelo teclado', async ({ page }) => {
        await page.click('#telefone')
        await page.keyboard.type('11987654321')
        await expect(page.locator('#telefone')).toHaveValue('(11) 98765-4321')
        await setCaret(page, '#telefone', 1, 3)
        await page.keyboard.type('2')
        /* 10 dígitos: volta ao formato de telefone fixo */
        await expect(page.locator('#telefone')).toHaveValue('(29) 8765-4321')
        expect(await caret(page, '#telefone')).toEqual([2, 2])
    })

    test('telefone fixo e celular; colagem formatada e bruta produzem o mesmo valor', async ({ page, context }) => {
        await page.click('#telefone')
        await page.keyboard.type('1134567890')
        await expect(page.locator('#telefone')).toHaveValue('(11) 3456-7890')

        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        for (const pasted of ['(11) 98765-4321', '11987654321']) {
            await page.fill('#telefone', '')
            await page.evaluate(text => navigator.clipboard.writeText(text), pasted)
            await page.focus('#telefone')
            await page.keyboard.press('Control+V')
            await expect(page.locator('#telefone')).toHaveValue('(11) 98765-4321')
            expect(await state(page, 'mascaras', s => s.getValue('telefone', { as: 'raw' }))).toBe('11987654321')
        }
    })

    test('moeda pt-BR: digitação livre com vírgula decimal; canônico é string decimal exata', async ({ page }) => {
        await page.click('#valor')
        await page.keyboard.type('1234,5')
        await expect(page.locator('#valor')).toHaveValue(/^R\$\s1\.234,5$/)
        expect(await state(page, 'mascaras', s => s.getValue('valor', { as: 'canonical' }))).toBe('1234.50')
        /* casas além da escala são descartadas, não arredondadas */
        await page.keyboard.type('67')
        await expect(page.locator('#valor')).toHaveValue(/^R\$\s1\.234,56$/)
        await page.press('#valor', 'Tab')
        expect(await state(page, 'mascaras', s => s.getValue('valor', { as: 'canonical' }))).toBe('1234.56')
        /* zeros à esquerda removidos */
        await page.fill('#valor', '')
        await page.click('#valor')
        await page.keyboard.type('0071')
        await expect(page.locator('#valor')).toHaveValue(/^R\$\s71$/)
    })

    test('valor inicial formatado sem sujar; setValue pela API; reset restaura', async ({ page }) => {
        await expect(page.locator('#cep-m')).toHaveValue('01310-100')
        expect(await state(page, 'mascaras', s => s.dirty)).toBe(false)

        await page.getByRole('button', { name: /setValue\(valor/ }).click()
        await expect(page.locator('#valor')).toHaveValue(/^R\$\s1\.234,50$/)
        await page.getByRole('button', { name: /CNPJ alfanumérico/ }).click()
        await expect(page.locator('#documento')).toHaveValue('12.ABC.345/01DE-35')
        expect(await state(page, 'mascaras', s => s.dirty)).toBe(true)

        await page.fill('#cep-m', '')
        await page.click('button[type=reset]')
        await expect(page.locator('#cep-m')).toHaveValue('01310-100')
        await expect(page.locator('#valor')).toHaveValue('')
        await expect.poll(() => state(page, 'mascaras', s => s.dirty)).toBe(false)
    })

    test('padrão personalizado com caixa alta e envio JSON das representações configuradas', async ({ page }) => {
        await page.click('#codigo')
        await page.keyboard.type('abc1234')
        await expect(page.locator('#codigo')).toHaveValue('ABC-1234')

        await page.click('#documento')
        await page.keyboard.type('52998224725')
        await page.click('#telefone')
        await page.keyboard.type('11987654321')
        await page.click('#valor')
        await page.keyboard.type('19,99')
        const posted = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/pagamento'))
        await page.click('button[type=submit]')
        const body = JSON.parse((await posted).postData())
        expect(body).toMatchObject({ documento: '52998224725', telefone: '11987654321', valor: '19.99', codigo: 'ABC-1234', cep: '01310-100' })
        await waitPhase(page, 'mascaras', ['success', 'error'])
        expect(await state(page, 'mascaras', s => s.phase)).toBe('success')
    })
})
