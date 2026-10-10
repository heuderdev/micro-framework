import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, tick, jsonResponse, AlpineForm } from './helpers.js'
import autocompletarPlugin, { extrairLista } from '../../src/autocompletar/index.js'

startAlpine(autocompletarPlugin)

const CLIENTES = [
    { id: 1, nome: 'Ana Souza', email: 'ana@exemplo.com', telefone: '1111' },
    { id: 2, nome: 'Ana Lima', email: 'ana.lima@exemplo.com', telefone: '2222' },
    { id: 3, nome: 'Bruno Costa', email: 'bruno@exemplo.com', telefone: '3333' },
]

function servidor({ atraso = () => 0, formato = j => ({ data: j }) } = {}) {
    const chamadas = []
    AlpineForm.transport('autocompletar', async request => {
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
        const termo = (url.searchParams.get('busca') || '').toLowerCase()
        if (termo === 'falha') return jsonResponse(500, {})
        return jsonResponse(200, formato(CLIENTES.filter(c => c.nome.toLowerCase().includes(termo))))
    }, { replace: true })
    return chamadas
}

const esperar = async (cond, ms = 2000) => {
    const inicio = Date.now()
    while (!cond()) {
        if (Date.now() - inicio > ms) throw new Error('condição não atingida')
        await tick(5)
    }
}

const CAMPO = `
    <div data-form-component="autocompletar" data-form-name="cliente_id" data-form-label="Cliente" data-form-v="required"
         data-form-autocompletar="/api/clientes?busca={termo}" data-form-autocompletar-debounce="20ms"
         data-form-autocompletar-texto="nome" data-form-autocompletar-descricao="email"
         data-form-autocompletar-campos="email, telefone:fone">
        <input type="text" id="cliente">
    </div>
    <input name="email"><input name="fone">`

function digitar(input, texto) {
    input.focus()
    input.value = texto
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto }))
}
const tecla = (input, key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
const opcoes = () => Array.from(document.querySelectorAll('[role=option]')).map(li => li.textContent)

afterEach(() => {
    for (const t of ['autocompletar', 'test']) if (AlpineForm.registry.has('transport', t)) AlpineForm.registry.unregister('transport', t)
    AlpineForm.autocompletar.limparCache()
    AlpineForm.resetConfig()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('autocompletar', () => {
    it('monta o combobox acessível e busca a partir do mínimo, com espera', async () => {
        const chamadas = servidor()
        const { form } = await mount(`<form x-data x-form novalidate>${CAMPO}</form>`)
        const input = form.querySelector('#cliente')
        const lista = form.querySelector('[role=listbox]')
        expect(input.getAttribute('role')).toBe('combobox')
        expect(input.getAttribute('aria-controls')).toBe(lista.id)
        expect(input.getAttribute('aria-expanded')).toBe('false')
        expect(lista.getAttribute('data-form-generated')).toBe('autocompletar')
        digitar(input, 'a')
        await tick(40)
        expect(chamadas).toEqual([])                                       // mínimo 2
        digitar(input, 'an')
        digitar(input, 'ana')
        await esperar(() => opcoes().length === 2)
        expect(chamadas).toEqual(['/api/clientes?busca=ana'])              // uma requisição só
        expect(opcoes()).toEqual(['Ana Souzaana@exemplo.com', 'Ana Limaana.lima@exemplo.com'])
        expect(input.getAttribute('aria-expanded')).toBe('true')
        expect(form.querySelector('[role=status]').textContent).toMatch(/2 resultado/)
    })

    it('teclado: setas marcam (aria-activedescendant), Enter escolhe sem enviar, valor e outros campos preenchidos', async () => {
        servidor()
        const enviar = vi.fn()
        const { form, api } = await mount(`<form x-data x-form @submit.prevent novalidate>${CAMPO}</form>`)
        form.addEventListener('form:before-submit', enviar)
        const eventos = []
        form.addEventListener('form:autocompletar-selecionado', e => eventos.push(e.detail))
        const input = form.querySelector('#cliente')
        digitar(input, 'ana')
        await esperar(() => opcoes().length === 2)
        tecla(input, 'ArrowDown')
        tecla(input, 'ArrowDown')
        const ativo = form.querySelector('[aria-selected=true]')
        expect(input.getAttribute('aria-activedescendant')).toBe(ativo.id)
        expect(ativo.textContent).toContain('Ana Lima')
        tecla(input, 'ArrowDown')                                           // volta ao primeiro (circular)
        tecla(input, 'ArrowUp')
        tecla(input, 'Enter')
        await flush()
        expect(enviar).not.toHaveBeenCalled()
        expect(input.value).toBe('Ana Lima')
        expect(api.getValues()).toMatchObject({ cliente_id: '2', email: 'ana.lima@exemplo.com', fone: '2222' })
        expect(input.getAttribute('aria-expanded')).toBe('false')
        expect(eventos[0]).toMatchObject({ name: 'cliente_id', valor: '2', texto: 'Ana Lima' })
    })

    it('digitar depois de escolher limpa a escolha (required pega texto sem escolha); clique escolhe', async () => {
        servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>${CAMPO}</form>`)
        const input = form.querySelector('#cliente')
        digitar(input, 'bru')
        await esperar(() => opcoes().length === 1)
        form.querySelector('[role=option]').click()
        expect(api.getValue('cliente_id')).toBe('3')
        digitar(input, 'Bruno Cost')
        expect(api.getValue('cliente_id')).toBe('')
        await api.validate()
        expect(api.field('cliente_id').errors.length).toBe(1)
        expect(input.getAttribute('aria-invalid')).toBe('true')                 // espelhado do contêiner
        expect(input.getAttribute('aria-describedby')).toBeTruthy()
    })

    it('não troca campos que a pessoa digitou; Esc fecha e depois limpa', async () => {
        servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>${CAMPO}</form>`)
        form.querySelector('[name=email]').value = 'meu@email.com'
        form.querySelector('[name=email]').dispatchEvent(new Event('input', { bubbles: true }))
        const input = form.querySelector('#cliente')
        digitar(input, 'ana')
        await esperar(() => opcoes().length === 2)
        tecla(input, 'ArrowDown')
        tecla(input, 'Enter')
        expect(api.getValues()).toMatchObject({ cliente_id: '1', email: 'meu@email.com', fone: '1111' })
        digitar(input, 'ana')
        await esperar(() => input.getAttribute('aria-expanded') === 'true')
        tecla(input, 'Escape')
        expect(input.getAttribute('aria-expanded')).toBe('false')
        expect(input.value).toBe('ana')
        tecla(input, 'Escape')
        expect(input.value).toBe('')
        expect(api.getValue('cliente_id')).toBe('')
    })

    it('respostas antigas são descartadas; vazio e erro são anunciados; texto do servidor não vira HTML', async () => {
        servidor({ atraso: url => (url.searchParams.get('busca') === 'an' ? 120 : 5), formato: j => j.map(c => ({ ...c, nome: c.nome === 'Ana Souza' ? '<b>Ana</b> Souza' : c.nome })) })
        const { form } = await mount(`<form x-data x-form novalidate>${CAMPO}</form>`)
        const input = form.querySelector('#cliente')
        const status = form.querySelector('[role=status]')
        digitar(input, 'an')
        await tick(40)
        digitar(input, 'bru')
        await esperar(() => opcoes().length === 1)
        await tick(150)
        expect(opcoes()[0]).toContain('Bruno')
        digitar(input, 'zzz')
        await esperar(() => status.textContent === 'Nenhum resultado encontrado.')
        expect(form.querySelector('.af-autocompletar-vazio')).not.toBeNull()
        digitar(input, 'falha')
        await esperar(() => status.textContent === 'Não foi possível buscar agora.')
        digitar(input, 'ana')
        await esperar(() => opcoes().length === 2)
        expect(form.querySelector('[role=option] b')).toBeNull()
        expect(opcoes()[0]).toContain('<b>Ana</b> Souza')
    })

    it('edição (valor inicial), reset volta ao inicial e envia o id', async () => {
        servidor()
        let corpo = null
        AlpineForm.transport('test', async request => {
            corpo = request.body
            return jsonResponse(200, { success: true })
        }, { replace: true })
        const { form, api } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" data-form-encoding="json" novalidate>
            <div data-form-component="autocompletar" data-form-name="cliente_id" data-form-autocompletar="/api/clientes?busca={termo}" data-form-autocompletar-inicial="7" data-form-autocompletar-debounce="0">
                <input type="text" id="cliente" value="Maria Silva">
            </div></form>`)
        const input = form.querySelector('#cliente')
        expect(api.getValue('cliente_id')).toBe('7')
        digitar(input, 'bru')
        await esperar(() => opcoes().length === 1)
        tecla(input, 'ArrowDown')
        tecla(input, 'Enter')
        expect(api.getValue('cliente_id')).toBe('3')
        api.reset()
        await flush()
        expect([api.getValue('cliente_id'), input.value]).toEqual(['7', 'Maria Silva'])
        await api.submit()
        expect(JSON.parse(corpo)).toEqual({ cliente_id: '7' })
    })

    it('modo livre envia o texto digitado quando nada é escolhido', async () => {
        servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>
            <div data-form-component="autocompletar" data-form-name="cidade" data-form-autocompletar="/api/clientes?busca={termo}" data-form-autocompletar-livre>
                <input type="text" id="c"></div></form>`)
        digitar(form.querySelector('#c'), 'Cidade nova')
        await flush()
        expect(api.getValue('cidade')).toBe('Cidade nova')
    })

    it('configuração inválida bloqueia o envio e destroy desfaz tudo', async () => {
        for (const html of [
            '<div data-form-component="autocompletar" data-form-name="a" data-form-autocompletar="/api/x"><input type="text"></div>',
            '<div data-form-component="autocompletar" data-form-name="a" data-form-autocompletar="https://outro.exemplo/?q={termo}"><input type="text"></div>',
            '<div data-form-component="autocompletar" data-form-name="a" data-form-autocompletar="/api/x?q={termo}"><input type="text" name="a_texto"></div>',
            '<div data-form-component="autocompletar" data-form-name="a" data-form-autocompletar="/api/x?q={termo}"></div>',
            '<div data-form-component="autocompletar" data-form-name="a" data-form-autocompletar="/api/x?q={termo}" data-form-autocompletar-minimo="dois"><input type="text"></div>',
        ]) {
            const { api, wrapper } = await mount(`<form x-data x-form data-form-log="none" novalidate>${html}</form>`)
            await flush()
            expect(api.configErrors.length, html).toBeGreaterThan(0)
            expect((await api.submit()).ok).toBe(false)
            wrapper.remove()
        }
        servidor()
        const { form, wrapper } = await mount(`<form x-data x-form novalidate>${CAMPO}</form>`)
        const input = form.querySelector('#cliente')
        window.Alpine.destroyTree(wrapper)
        await flush()
        expect(form.querySelector('[data-form-generated]')).toBeNull()
        expect(input.hasAttribute('role')).toBe(false)
        expect(input.hasAttribute('aria-expanded')).toBe(false)
    })

    it('extrairLista reconhece formatos comuns', () => {
        expect(extrairLista([1])).toEqual([1])
        expect(extrairLista({ data: [1] })).toEqual([1])
        expect(extrairLista({ success: true, data: { itens: [1] } })).toEqual([1])
        expect(extrairLista({ success: false })).toBeNull()
        expect(extrairLista({ results: [2] })).toEqual([2])
        expect(extrairLista('x')).toBeNull()
    })
})
