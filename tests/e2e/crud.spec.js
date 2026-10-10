import { test } from '@playwright/test'
import { expect } from './helpers.js'

test.describe('CRUD completo com o pacote único (alpine-form-completo)', () => {
    test('cadastra com CEP, edita, exclui com confirmação; a tabela e os avisos acompanham', async ({ page }) => {
        const problemas = []
        page.on('pageerror', e => problemas.push(e.message))
        page.on('console', m => {
            if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.text())
        })
        await page.goto('/examples/crud.php')
        await page.waitForFunction(() => window.AlpineForm.lista?.get('clientes')?.carregado)
        await expect(page.locator('#c-uf option')).toHaveCount(5)
        const nome = `CRUD E2E ${Date.now()}`

        // cadastro: CEP preenche UF e cidade
        await page.fill('#c-nome', nome)
        await page.fill('#c-email', 'crud@exemplo.com')
        await page.locator('#c-cep').pressSequentially('24020000', { delay: 15 })
        await expect(page.locator('#c-cidade')).toHaveValue('3303302')
        await page.click('#cliente-form button[type=submit]')
        await expect(page.locator('.af-aviso--sucesso').last()).toContainText('Cliente cadastrado.')
        const linha = page.locator('#clientes tbody tr', { hasText: nome })
        await expect(linha).toHaveCount(1)
        await expect(linha).toHaveClass(/linha-nova/)
        await expect(page.locator('#c-nome')).toHaveValue('')

        // edição
        await linha.getByRole('button', { name: `Editar ${nome}` }).click()
        await expect(page.locator('#cliente-form h2')).toHaveText(/Editar cliente #\d+/)
        await expect(page.locator('#c-nome')).toHaveValue(nome)
        await expect(page.locator('#c-uf')).toHaveValue('RJ')
        await expect(page.locator('#c-cidade')).toHaveValue('3303302')
        await page.fill('#c-nome', `${nome} editado`)
        await page.click('#cliente-form button[type=submit]')
        await expect(page.locator('.af-aviso--sucesso').last()).toContainText('Cliente atualizado.')
        const editada = page.locator('#clientes tbody tr', { hasText: `${nome} editado` })
        await expect(editada).toHaveCount(1)
        await expect(page.locator('#cliente-form h2')).toHaveText('Novo cliente')

        // exclusão: cancelar não exclui; confirmar exclui
        await editada.getByRole('button', { name: `Excluir ${nome} editado` }).click()
        const dialogo = page.locator('dialog.af-confirmar')
        await expect(dialogo).toContainText(`O cliente ${nome} editado será excluído.`)
        await dialogo.locator('.af-confirmar-cancelar').click()
        await expect(editada).toHaveCount(1)
        await editada.getByRole('button', { name: `Excluir ${nome} editado` }).click()
        await dialogo.locator('.af-confirmar-ok').click()
        await expect(page.locator('.af-aviso--sucesso').last()).toContainText('Cliente excluído.')
        await expect(page.locator('#clientes tbody tr', { hasText: nome })).toHaveCount(0)
        expect(problemas).toEqual([])
    })
})
