import { test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
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

test.describe('listagens: exportação CSV', () => {
    test('"Filtro CSV" baixa só as linhas filtradas; "CSV completo" baixa todas, cada um no seu endpoint', async ({ page }) => {
        const problemas = await abrir(page)
        const pedidos = []
        page.on('request', r => {
            if (r.url().includes('clientes-csv')) pedidos.push(new URL(r.url()))
        })
        await page.selectOption('#f-uf', 'SP')
        await expect.poll(() => estado(page, 'clientes').then(s => s.filtros.uf)).toBe('SP')
        await expect.poll(() => estado(page, 'clientes').then(s => s.carregando)).toBe(false)
        const totalFiltrado = (await estado(page, 'clientes')).total

        const [arquivoFiltro] = await Promise.all([page.waitForEvent('download'), page.click('#clientes [data-lista-exportar="filtro"]')])
        expect(arquivoFiltro.suggestedFilename()).toMatch(/^clientes-filtrado-\d{4}-\d{2}-\d{2}\.csv$/)
        const csvFiltro = readFileSync(await arquivoFiltro.path(), 'utf8')
        expect(csvFiltro.charCodeAt(0)).toBe(0xfeff)                                    // BOM: acentos certos no Excel
        const linhasFiltro = csvFiltro.trim().split('\r\n')
        expect(linhasFiltro[0]).toBe('Código;Nome;E-mail;UF;Situação;Saldo;Cadastro')        // trim() remove o BOM
        expect(linhasFiltro).toHaveLength(totalFiltrado + 1)
        expect(linhasFiltro.slice(1).every(l => l.split(';')[3] === 'SP')).toBe(true)
        expect(pedidos[0].pathname).toBe('/api/demo/clientes-csv')
        expect(pedidos[0].searchParams.get('uf')).toBe('SP')
        expect(pedidos[0].searchParams.has('page')).toBe(false)

        const [arquivoCompleto] = await Promise.all([page.waitForEvent('download'), page.click('#clientes [data-lista-exportar="completo"]')])
        expect(arquivoCompleto.suggestedFilename()).toMatch(/^clientes-completo-/)
        const linhasCompleto = readFileSync(await arquivoCompleto.path(), 'utf8').trim().split('\r\n')
        expect(linhasCompleto.length - 1).toBeGreaterThanOrEqual(137)
        expect(linhasCompleto.length).toBeGreaterThan(linhasFiltro.length)
        // modo auto: o completo (sem contagem) vai direto pelo navegador — é um download, não uma requisição da página
        expect(new URL(arquivoCompleto.url()).pathname).toBe('/api/demo/clientes-csv-completo')
        expect(new URL(arquivoCompleto.url()).search).toBe('')
        expect(pedidos).toHaveLength(1)
        await expect(page.locator('#clientes [data-lista-exportar="filtro"]')).toBeEnabled()
        expect(problemas).toEqual([])
    })
})

test.describe('listagens: exportação em segundo plano (fila + worker reais)', () => {
    let worker
    test.beforeAll(() => {
        // só exportações: não disputa os jobs de importação do spec de uploads (que roda em paralelo)
        worker = spawn('php', ['server/bin/worker.php', '--idle=100', '--tipos=export_csv'], { stdio: 'ignore' })
    })
    test.afterAll(() => {
        worker?.kill()
    })

    test('"Filtro CSV" por job: progresso do worker na tela e download do arquivo completo', async ({ page }) => {
        test.setTimeout(120000)
        await abrir(page)
        await page.waitForFunction(() => window.AlpineForm.lista.get('relatorio')?.carregado)
        const mensagens = new Set()
        await page.exposeFunction('registrarProgresso', m => mensagens.add(m))
        await page.evaluate(() => document.getElementById('relatorio').addEventListener('lista:exportacao-progresso', e => window.registrarProgresso(`${e.detail.status}:${e.detail.progress}`)))
        const [arquivo] = await Promise.all([
            page.waitForEvent('download', { timeout: 90000 }),
            page.click('#relatorio [data-lista-exportar="filtro"]'),
        ])
        expect(arquivo.suggestedFilename()).toMatch(/^clientes-filtrado-\d{4}-\d{2}-\d{2}\.csv$/)
        const linhas = readFileSync(await arquivo.path(), 'utf8').trim().split('\r\n')
        expect(linhas[0]).toBe('Código;Nome;E-mail;UF;Situação;Saldo;Cadastro')
        expect(linhas.length - 1).toBeGreaterThanOrEqual(200137)
        expect(linhas.at(-1)).toContain('Cliente fictício 200000')
        expect([...mensagens].some(m => m.startsWith('succeeded'))).toBe(true)
        await expect(page.locator('#relatorio [data-lista-exportar-cancelar]')).toBeHidden()
        await expect(page.locator('#relatorio [data-lista-exportar="filtro"]')).toBeEnabled()
    })

    test('cancelar interrompe o job no servidor e libera os botões', async ({ page }) => {
        await abrir(page)
        await page.waitForFunction(() => window.AlpineForm.lista.get('relatorio')?.carregado)
        // exportação lenta de propósito (ms) para dar tempo de cancelar
        await page.evaluate(() => document.getElementById('relatorio').setAttribute('data-lista-exportar-completo-url', '/api/demo/clientes-csv-completo?linhas=1000000&ms=200'))
        const jobs = []
        page.on('request', r => {
            if (/\/api\/jobs\/[a-f0-9]{32}$/.test(r.url())) jobs.push(r.method())
        })
        page.on('download', () => jobs.push('DOWNLOAD'))
        const lista = () => page.evaluate(() => {
            const s = window.AlpineForm.lista.get('relatorio')
            return { exportando: s.exportando, status: s.progressoExportacao?.status ?? null }
        })
        // a URL foi trocada depois de montar a lista: recria a lista para ler o atributo novo
        await page.evaluate(() => {
            const el = document.getElementById('relatorio')
            window.Alpine.destroyTree(el)
            window.Alpine.initTree(el)
        })
        await page.waitForFunction(() => window.AlpineForm.lista.get('relatorio')?.carregado)
        await page.click('#relatorio [data-lista-exportar="completo"]')
        await expect.poll(() => lista().then(s => s.status)).toBe('processing')
        await page.click('#relatorio [data-lista-exportar-cancelar]')
        await expect.poll(() => lista().then(s => s.exportando)).toBe(null)
        await expect.poll(() => jobs.includes('DELETE')).toBe(true)
        expect(jobs).not.toContain('DOWNLOAD')
        await expect(page.locator('#relatorio [data-lista-exportar="completo"]')).toBeEnabled()
    })
})
