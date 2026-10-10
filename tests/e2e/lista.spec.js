import { test } from '@playwright/test'
import { expect } from './helpers.js'

const estado = (page, id) => page.evaluate(i => {
    const s = window.AlpineForm.lista.get(i)
    return { pagina: s.pagina, total: s.total, itens: s.itens.length, carregando: s.carregando, ordem: s.ordem, direcao: s.direcao, filtros: s.filtros, selecionados: s.selecionados.length, resumo: s.resumo }
}, id)

async function abrir(page, consulta = '') {
    const problemas = []
    page.on('pageerror', e => problemas.push(e.message))
    page.on('console', m => {
        if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.text())
    })
    await page.goto(`/examples/lista.php${consulta}`)
    await page.waitForFunction(() => window.AlpineForm.lista?.get('clientes')?.carregado && window.AlpineForm.lista.get('cards')?.carregado)
    return problemas
}

test.describe('listagens (módulo alpine-form-lista)', () => {
    test('pagina, ordena, filtra com espera, sincroniza a URL e recarregar a página restaura a visão', async ({ page }) => {
        const problemas = await abrir(page)
        const requisicoes = []
        page.on('request', r => {
            if (r.url().includes('/api/demo/clientes?') && !r.url().includes('ms=')) requisicoes.push(new URL(r.url()).searchParams)
        })
        expect(await estado(page, 'clientes')).toMatchObject({ pagina: 1, total: 137, itens: 10, resumo: 'Mostrando 1–10 de 137' })
        await expect(page.locator('#clientes tbody tr:not([style*="display: none"])')).toHaveCount(10)

        await page.click('#clientes [data-lista-pagina="3"]')
        await expect.poll(() => estado(page, 'clientes').then(s => s.pagina)).toBe(3)
        await expect(page.locator('#clientes [data-lista-pagina="3"]')).toHaveAttribute('aria-current', 'page')
        expect(page.url()).toContain('page=3')

        await page.click('[data-lista-ordenar="saldo"]')
        await page.click('[data-lista-ordenar="saldo"]')
        await expect.poll(() => estado(page, 'clientes').then(s => `${s.ordem}:${s.direcao}:${s.pagina}`)).toBe('saldo:desc:1')
        await expect(page.locator('th:has([data-lista-ordenar="saldo"])')).toHaveAttribute('aria-sort', 'descending')

        requisicoes.length = 0
        await page.locator('#f-busca').pressSequentially('ana', { delay: 30 })
        await expect.poll(() => estado(page, 'clientes').then(s => s.filtros.busca)).toBe('ana')
        await expect.poll(() => estado(page, 'clientes').then(s => s.carregando)).toBe(false)
        expect(requisicoes.filter(q => q.get('busca'))).toHaveLength(1)        // digitação rápida: uma requisição só
        expect(page.url()).toContain('busca=ana')

        await page.selectOption('#f-uf', 'SP')
        await expect.poll(() => estado(page, 'clientes').then(s => s.filtros.uf)).toBe('SP')
        const filtrado = await estado(page, 'clientes')
        expect(filtrado.total).toBeLessThan(137)

        await page.reload()
        await page.waitForFunction(() => window.AlpineForm.lista.get('clientes')?.carregado)
        expect(await estado(page, 'clientes')).toMatchObject({ total: filtrado.total, ordem: 'saldo', direcao: 'desc' })
        await expect(page.locator('#f-busca')).toHaveValue('ana')
        await expect(page.locator('#f-uf')).toHaveValue('SP')

        await page.click('[data-lista-limpar]')
        await expect.poll(() => estado(page, 'clientes').then(s => s.total)).toBe(137)
        expect(problemas).toEqual([])
    })

    test('seleção em lote mantida entre páginas e "carregar mais"/rolagem infinita nos cards', async ({ page }) => {
        await abrir(page)
        await page.check('[data-lista-selecionar-todos]')
        await expect.poll(() => estado(page, 'clientes').then(s => s.selecionados)).toBe(10)
        await page.click('#clientes [data-lista-pagina="2"]')
        await expect.poll(() => estado(page, 'clientes').then(s => s.pagina)).toBe(2)
        await expect(page.locator('#clientes tbody input:checked')).toHaveCount(0)
        await page.click('#clientes [data-lista-pagina="1"]')
        await expect(page.locator('#clientes tbody input:checked')).toHaveCount(10)

        await page.click('#cards [data-lista-mais]')
        await expect.poll(() => estado(page, 'cards').then(s => s.itens)).toBeGreaterThanOrEqual(24)
        await page.locator('#cards [data-lista-sentinela]').scrollIntoViewIfNeeded()
        await expect.poll(() => estado(page, 'cards').then(s => s.itens), { timeout: 15000 }).toBeGreaterThan(24)
    })

    test('cadastro com data-form-lista atualiza a tabela e os cards e destaca o registro novo', async ({ page }) => {
        const problemas = await abrir(page)
        await page.click('[data-lista-ordenar="criado_em"]')
        await page.click('[data-lista-ordenar="criado_em"]')
        await expect.poll(() => estado(page, 'clientes').then(s => `${s.ordem}:${s.direcao}`)).toBe('criado_em:desc')
        const antes = (await estado(page, 'clientes')).total
        const nome = `Cliente E2E ${Date.now()}`
        await page.fill('#n-nome', nome)
        await page.fill('#n-email', 'e2e@exemplo.com')
        await page.selectOption('#n-uf', 'BA')
        await page.click('#novo-cliente button[type=submit]')
        await expect.poll(() => estado(page, 'clientes').then(s => s.total)).toBe(antes + 1)
        await expect(page.locator('#clientes tbody tr.linha-nova td:nth-child(2)')).toHaveText(nome)
        await expect(page.locator('#cards .mini-card strong').first()).toHaveText(nome)
        await expect(page.locator('#n-nome')).toHaveValue('')
        await expect(page.locator('#clientes tbody tr.linha-nova')).toHaveCount(0, { timeout: 8000 })
        expect(problemas).toEqual([])
    })
})
