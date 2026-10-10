import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, tick, type, change, jsonResponse, textResponse, AlpineForm, Alpine } from './helpers.js'
import opcoesPlugin, { extrairItens, normalizarOpcoes } from '../../src/opcoes/index.js'

startAlpine(opcoesPlugin)

const CIDADES = {
    SP: [{ id: 1, nome: 'São Paulo' }, { id: 2, nome: 'Campinas' }],
    RJ: [{ id: 3, nome: 'Rio de Janeiro' }, { id: 4, nome: 'Niterói' }],
    MG: [],
}
const BAIRROS = { 1: ['Sé', 'Mooca'], 2: ['Cambuí'], 3: ['Centro', 'Lapa'], 4: ['Icaraí'] }

/** Servidor simulado: /ufs, /cidades?uf=, /bairros?cidade=; atraso e falha configuráveis por URL. */
function servidor({ atraso = () => 0, falha = () => null } = {}) {
    const chamadas = []
    const transporte = async request => {
        const url = new URL(request.url)
        chamadas.push(url.pathname + url.search)
        const espera = atraso(url)
        if (espera) {
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, espera)
                request.signal?.addEventListener('abort', () => {
                    clearTimeout(t)
                    reject(Object.assign(new Error('abort'), { name: 'AbortError' }))
                })
            })
        }
        const erro = falha(url)
        if (erro) return erro
        if (url.pathname === '/ufs') return jsonResponse(200, { SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais' })
        if (url.pathname === '/cidades') return jsonResponse(200, { data: CIDADES[url.searchParams.get('uf')] || [] })
        if (url.pathname === '/bairros') return jsonResponse(200, BAIRROS[url.searchParams.get('cidade')] || [])
        return jsonResponse(404, { message: 'não encontrado' })
    }
    transporte.chamadas = chamadas
    AlpineForm.transport('opcoes', transporte, { replace: true })
    return transporte
}

const esperar = async (cond, ms = 2000) => {
    const inicio = Date.now()
    while (!cond()) {
        if (Date.now() - inicio > ms) throw new Error('condição não atingida')
        await tick(5)
    }
}

const textos = select => Array.from(select.options).map(o => o.textContent)
const escolher = (select, valor) => {
    select.value = valor
    change(select)
}

const CADEIA = `
    <select name="uf" data-form-opcoes="/ufs" data-form-v="required"><option value="">UF</option></select>
    <select name="cidade" data-form-opcoes="/cidades?uf={uf}" data-form-v="required" data-form-opcoes-vazio="Nenhuma cidade"><option value="">Escolha a UF</option></select>
    <select name="bairro" data-form-opcoes="/bairros?cidade={cidade}"><option value="">Escolha a cidade</option></select>`

afterEach(() => {
    if (AlpineForm.registry.has('transport', 'opcoes')) AlpineForm.registry.unregister('transport', 'opcoes')
    if (AlpineForm.registry.has('transport', 'test')) AlpineForm.registry.unregister('transport', 'test')
    AlpineForm.opcoes.limparCache()
    AlpineForm.resetConfig()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('opções remotas e selects dependentes', () => {
    it('carrega ao abrir, mantém o placeholder e deixa dependentes vazios e desabilitados', async () => {
        const t = servidor()
        const { form } = await mount(`<form x-data x-form novalidate>${CADEIA}</form>`)
        const [uf, cidade, bairro] = form.querySelectorAll('select')
        await esperar(() => uf.options.length === 4)
        expect(textos(uf)).toEqual(['UF', 'São Paulo', 'Rio de Janeiro', 'Minas Gerais'])
        expect(uf.options[1].value).toBe('SP')
        expect(uf.options[1].getAttribute('data-form-generated')).toBe('opcao')
        expect([cidade.disabled, bairro.disabled]).toEqual([true, true])
        expect(cidade.getAttribute('data-form-opcoes-estado')).toBe('aguardando')
        expect(t.chamadas).toEqual(['/ufs'])
    })

    it('cadeia UF → cidade → bairro: troca de UF limpa cidade e bairro e busca de novo', async () => {
        const t = servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>${CADEIA}</form>`)
        const [uf, cidade, bairro] = form.querySelectorAll('select')
        await esperar(() => uf.options.length === 4)
        escolher(uf, 'SP')
        await esperar(() => cidade.options.length === 3 && !cidade.disabled)
        expect(textos(cidade)).toEqual(['Escolha a UF', 'São Paulo', 'Campinas'])
        expect(t.chamadas).toContain('/cidades?uf=SP')
        escolher(cidade, '2')
        await esperar(() => bairro.options.length === 2)
        escolher(bairro, 'Cambuí')
        expect(api.getValues()).toMatchObject({ uf: 'SP', cidade: '2', bairro: 'Cambuí' })

        escolher(uf, 'RJ')
        await esperar(() => textos(cidade).includes('Niterói'))
        await flush()
        expect(api.getValues()).toMatchObject({ uf: 'RJ', cidade: '' })
        expect(bairro.value).toBe('')
        expect(bairro.disabled).toBe(true)
        expect(textos(bairro)).toEqual(['Escolha a cidade'])
    })

    it('edição: valor vindo do servidor é selecionado depois da carga e alimenta a cadeia', async () => {
        servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>
            <select name="uf" data-form-opcoes="/ufs"><option value="">UF</option><option value="RJ" selected>Rio de Janeiro</option></select>
            <select name="cidade" data-form-opcoes="/cidades?uf={uf}" data-form-opcoes-selecionado="4"><option value="">Cidade</option></select>
            <select name="bairro" data-form-opcoes="/bairros?cidade={cidade}" data-form-opcoes-selecionado="Icaraí"><option value="">Bairro</option></select>
        </form>`)
        const bairro = form.querySelector('[name=bairro]')
        await esperar(() => bairro.value === 'Icaraí')
        expect(api.getValues()).toMatchObject({ uf: 'RJ', cidade: '4', bairro: 'Icaraí' })
        expect(form.querySelectorAll('[name=uf] option')).toHaveLength(4)   // a opção estática foi substituída pela lista
    })

    it('resposta antiga é descartada quando a dependência muda durante a carga', async () => {
        const t = servidor({ atraso: url => (url.searchParams.get('uf') === 'SP' ? 120 : 10) })
        const { form, api } = await mount(`<form x-data x-form novalidate>${CADEIA}</form>`)
        const [uf, cidade] = form.querySelectorAll('select')
        await esperar(() => uf.options.length === 4)
        escolher(uf, 'SP')
        await tick(20)
        escolher(uf, 'RJ')
        await esperar(() => textos(cidade).includes('Niterói'))
        await tick(150)
        expect(textos(cidade)).not.toContain('Campinas')
        expect(AlpineForm.opcoes.estado(form, 'cidade')).toMatchObject({ carregando: false, erro: null })
        expect(t.chamadas.filter(c => c.startsWith('/cidades'))).toEqual(['/cidades?uf=SP', '/cidades?uf=RJ'])
        expect(api.getValues().uf).toBe('RJ')
    })

    it('usa cache em memória por URL e recarregar() ignora o cache', async () => {
        const t = servidor()
        const { form } = await mount(`<form id="f" x-data x-form novalidate>${CADEIA}</form>`)
        const [uf, cidade] = form.querySelectorAll('select')
        await esperar(() => uf.options.length === 4)
        escolher(uf, 'SP')
        await esperar(() => cidade.options.length === 3)
        escolher(uf, 'RJ')
        await esperar(() => textos(cidade).includes('Niterói'))
        escolher(uf, 'SP')
        await esperar(() => textos(cidade).includes('Campinas'))
        expect(t.chamadas.filter(c => c === '/cidades?uf=SP')).toHaveLength(1)
        AlpineForm.opcoes.recarregar('f', 'cidade')
        await esperar(() => t.chamadas.filter(c => c === '/cidades?uf=SP').length === 2)
    })

    it('lista vazia mostra data-form-opcoes-vazio; erro HTTP marca estado, emite evento e não quebra o form', async () => {
        servidor({ falha: url => (url.searchParams.get('uf') === 'RJ' ? jsonResponse(500, { message: 'x' }) : null) })
        const { form } = await mount(`<form x-data x-form data-form-log="none" novalidate>${CADEIA}</form>`)
        const [uf, cidade] = form.querySelectorAll('select')
        const erros = []
        form.addEventListener('form:opcoes-erro', e => erros.push(e.detail))
        await esperar(() => uf.options.length === 4)
        escolher(uf, 'MG')
        await esperar(() => textos(cidade).includes('Nenhuma cidade'))
        expect(cidade.disabled).toBe(true)
        escolher(uf, 'RJ')
        await esperar(() => erros.length === 1)
        expect(erros[0]).toMatchObject({ name: 'cidade', status: 500 })
        expect(cidade.getAttribute('data-form-opcoes-estado')).toBe('erro')
        expect(AlpineForm.opcoes.estado(form, 'cidade').erro.message).toBe('Não foi possível carregar as opções.')
    })

    it('texto do servidor nunca vira HTML; itens inválidos e duplicados são descartados', async () => {
        AlpineForm.transport('opcoes', async () => jsonResponse(200, [
            { id: 1, nome: '<img src=x onerror=alert(1)>' }, { id: 1, nome: 'duplicado' }, { nome: 'sem id' }, null, { id: { x: 1 } }, 'Texto',
        ]), { replace: true })
        const { form } = await mount(`<form x-data x-form novalidate><select name="s" data-form-opcoes="/x"><option value="">--</option></select></form>`)
        const s = form.querySelector('select')
        await esperar(() => s.options.length === 3)
        expect(s.querySelector('img')).toBeNull()
        expect(textos(s)).toEqual(['--', '<img src=x onerror=alert(1)>', 'Texto'])
    })

    it('campos personalizados, grupos (optgroup) e select múltiplo', async () => {
        AlpineForm.transport('opcoes', async () => jsonResponse(200, { success: true, data: { itens: [
            { codigo: 'a', titulo: 'Alfa', tipo: 'Grego' }, { codigo: 'b', titulo: 'Beta', tipo: 'Grego' }, { codigo: 'x', titulo: 'Xis', tipo: 'Latino' },
        ] } }), { replace: true })
        const { form, api } = await mount(`<form x-data x-form novalidate>
            <select name="letras[]" multiple data-form-opcoes="/letras" data-form-opcoes-valor="codigo" data-form-opcoes-texto="titulo" data-form-opcoes-grupo="tipo" data-form-opcoes-selecionado="b"></select>
        </form>`)
        const s = form.querySelector('select')
        await esperar(() => s.options.length === 3)
        expect(Array.from(s.querySelectorAll('optgroup')).map(g => g.label)).toEqual(['Grego', 'Latino'])
        expect(api.getValues()['letras[]']).toEqual(['b'])
    })

    it('dependência de texto espera a digitação parar (debounce) e só busca com valor', async () => {
        const t = servidor()
        const { form } = await mount(`<form x-data x-form novalidate>
            <input name="cidade">
            <select name="bairro" data-form-opcoes="/bairros?cidade={cidade}" data-form-opcoes-debounce="80ms"><option value="">--</option></select>
        </form>`)
        const input = form.querySelector('input')
        type(input, '3')
        type(input, '1')
        await tick(30)
        expect(t.chamadas).toEqual([])
        await esperar(() => t.chamadas.length === 1)
        expect(t.chamadas).toEqual(['/bairros?cidade=1'])
    })

    it('erros de configuração bloqueiam o envio: campo inexistente, outra origem, fora de select', async () => {
        servidor()
        const casos = [
            '<select name="a" data-form-opcoes="/x?y={nao_existe}"></select>',
            '<select name="a" data-form-opcoes="https://outro.exemplo/api"></select>',
            '<input name="a" data-form-opcoes="/x">',
            '<select name="a" data-form-opcoes-debounce="rapido" data-form-opcoes="/x"></select>',
        ]
        for (const html of casos) {
            const configs = []
            const { form, api, wrapper } = await mount(`<form x-data x-form data-form-log="none" novalidate>${html}</form>`)
            form.addEventListener('form:config-error', e => configs.push(e.detail))
            await flush()
            expect(api.configErrors.length, html).toBeGreaterThan(0)
            const resultado = await api.submit()
            expect(resultado.ok, html).toBe(false)
            wrapper.remove()
        }
    })

    it('valida, envia o valor escolhido e não reabilita select desabilitado pelo HTML', async () => {
        servidor()
        let enviado = null
        AlpineForm.transport('test', async request => {
            enviado = request.body
            return jsonResponse(200, { success: true })
        }, { replace: true })
        const { form, api } = await mount(`<form x-data x-form action="/salvar" method="post" data-form-transport="test" data-form-encoding="json" novalidate>${CADEIA}
            <select name="fixo" disabled data-form-opcoes="/ufs"><option value="">--</option></select></form>`)
        const [uf, cidade] = form.querySelectorAll('select')
        await esperar(() => uf.options.length === 4)
        expect((await api.submit()).ok).toBe(false)
        expect(api.field('cidade').errors.length).toBe(0)       // desabilitado enquanto espera: não valida
        escolher(uf, 'SP')
        await esperar(() => !cidade.disabled)
        expect((await api.submit()).ok).toBe(false)
        expect(api.field('cidade').errors[0]).toBeTruthy()
        escolher(cidade, '1')
        expect((await api.submit()).ok).toBe(true)
        expect(JSON.parse(enviado)).toMatchObject({ uf: 'SP', cidade: '1' })
        expect(form.querySelector('[name=fixo]').disabled).toBe(true)
    })

    it('funciona em linhas adicionadas depois (x-for) e libera tudo no destroy', async () => {
        const t = servidor()
        const { form, api, wrapper } = await mount(`<form x-data="{ linhas: [0] }" x-form novalidate>
            <template x-for="i in linhas" :key="i">
                <div><select :name="'itens[' + i + '][uf]'" data-form-opcoes="/ufs"><option value="">UF</option></select>
                <select :name="'itens[' + i + '][cidade]'" :data-form-opcoes="'/cidades?uf={itens[' + i + '][uf]}'"><option value="">Cidade</option></select></div>
            </template>
            <button type="button" @click="linhas.push(linhas.length)">+</button>
        </form>`)
        await esperar(() => form.querySelectorAll('select')[0].options.length === 4)
        form.querySelector('button').click()
        await esperar(() => form.querySelectorAll('select').length === 4 && form.querySelectorAll('select')[2].options.length === 4)
        const [, , uf2, cidade2] = form.querySelectorAll('select')
        escolher(uf2, 'RJ')
        await esperar(() => textos(cidade2).includes('Niterói'))
        expect(t.chamadas).toContain('/cidades?uf=RJ')
        expect(api.getValues()['itens[1][uf]']).toBe('RJ')
        Alpine.destroyTree(wrapper)
        await flush()
        expect(form.querySelector('[data-form-opcoes-estado]')).toBeNull()
    })

    it('extrairItens e normalizarOpcoes reconhecem os formatos comuns', () => {
        expect(extrairItens([1, 2])).toEqual([1, 2])
        expect(extrairItens({ data: ['a'] })).toEqual(['a'])
        expect(extrairItens({ success: true, data: { opcoes: ['a'] } })).toEqual(['a'])
        expect(extrairItens({ success: false, message: 'x' })).toBeNull()
        expect(extrairItens({ SP: 'São Paulo' })).toEqual([{ value: 'SP', label: 'São Paulo' }])
        expect(extrairItens({ qualquer: { x: 1 } })).toBeNull()
        expect(extrairItens('texto')).toBeNull()
        expect(normalizarOpcoes([{ value: 1, label: 'Um' }, { sigla: 'SP', name: 'São Paulo' }, { id: 7 }, 3])).toEqual([
            { valor: '1', texto: 'Um', grupo: null }, { valor: 'SP', texto: 'São Paulo', grupo: null }, { valor: '7', texto: '7', grupo: null }, { valor: '3', texto: '3', grupo: null },
        ])
        expect(textResponse).toBeTypeOf('function')
    })
})
