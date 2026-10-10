import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, flush, tick, jsonResponse, textResponse, AlpineForm } from './helpers.js'
import listaPlugin, { janelaDePaginas, adaptadorPadrao, nomeDoArquivo } from '../../src/lista/index.js'

startAlpine(listaPlugin)

const ITENS = Array.from({ length: 137 }, (_, i) => ({
    id: i + 1,
    nome: `Cliente ${String(i + 1).padStart(3, '0')}`,
    uf: ['SP', 'RJ', 'MG'][i % 3],
    status: ['ativo', 'inativo'][i % 2],
}))

/** Servidor de listagem simulado: filtros busca/uf/status[], ordenação, paginação, atraso e falhas. */
function servidor({ formato = 'resource', atraso = () => 0, falha = () => null } = {}) {
    const chamadas = []
    const transporte = async request => {
        const url = new URL(request.url)
        chamadas.push(url)
        const espera = atraso(url, chamadas.length)
        if (espera) {
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, espera)
                request.signal?.addEventListener('abort', () => {
                    clearTimeout(t)
                    reject(Object.assign(new Error('abort'), { name: 'AbortError' }))
                })
            })
        }
        const erro = falha(url, chamadas.length)
        if (erro) return erro
        const q = url.searchParams
        let itens = ITENS.slice()
        if (q.get('busca')) itens = itens.filter(i => i.nome.toLowerCase().includes(q.get('busca').toLowerCase()))
        if (q.get('uf')) itens = itens.filter(i => i.uf === q.get('uf'))
        const status = q.getAll('status[]')
        if (status.length) itens = itens.filter(i => status.includes(i.status))
        const ordem = q.get('sort')
        if (ordem) {
            const dir = q.get('direction') === 'desc' ? -1 : 1
            itens.sort((a, b) => String(a[ordem]).localeCompare(String(b[ordem])) * dir || a.id - b.id)
        }
        const porPagina = Number(q.get('per_page') || 20)
        const pagina = Number(q.get('page') || 1)
        const total = itens.length
        const pagina_itens = itens.slice((pagina - 1) * porPagina, pagina * porPagina)
        const ultima = Math.max(1, Math.ceil(total / porPagina))
        if (formato === 'resource') return jsonResponse(200, { data: pagina_itens, meta: { current_page: pagina, last_page: ultima, per_page: porPagina, total } })
        if (formato === 'paginate') return jsonResponse(200, { data: pagina_itens, current_page: pagina, last_page: ultima, per_page: porPagina, total })
        if (formato === 'simples') return jsonResponse(200, { data: pagina_itens, current_page: pagina, per_page: porPagina, next_page_url: pagina < ultima ? 'x?page=' + (pagina + 1) : null })
        if (formato === 'contrato') return jsonResponse(200, { success: true, data: { itens: pagina_itens, total, pagina, por_pagina: porPagina } })
        if (formato === 'array') return jsonResponse(200, pagina_itens)
        return jsonResponse(200, { qualquer: true })
    }
    transporte.chamadas = chamadas
    return transporte
}

async function montar(html) {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    document.body.appendChild(wrapper)
    await flush(5)
    const raiz = wrapper.querySelector('[x-lista]')
    return { wrapper, raiz, lista: raiz ? AlpineForm.lista.get(raiz) : null }
}

const esperar = async (cond, ms = 2000) => {
    const inicio = Date.now()
    while (!cond()) {
        if (Date.now() - inicio > ms) throw new Error('condição não atingida')
        await tick(5)
    }
}

afterEach(() => {
    if (AlpineForm.registry.has('transport', 'lista')) AlpineForm.registry.unregister('transport', 'lista')
    history.replaceState(null, '', '/')
    vi.restoreAllMocks()
})

const LINHAS = `
    <template x-for="item in $lista.itens" :key="item.id"><div class="linha" x-text="item.nome"></div></template>
    <p data-lista-status></p>
    <nav data-lista-paginacao></nav>`

describe('x-lista: carga, paginação e ordenação', () => {
    it('carrega a primeira página com parâmetros no padrão do Laravel e preenche estado, status e navegação', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/clientes" data-lista-por-pagina="10" data-lista-ordem="nome">
            <button type="button" data-lista-ordenar="nome">Nome</button>${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        const params = Object.fromEntries(t.chamadas[0].searchParams)
        expect(params).toEqual({ page: '1', per_page: '10', sort: 'nome', direction: 'asc' })
        expect(lista.itens).toHaveLength(10)
        expect([lista.total, lista.ultimaPagina, lista.de, lista.ate]).toEqual([137, 14, 1, 10])
        await flush()
        expect(raiz.querySelectorAll('.linha')).toHaveLength(10)
        expect(raiz.querySelector('[data-lista-status]').textContent).toBe('Mostrando 1–10 de 137')
        expect(raiz.querySelector('[data-lista-status]').getAttribute('role')).toBe('status')
        expect(raiz.querySelector('[data-lista-pagina="1"]').getAttribute('aria-current')).toBe('page')
        expect(raiz.querySelector('[data-lista-anterior]').disabled).toBe(true)
        expect(raiz.querySelector('[data-lista-ordenar]').getAttribute('aria-sort')).toBe('ascending')
    })

    it('navega por página, próxima/anterior e não passa da última', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/clientes" data-lista-por-pagina="50">${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        raiz.querySelector('[data-lista-pagina="3"]').click()
        await esperar(() => lista.pagina === 3 && !lista.carregando)
        expect([lista.de, lista.ate, lista.temProxima]).toEqual([101, 137, false])
        await flush()
        expect(raiz.querySelector('[data-lista-proxima]').disabled).toBe(true)
        expect(await lista.irPara(4)).toBe(false)
        await lista.anterior()
        expect(lista.pagina).toBe(2)
    })

    it('ordenar alterna asc/desc, volta para a página 1 e marca aria-sort', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/clientes">
            <table><thead><tr><th><button type="button" data-lista-ordenar="nome">Nome</button></th></tr></thead></table>${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        await lista.irPara(2)
        raiz.querySelector('[data-lista-ordenar]').click()
        await esperar(() => !lista.carregando && lista.ordem === 'nome')
        expect([lista.pagina, lista.direcao]).toEqual([1, 'asc'])
        raiz.querySelector('[data-lista-ordenar]').click()
        await esperar(() => !lista.carregando && lista.direcao === 'desc')
        expect(lista.itens[0].nome).toBe('Cliente 137')
        expect(raiz.querySelector('th').getAttribute('aria-sort')).toBe('descending')
        expect(lista.direcaoDe('nome')).toBe('desc')
    })
})

describe('x-lista: filtros', () => {
    it('busca espera a digitação parar, respeita mínimo de caracteres e cancela a requisição anterior', async () => {
        const t = servidor({ atraso: (url, n) => (n === 2 ? 200 : 0) })
        AlpineForm.transport('lista', t, { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/clientes" data-lista-debounce="50">
            <input name="busca" data-lista-filtro data-lista-minimo="2">${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        const campo = raiz.querySelector('input')
        const digitar = valor => {
            campo.value = valor
            campo.dispatchEvent(new Event('input', { bubbles: true }))
        }
        digitar('1')                          // abaixo do mínimo: nada
        await tick(80)
        expect(t.chamadas).toHaveLength(1)
        digitar('01')
        await tick(80)                        // 2ª requisição (lenta) em andamento
        digitar('012')
        digitar('0123')                       // digitação rápida: uma requisição só
        await esperar(() => t.chamadas.length === 3 && !lista.carregando)
        expect(t.chamadas[2].searchParams.get('busca')).toBe('0123')
        await tick(250)                       // a resposta lenta de "01" chega depois e é descartada
        expect(lista.filtros.busca).toBe('0123')
        expect(lista.itens.every(i => i.nome.includes('0123'))).toBe(true)
        expect(lista.total).toBe(0)
        expect(lista.vazio).toBe(true)
        expect(raiz.querySelector('[data-lista-status]').textContent).toBe('Nenhum resultado encontrado.')
    })

    it('select e grupo de checkbox aplicam na hora; limparFiltros volta aos valores iniciais', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/clientes">
            <form data-lista-filtros>
                <select name="uf"><option value="">Todas</option><option>SP</option><option>RJ</option></select>
                <input type="checkbox" name="status[]" value="ativo"><input type="checkbox" name="status[]" value="inativo">
            </form>${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        const select = raiz.querySelector('select')
        select.value = 'SP'
        select.dispatchEvent(new Event('change', { bubbles: true }))
        await esperar(() => t.chamadas.length === 2 && !lista.carregando)
        const caixa = raiz.querySelector('[value=ativo]')
        caixa.checked = true
        caixa.dispatchEvent(new Event('change', { bubbles: true }))
        await esperar(() => t.chamadas.length === 3 && !lista.carregando)
        expect(t.chamadas[2].searchParams.get('uf')).toBe('SP')
        expect(t.chamadas[2].searchParams.getAll('status[]')).toEqual(['ativo'])
        expect(lista.itens.every(i => i.uf === 'SP' && i.status === 'ativo')).toBe(true)
        await lista.limparFiltros()
        expect(select.value).toBe('')
        expect(caixa.checked).toBe(false)
        expect(t.chamadas.at(-1).searchParams.has('uf')).toBe(false)
        expect(lista.total).toBe(137)
    })

    it('definirFiltros pelo código atualiza os controles; filtros vazios não vão na URL', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/clientes"><input name="busca" data-lista-filtro>${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        await lista.definirFiltros({ busca: 'Cliente 01', uf: 'MG' })
        expect(raiz.querySelector('input').value).toBe('Cliente 01')
        expect(Object.fromEntries(t.chamadas.at(-1).searchParams)).toMatchObject({ busca: 'Cliente 01', uf: 'MG', page: '1' })
        await lista.definirFiltros({ uf: null })
        expect(t.chamadas.at(-1).searchParams.has('uf')).toBe(false)
    })
})

describe('x-lista: formatos de resposta (adaptador padrão)', () => {
    for (const [formato, temTotal] of [['resource', true], ['paginate', true], ['contrato', true], ['simples', false], ['array', false]]) {
        it(`lê o formato "${formato}"`, async () => {
            AlpineForm.transport('lista', servidor({ formato }), { replace: true })
            const { lista } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-lista-por-pagina="20">${LINHAS}</section>`)
            await esperar(() => lista.carregado || lista.erro)
            expect(lista.erro).toBeNull()
            expect(lista.itens).toHaveLength(20)
            expect(lista.total).toBe(temTotal ? 137 : null)
            expect(lista.temProxima).toBe(true)
        })
    }

    it('resposta fora do formato, success:false, HTTP 500, 401 e HTML viram erro sem perder a lista atual', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        let resposta = null
        AlpineForm.transport('lista', async request => resposta || servidor()(request), { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/x">${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        const casos = [
            [jsonResponse(200, { qualquer: 1 }), 'A resposta do servidor não está no formato de lista esperado.'],
            [jsonResponse(200, { success: false, message: 'Sem permissão para ver clientes.' }), 'Sem permissão para ver clientes.'],
            [jsonResponse(500, {}), 'O servidor encontrou um erro. Tente novamente mais tarde.'],
            [jsonResponse(401, {}), 'Sua sessão expirou ou você não tem permissão. Entre novamente e tente outra vez.'],
            [textResponse(200, '<html><body>login</body></html>'), 'O servidor respondeu com uma página HTML em vez de dados. Isso costuma indicar sessão expirada, redirecionamento para login ou erro de proxy.'],
        ]
        const eventos = []
        raiz.addEventListener('lista:erro', e => eventos.push(e.detail.erro.message))
        for (const [r, mensagem] of casos) {
            resposta = r
            await lista.recarregar()
            expect(lista.erro.message).toBe(mensagem)
            expect(lista.itens).toHaveLength(20)                  // a lista anterior continua na tela
            expect(raiz.querySelector('[data-lista-status]').textContent).toBe(mensagem)
        }
        expect(eventos).toHaveLength(5)
        resposta = null
        await lista.recarregar()
        expect(lista.erro).toBeNull()
    })

    it('adaptador próprio registrado por nome', async () => {
        AlpineForm.lista.adaptador('minha-api', json => ({ itens: json.registros, total: json.qtd, pagina: 1, porPagina: 2, ultimaPagina: 1, temProxima: false }), { replace: true })
        AlpineForm.transport('lista', async () => jsonResponse(200, { registros: [{ id: 1 }, { id: 2 }], qtd: 2 }), { replace: true })
        const { lista } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-lista-adaptador="minha-api">${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        expect([lista.itens.length, lista.total]).toEqual([2, 2])
    })
})

describe('x-lista: seleção, modo acumular, URL e ciclo de vida', () => {
    it('seleção por página, todos, indeterminado e mantida ao trocar de página', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-lista-por-pagina="5">
            <input type="checkbox" data-lista-selecionar-todos>
            <template x-for="item in $lista.itens" :key="item.id"><input type="checkbox" :data-lista-selecionar="item.id"></template>
            ${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        await flush()
        const eventos = []
        raiz.addEventListener('lista:selecao', e => eventos.push(e.detail.selecionados.length))
        const caixas = () => Array.from(raiz.querySelectorAll('[data-lista-selecionar]'))
        caixas()[0].checked = true
        caixas()[0].dispatchEvent(new Event('change', { bubbles: true }))
        const todos = raiz.querySelector('[data-lista-selecionar-todos]')
        expect(todos.indeterminate).toBe(true)
        todos.checked = true
        todos.dispatchEvent(new Event('change', { bubbles: true }))
        expect(lista.selecionados).toEqual(['1', '2', '3', '4', '5'])
        expect(caixas().every(c => c.checked)).toBe(true)
        await lista.irPara(2)
        await flush()
        expect(caixas().some(c => c.checked)).toBe(false)
        expect(todos.checked).toBe(false)
        expect(lista.quantidadeSelecionada).toBe(5)
        await lista.irPara(1)
        await flush()
        expect(caixas().every(c => c.checked)).toBe(true)
        expect(lista.itensSelecionados().map(i => i.id)).toEqual([1, 2, 3, 4, 5])
        lista.limparSelecao()
        expect(eventos).toEqual([1, 5, 0])
    })

    it('modo acumular: "carregar mais" concatena e o botão some no fim', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-lista-modo="acumular" data-lista-por-pagina="60">
            ${LINHAS}<button type="button" data-lista-mais>Mais</button></section>`)
        await esperar(() => lista.carregado)
        const botao = raiz.querySelector('[data-lista-mais]')
        botao.click()
        await esperar(() => lista.itens.length === 120 && !lista.carregando)
        await lista.maisItens()
        expect(lista.itens).toHaveLength(137)
        expect([lista.de, lista.ate, lista.temProxima]).toEqual([1, 137, false])
        await flush()
        expect(botao.hidden).toBe(true)
        expect(await lista.maisItens()).toBe(false)
    })

    it('URL sincronizada: lê o estado inicial, empilha página/ordem, substitui filtro e responde ao Voltar', async () => {
        history.replaceState(null, '', '/clientes?page=2&sort=nome&direction=desc&busca=Cliente%2001&outro=x')
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        const push = vi.spyOn(history, 'pushState')
        const { raiz, lista } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-lista-url-sincronizar data-lista-por-pagina="5">
            <input name="busca" data-lista-filtro data-lista-debounce="0">${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        expect(Object.fromEntries(t.chamadas[0].searchParams)).toMatchObject({ page: '2', sort: 'nome', direction: 'desc', busca: 'Cliente 01' })
        expect(raiz.querySelector('input').value).toBe('Cliente 01')
        await lista.irPara(1)
        expect(push).toHaveBeenCalledTimes(1)
        expect(location.search).toBe('?outro=x&sort=nome&direction=desc&busca=Cliente+01')
        await lista.irPara(2)
        expect(location.search).toContain('page=2')
        history.replaceState(null, '', '/clientes?outro=x&sort=nome&direction=desc&busca=Cliente+01')
        window.dispatchEvent(new PopStateEvent('popstate'))
        await esperar(() => lista.pagina === 1 && !lista.carregando)
        expect(t.chamadas.at(-1).searchParams.get('page')).toBe('1')
    })

    it('urlCom monta link de exportação com filtros e ordenação, sem paginação', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { lista } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-lista-ordem="nome">${LINHAS}</section>`)
        await esperar(() => lista.carregado)
        await lista.definirFiltros({ uf: 'SP', 'status[]': ['ativo', 'inativo'] })
        expect(lista.urlCom('/exportar.csv')).toBe('/exportar.csv?sort=nome&direction=asc&uf=SP&status%5B%5D=ativo&status%5B%5D=inativo')
    })

    it('configuração inválida marca o elemento e registra erro', async () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { wrapper } = await montar(`
            <section id="a" x-data x-lista></section>
            <section id="b" x-data x-lista data-lista-url="/x" data-lista-modo="tudo"></section>
            <section id="c" x-data x-lista data-lista-url="/x" data-lista-por-pagina="0"></section>
            <section id="d" x-data x-lista data-lista-url="/x" data-lista-adaptador="inexistente"></section>`)
        for (const id of ['a', 'b', 'c', 'd']) {
            expect(wrapper.querySelector('#' + id).getAttribute('data-lista-estado')).toBe('config-error')
            expect(AlpineForm.lista.get(id)).toBeNull()
        }
        expect(erro).toHaveBeenCalledTimes(4)
    })

    it('destroy cancela a requisição em andamento e remove os ouvintes; data-form-log="none" silencia', async () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
        const t = servidor({ atraso: () => 100, falha: () => jsonResponse(500, {}) })
        AlpineForm.transport('lista', t, { replace: true })
        const { wrapper, raiz } = await montar(`<section x-data x-lista data-lista-url="/api/x" data-form-log="none">${LINHAS}</section>`)
        const lista = AlpineForm.lista.get(raiz)
        await esperar(() => lista.erro)
        expect(erro).not.toHaveBeenCalled()
        lista.recarregar()
        wrapper.remove()
        await flush()
        await tick(150)
        expect(AlpineForm.lista.get(raiz)).toBeNull()
        expect(raiz.hasAttribute('aria-busy')).toBe(false)
    })
})

describe('utilitários', () => {
    it('janela de páginas com reticências', () => {
        const numeros = (a, u) => janelaDePaginas(a, u).map(p => (p.reticencias ? '…' : p.atual ? `[${p.numero}]` : p.numero)).join(' ')
        expect(numeros(1, 1)).toBe('[1]')
        expect(numeros(1, 5)).toBe('[1] 2 3 4 5')
        expect(numeros(6, 20)).toBe('1 … 4 5 [6] 7 8 … 20')
        expect(numeros(20, 20)).toBe('1 … 18 19 [20]')
        expect(janelaDePaginas(1, null)).toEqual([])
    })

    it('adaptador padrão retorna null para formatos desconhecidos', () => {
        expect(adaptadorPadrao({ x: 1 }, { porPagina: 10, pagina: 1 })).toBeNull()
        expect(adaptadorPadrao('texto', { porPagina: 10, pagina: 1 })).toBeNull()
    })
})

describe('formulário atualiza listas (data-form-lista)', () => {
    it('após sucesso, atualiza as listas citadas por id e por grupo, e só elas', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        let resposta = jsonResponse(200, { success: true, message: 'Salvo.', data: { id: 3, nome: 'Novo' } })
        AlpineForm.transport('test', async () => resposta, { replace: true })
        const { wrapper } = await montar(`
            <form id="cad" x-data x-form action="/api/clientes" method="post" data-form-transport="test"
                  data-form-lista="clientes financeiro" novalidate><input name="nome" value="Novo"></form>
            <section id="clientes" x-data x-lista data-lista-url="/api/a" data-lista-destacar="80ms">${LINHAS}</section>
            <section id="resumo" x-data x-lista data-lista-url="/api/b" data-lista-grupo="financeiro dashboard">${LINHAS}</section>
            <section id="outra" x-data x-lista data-lista-url="/api/c">${LINHAS}</section>`)
        const [a, b, c] = ['clientes', 'resumo', 'outra'].map(id => AlpineForm.lista.get(id))
        await esperar(() => a.carregado && b.carregado && c.carregado)
        const contar = caminho => t.chamadas.filter(u => u.pathname === caminho).length
        await a.irPara(3)
        const eventos = []
        wrapper.addEventListener('lista:atualizada', e => eventos.push(e.target.id))

        resposta = jsonResponse(422, { success: false, errors: { nome: ['Inválido'] } })
        await AlpineForm.get('cad').submit()
        expect([contar('/api/a'), contar('/api/b'), contar('/api/c')]).toEqual([2, 1, 1])   // erro: nada é atualizado

        resposta = jsonResponse(200, { success: true, message: 'Salvo.', data: { id: 3, nome: 'Novo' } })
        await AlpineForm.get('cad').submit()
        await esperar(() => contar('/api/a') === 3 && contar('/api/b') === 2 && !a.carregando && !b.carregando)
        expect(contar('/api/c')).toBe(1)
        expect(a.pagina).toBe(3)                              // padrão "recarregar": mantém a página
        expect(t.chamadas.filter(u => u.pathname === '/api/a').at(-1).searchParams.get('page')).toBe('3')
        await esperar(() => eventos.length === 2)
        expect(eventos.sort()).toEqual(['clientes', 'resumo'])
        expect(a.destaque).toBe('3')                          // registro salvo destacado...
        expect(b.destaque).toBeNull()                         // ...só onde data-lista-destacar está ativo
        await tick(120)
        expect(a.destaque).toBeNull()
    })

    it('data-lista-ao-atualizar="inicio" volta para a página 1; alvo inexistente avisa no console', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
        AlpineForm.transport('lista', servidor(), { replace: true })
        AlpineForm.transport('test', async () => jsonResponse(200, { success: true, data: { id: 1 } }), { replace: true })
        await montar(`
            <form id="cad2" x-data x-form action="/x" method="post" data-form-transport="test" data-form-lista="ultimos clietnes" novalidate><input name="a" value="1"></form>
            <section id="ultimos" x-data x-lista data-lista-url="/api/a" data-lista-ao-atualizar="inicio">${LINHAS}</section>`)
        const lista = AlpineForm.lista.get('ultimos')
        await esperar(() => lista.carregado)
        await lista.irPara(4)
        await AlpineForm.get('cad2').submit()
        await esperar(() => lista.pagina === 1 && !lista.carregando)
        expect(aviso.mock.calls.some(c => String(c[0]).includes('"clietnes"'))).toBe(true)
    })

    it('AlpineForm.lista.atualizar() e o evento lista:atualizar funcionam sem formulário', async () => {
        const t = servidor()
        AlpineForm.transport('lista', t, { replace: true })
        await montar(`
            <section id="x1" x-data x-lista data-lista-url="/api/a" data-lista-grupo="pedidos">${LINHAS}</section>
            <section id="x2" x-data x-lista data-lista-url="/api/b" data-lista-grupo="pedidos">${LINHAS}</section>`)
        await esperar(() => AlpineForm.lista.get('x1').carregado && AlpineForm.lista.get('x2').carregado)
        expect(AlpineForm.lista.atualizar('pedidos')).toBe(2)
        document.dispatchEvent(new CustomEvent('lista:atualizar', { detail: { alvos: ['x1'] } }))
        await esperar(() => t.chamadas.length === 5)
        expect(t.chamadas.filter(u => u.pathname === '/api/a')).toHaveLength(3)
    })
})

describe('x-lista: exportação CSV (filtro e completo)', () => {
    /** fetch simulado para os endpoints de exportação; guarda as URLs pedidas. */
    function exportador(resposta = () => new Response('﻿Código;Nome\r\n1;Ana\r\n', { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="clientes.csv"' } })) {
        const pedidos = []
        vi.stubGlobal('fetch', vi.fn(async (url, opcoes) => {
            pedidos.push({ url: String(url), opcoes })
            return resposta(String(url))
        }))
        const baixados = []
        URL.createObjectURL = vi.fn(blob => {
            baixados.push(blob)
            return 'blob:teste'
        })
        URL.revokeObjectURL = vi.fn()
        const cliques = []
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
            cliques.push({ href: this.getAttribute('href'), download: this.getAttribute('download'), gerado: this.getAttribute('data-form-generated') })
        })
        return { pedidos, baixados, cliques }
    }

    const HTML = `<section id="clientes" x-data x-lista data-lista-url="/api/clientes" data-lista-por-pagina="10" data-lista-ordem="nome"
            data-lista-exportar-url="/api/clientes/exportar" data-lista-exportar-completo-url="/api/clientes/exportar-tudo">
        <form data-lista-filtros><input name="busca" data-lista-filtro><select name="uf"><option value="">Todas</option><option>SP</option></select></form>
        <button type="button" data-lista-exportar="filtro">Filtro CSV</button>
        <button type="button" data-lista-exportar="completo">CSV completo</button>
        ${LINHAS}</section>`

    afterEach(() => {
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    it('"Filtro CSV" chama o endpoint de filtro com filtros e ordenação, sem paginação; "CSV completo" chama o outro sem parâmetros', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { raiz, lista } = await montar(HTML)
        await esperar(() => lista.carregado)
        await lista.definirFiltros({ uf: 'SP', busca: 'cli' })
        await lista.irPara(2)
        const { pedidos, baixados, cliques } = exportador()
        const eventos = []
        raiz.addEventListener('lista:exportada', e => eventos.push(e.detail))

        raiz.querySelector('[data-lista-exportar="filtro"]').click()
        await esperar(() => eventos.length === 1)
        const url = new URL(pedidos[0].url, location.href)
        expect(url.pathname).toBe('/api/clientes/exportar')
        expect(Object.fromEntries(url.searchParams)).toEqual({ sort: 'nome', direction: 'asc', uf: 'SP', busca: 'cli' })
        expect(pedidos[0].opcoes.credentials).toBe('same-origin')
        expect(cliques[0]).toEqual({ href: 'blob:teste', download: 'clientes.csv', gerado: 'lista-exportar' })
        expect(await baixados[0].text()).toContain('1;Ana')
        expect(eventos[0]).toMatchObject({ tipo: 'filtro', arquivo: 'clientes.csv' })

        raiz.querySelector('[data-lista-exportar="completo"]').click()
        await esperar(() => eventos.length === 2)
        expect(pedidos[1].url).toBe('/api/clientes/exportar-tudo')
        expect(eventos[1].tipo).toBe('completo')
        expect(document.querySelector('a[data-form-generated]')).toBeNull()      // o link temporário não fica no DOM
    })

    it('durante a exportação os botões ficam desabilitados e o botão ativo com aria-busy; nome padrão sem Content-Disposition', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { raiz, lista } = await montar(HTML)
        await esperar(() => lista.carregado)
        let liberar
        const { cliques } = exportador(() => new Promise(resolve => {
            liberar = () => resolve(new Response('a;b\r\n', { status: 200, headers: { 'content-type': 'text/csv' } }))
        }))
        const promessa = lista.exportar('completo')
        await flush()
        const [filtro, completo] = raiz.querySelectorAll('[data-lista-exportar]')
        expect([lista.exportando, filtro.disabled, completo.disabled, completo.getAttribute('aria-busy'), filtro.hasAttribute('aria-busy')]).toEqual(['completo', true, true, 'true', false])
        expect(await lista.exportar('filtro')).toBe(false)                          // uma exportação por vez
        liberar()
        expect(await promessa).toBe(true)
        expect([lista.exportando, filtro.disabled, completo.hasAttribute('aria-busy')]).toEqual([null, false, false])
        expect(cliques[0].download).toMatch(/^clientes-completo-\d{4}-\d{2}-\d{2}\.csv$/)
    })

    it('erro do servidor, JSON ou página de login no lugar do arquivo: não baixa, informa o erro', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { raiz, lista } = await montar(HTML.replace('id="clientes"', 'id="clientes" data-form-log="none"'))
        await esperar(() => lista.carregado)
        const respostas = [
            new Response(JSON.stringify({ success: false, message: 'Sem permissão para exportar.' }), { status: 403, headers: { 'content-type': 'application/json' } }),
            new Response('<html><form><input type="password"></form></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
        ]
        const { cliques } = exportador(() => respostas.shift())
        const erros = []
        raiz.addEventListener('lista:exportacao-erro', e => erros.push(e.detail))
        expect(await lista.exportar('filtro')).toBe(false)
        expect(lista.erroExportacao).toMatchObject({ kind: 'http', status: 403, message: 'Sem permissão para exportar.' })
        expect(await lista.exportar('completo')).toBe(false)
        expect(lista.erroExportacao).toMatchObject({ kind: 'contract', message: 'Não foi possível gerar o arquivo. Tente novamente.' })
        expect(cliques).toHaveLength(0)
        expect(erros.map(e => e.tipo)).toEqual(['filtro', 'completo'])
    })

    it('modo direto baixa pelo próprio navegador (arquivos enormes); configuração errada é recusada', async () => {
        AlpineForm.transport('lista', servidor(), { replace: true })
        const { lista } = await montar(HTML.replace('data-lista-por-pagina="10"', 'data-lista-por-pagina="10" data-lista-exportar-modo="direto"'))
        await esperar(() => lista.carregado)
        const { pedidos, cliques } = exportador()
        expect(await lista.exportar('completo')).toBe(true)
        expect(pedidos).toHaveLength(0)
        expect(cliques[0]).toMatchObject({ href: '/api/clientes/exportar-tudo', download: '' })
        expect(() => lista.urlExportacao('xlsx')).toThrow(/filtro.*completo/)
        document.body.innerHTML = ''
        const sem = await montar('<section x-data x-lista data-lista-url="/api/clientes"></section>')
        await esperar(() => sem.lista.carregado)
        expect(() => sem.lista.urlExportacao('completo')).toThrow(/data-lista-exportar-completo-url/)
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const fora = await montar('<section x-data x-lista data-lista-url="/api/x" data-lista-exportar-url="https://outro.exemplo/csv"></section>')
        expect(fora.lista).toBeNull()
        expect(fora.raiz.getAttribute('data-lista-estado')).toBe('config-error')
    })

    it('nomeDoArquivo lê filename* e filename e remove caminho', () => {
        expect(nomeDoArquivo('attachment; filename="clientes.csv"')).toBe('clientes.csv')
        expect(nomeDoArquivo("attachment; filename*=UTF-8''relat%C3%B3rio.csv; filename=\"x.csv\"")).toBe('relatório.csv')
        expect(nomeDoArquivo('attachment; filename=../../segredo.csv')).not.toMatch(/\//)
        expect(nomeDoArquivo('attachment')).toBeNull()
        expect(nomeDoArquivo(null)).toBeNull()
    })
})
