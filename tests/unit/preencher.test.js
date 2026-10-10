import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, tick, type, change, jsonResponse, AlpineForm } from './helpers.js'
import masksPlugin from '../../src/masks/index.js'
import opcoesPlugin from '../../src/opcoes/index.js'
import preencherPlugin, { lerCaminho, extrairDados } from '../../src/preencher/index.js'

startAlpine(masksPlugin, opcoesPlugin, preencherPlugin)

const CEPS = {
    '01001000': { cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', ibge: '3550308' },
    '20040020': { cep: '20040-020', logradouro: 'Rua da Assembleia', bairro: 'Centro', localidade: 'Rio de Janeiro', uf: 'RJ', ibge: '3304557' },
}

function servidor({ atraso = () => 0, falha = () => null } = {}) {
    const chamadas = []
    const transporte = async request => {
        const url = new URL(request.url)
        chamadas.push({ url: url.href, credentials: request.credentials, headers: request.headers })
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
        if (url.hostname === 'viacep.com.br') {
            const cep = url.pathname.split('/')[2]
            return jsonResponse(200, CEPS[cep] || { erro: 'true' })
        }
        if (url.pathname.startsWith('/api/cep/')) {
            const cep = url.pathname.split('/').pop()
            return CEPS[cep] ? jsonResponse(200, { success: true, data: CEPS[cep] }) : jsonResponse(404, { success: false, message: 'CEP não encontrado' })
        }
        if (url.pathname === '/ufs') return jsonResponse(200, { SP: 'São Paulo', RJ: 'Rio de Janeiro' })
        if (url.pathname === '/cidades') {
            const uf = url.searchParams.get('uf')
            return jsonResponse(200, uf === 'SP' ? [{ id: '3550308', nome: 'São Paulo' }] : [{ id: '3304557', nome: 'Rio de Janeiro' }])
        }
        return jsonResponse(404, {})
    }
    transporte.chamadas = chamadas
    AlpineForm.transport('preencher', transporte, { replace: true })
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

const ENDERECO = `
    <input name="cep" data-form-mask="cep" data-form-v="cep"
           data-form-preencher="/api/cep/{cep}" data-form-preencher-minimo="8" data-form-preencher-debounce="50ms"
           data-form-preencher-campos="logradouro, bairro, localidade:cidade, uf">
    <input name="logradouro"><input name="numero"><input name="bairro"><input name="cidade"><input name="uf">`

afterEach(() => {
    for (const t of ['preencher', 'opcoes']) if (AlpineForm.registry.has('transport', t)) AlpineForm.registry.unregister('transport', t)
    AlpineForm.opcoes.limparCache()
    AlpineForm.resetConfig()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

const valor = (form, nome) => form.querySelector(`[name="${nome}"]`).value

describe('autopreenchimento', () => {
    it('CEP completo preenche os campos mapeados (mesma origem, com cookies e X-Requested-With)', async () => {
        const t = servidor()
        const { form } = await mount(`<form x-data x-form novalidate>${ENDERECO}</form>`)
        const eventos = []
        form.addEventListener('form:preenchido', e => eventos.push(e.detail))
        type(form.querySelector('[name=cep]'), '0100100')
        await tick(80)
        expect(t.chamadas).toHaveLength(0)                               // incompleto: não busca
        type(form.querySelector('[name=cep]'), '01001000')
        expect(form.querySelector('[name=cep]').value).toBe('01001-000')
        await esperar(() => valor(form, 'cidade') === 'São Paulo')
        expect([valor(form, 'logradouro'), valor(form, 'bairro'), valor(form, 'uf')]).toEqual(['Praça da Sé', 'Sé', 'SP'])
        expect(t.chamadas[0].url).toBe('http://localhost:3000/api/cep/01001000')
        expect(t.chamadas[0].credentials).toBe('same-origin')
        expect(t.chamadas[0].headers['X-Requested-With']).toBe('XMLHttpRequest')
        expect(eventos[0]).toEqual({ name: 'cep', campos: ['logradouro', 'bairro', 'cidade', 'uf'] })
        expect(form.querySelector('[name=cep]').getAttribute('data-form-preencher-estado')).toBe('pronto')
    })

    it('não apaga o que a pessoa digitou, mas troca o que ele mesmo preencheu', async () => {
        servidor()
        const { form } = await mount(`<form x-data x-form novalidate>${ENDERECO}</form>`)
        type(form.querySelector('[name=bairro]'), 'Meu bairro')
        type(form.querySelector('[name=cep]'), '01001000')
        await esperar(() => valor(form, 'cidade') === 'São Paulo')
        expect(valor(form, 'bairro')).toBe('Meu bairro')
        type(form.querySelector('[name=cep]'), '20040020')
        await esperar(() => valor(form, 'cidade') === 'Rio de Janeiro')
        expect([valor(form, 'logradouro'), valor(form, 'uf'), valor(form, 'bairro')]).toEqual(['Rua da Assembleia', 'RJ', 'Meu bairro'])
        type(form.querySelector('[name=logradouro]'), 'Editado à mão')
        form.querySelector('[name=cep]').setAttribute('data-form-preencher-sobrescrever', '')
        type(form.querySelector('[name=cep]'), '01001000')
        await esperar(() => valor(form, 'cidade') === 'São Paulo')
        expect(valor(form, 'logradouro')).toBe('Praça da Sé')
    })

    it('CEP não encontrado vira erro no campo; inválido nem chega a buscar', async () => {
        const t = servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>${ENDERECO.replace('data-form-v="cep"', 'data-form-v="cep" data-form-preencher-nao-encontrado="CEP não encontrado."')}</form>`)
        const erros = []
        form.addEventListener('form:preencher-erro', e => erros.push(e.detail))
        type(form.querySelector('[name=cep]'), '99999999')
        await esperar(() => erros.length === 1)
        expect(erros[0]).toEqual({ name: 'cep', status: 404, motivo: 'nao-encontrado' })
        await flush()
        expect(api.field('cep').errors).toContain('CEP não encontrado.')
        expect(valor(form, 'cidade')).toBe('')
        type(form.querySelector('[name=cep]'), '00000000')        // dígitos repetidos: inválido pela regra cep? (aceito) → busca
        await tick(80)
        expect(t.chamadas.length).toBeGreaterThanOrEqual(1)
    })

    it('não busca quando o próprio campo não passa na validação', async () => {
        const t = servidor()
        const { form } = await mount(`<form x-data x-form novalidate>
            <input name="cnpj" data-form-mask="cnpj" data-form-v="cnpj" data-form-preencher="/api/empresa/{cnpj}" data-form-preencher-minimo="14" data-form-preencher-debounce="0" data-form-preencher-campos="razao_social">
            <input name="razao_social"></form>`)
        type(form.querySelector('[name=cnpj]'), '11222333000180')    // dígito verificador errado
        await tick(50)
        expect(t.chamadas).toHaveLength(0)
    })

    it('resposta antiga é descartada; digitação rápida faz uma busca só', async () => {
        const t = servidor({ atraso: url => (url.pathname.endsWith('01001000') ? 150 : 10) })
        const { form } = await mount(`<form x-data x-form novalidate>${ENDERECO}</form>`)
        type(form.querySelector('[name=cep]'), '01001000')
        await tick(80)
        type(form.querySelector('[name=cep]'), '20040020')
        await esperar(() => valor(form, 'cidade') === 'Rio de Janeiro')
        await tick(200)
        expect(valor(form, 'cidade')).toBe('Rio de Janeiro')
        expect(t.chamadas.map(c => c.url.split('/').pop())).toEqual(['01001000', '20040020'])
    })

    it('viacep: serviço pronto (outra origem sem cookies nem cabeçalhos próprios) e {"erro": "true"} = não encontrado', async () => {
        const t = servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>
            <input name="cep" data-form-mask="cep" data-form-preencher="viacep" data-form-preencher-debounce="0" data-form-preencher-campos="logradouro, localidade:cidade">
            <input name="logradouro"><input name="cidade"></form>`)
        type(form.querySelector('[name=cep]'), '20040020')
        await esperar(() => valor(form, 'cidade') === 'Rio de Janeiro')
        expect(t.chamadas[0]).toMatchObject({ url: 'https://viacep.com.br/ws/20040020/json/', credentials: 'omit', headers: { Accept: 'application/json' } })
        type(form.querySelector('[name=cep]'), '99999999')
        await esperar(() => api.field('cep').errors.length > 0)
        expect(valor(form, 'cidade')).toBe('Rio de Janeiro')       // nada é apagado
    })

    it('preenche selects dependentes (data-form-opcoes) na ordem: UF e depois a cidade quando a lista chega', async () => {
        servidor()
        const { form, api } = await mount(`<form x-data x-form novalidate>
            <input name="cep" data-form-mask="cep" data-form-preencher="/api/cep/{cep}" data-form-preencher-debounce="0" data-form-preencher-campos="uf, ibge:cidade">
            <select name="uf" data-form-opcoes="/ufs"><option value="">UF</option></select>
            <select name="cidade" data-form-opcoes="/cidades?uf={uf}"><option value="">Cidade</option></select></form>`)
        await esperar(() => form.querySelector('[name=uf]').options.length === 3)
        type(form.querySelector('[name=cep]'), '01001000')
        await esperar(() => valor(form, 'cidade') === '3550308')
        expect(api.getValues()).toMatchObject({ uf: 'SP', cidade: '3550308' })
        type(form.querySelector('[name=cep]'), '20040020')
        await esperar(() => valor(form, 'cidade') === '3304557')
        expect(valor(form, 'uf')).toBe('RJ')
    })

    it('outra origem sem liberação é erro de configuração; permitirOrigem libera', async () => {
        servidor()
        const { form, api, wrapper } = await mount(`<form x-data x-form data-form-log="none" novalidate>
            <input name="cep" data-form-preencher="https://cep.exemplo.com/{cep}" data-form-preencher-debounce="0" data-form-preencher-campos="uf"><input name="uf"></form>`)
        type(form.querySelector('[name=cep]'), '01001000')
        await esperar(() => api.configErrors.length > 0)
        expect((await api.submit()).ok).toBe(false)
        wrapper.remove()
        AlpineForm.preencher.permitirOrigem('https://cep.exemplo.com/qualquer')
        const t = servidor()
        const { form: f2 } = await mount(`<form x-data x-form novalidate>
            <input name="cep" data-form-preencher="https://cep.exemplo.com/{cep}" data-form-preencher-debounce="0" data-form-preencher-campos="uf"><input name="uf"></form>`)
        type(f2.querySelector('[name=cep]'), '01001000')
        await esperar(() => t.chamadas.length === 1)
        expect(t.chamadas[0].credentials).toBe('omit')
    })

    it('configuração inválida bloqueia o envio', async () => {
        servidor()
        for (const html of [
            '<input name="cep" data-form-preencher="/api/cep/{cep}">',
            '<input name="cep" data-form-preencher="servico-inexistente" data-form-preencher-campos="uf">',
            '<input name="cep" data-form-preencher="/x/{cep}" data-form-preencher-campos="a:b:c">',
            '<input name="cep" data-form-preencher="/x/{cep}" data-form-preencher-campos="__proto__.x:uf">',
            '<input name="cep" data-form-preencher="/x/{cep}" data-form-preencher-campos="uf" data-form-preencher-minimo="oito">',
        ]) {
            const { api, wrapper } = await mount(`<form x-data x-form data-form-log="none" novalidate>${html}<input name="uf"></form>`)
            await flush()
            expect(api.configErrors.length, html).toBeGreaterThan(0)
            wrapper.remove()
        }
    })

    it('AlpineForm.preencher.buscar força a busca; falha de rede permite tentar de novo; campos sensíveis nunca são preenchidos', async () => {
        let falhar = true
        const t = servidor({ falha: () => (falhar ? jsonResponse(503, {}) : null) })
        const { form } = await mount(`<form id="f" x-data x-form data-form-log="none" novalidate>
            <input name="cep" data-form-preencher="/api/cep/{cep}" data-form-preencher-debounce="0" data-form-preencher-campos="uf, cep:senha">
            <input name="uf"><input name="senha" type="password"></form>`)
        const erros = []
        form.addEventListener('form:preencher-erro', e => erros.push(e.detail))
        type(form.querySelector('[name=cep]'), '01001000')
        await esperar(() => erros.length === 1)
        expect(erros[0]).toMatchObject({ status: 503, motivo: 'falha' })
        falhar = false
        expect(await AlpineForm.preencher.buscar('f', 'cep')).toBe(true)
        expect([valor(form, 'uf'), valor(form, 'senha')]).toEqual(['SP', ''])
        expect(t.chamadas).toHaveLength(2)
    })

    it('lerCaminho e extrairDados', () => {
        expect(lerCaminho({ a: { b: 1 } }, 'a.b')).toBe(1)
        expect(lerCaminho({ a: 1 }, 'a.b')).toBeUndefined()
        expect(lerCaminho(JSON.parse('{"__proto__": {"x": 1}}'), '__proto__.x')).toBe(1)   // propriedade própria, sem tocar no protótipo
        expect(extrairDados({ success: true, data: { a: 1 } })).toEqual({ a: 1 })
        expect(extrairDados({ success: false })).toBeNull()
        expect(extrairDados({ data: { a: 1 } })).toEqual({ a: 1 })
        expect(extrairDados([{ a: 1 }])).toEqual({ a: 1 })
        expect(extrairDados({ erro: true })).toBeNull()
        expect(extrairDados('x')).toBeNull()
    })
})

void change
