import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, tick, type, change, fakeTransport, jsonResponse, AlpineForm } from './helpers.js'
import rascunhoPlugin, { RASCUNHO_PREFIXO } from '../../src/rascunho/index.js'

startAlpine(rascunhoPlugin)

afterEach(() => {
    AlpineForm.resetConfig()
    if (AlpineForm.registry.has('transport', 'test')) AlpineForm.registry.unregister('transport', 'test')
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
})

const CAMPOS = `
    <input name="nome">
    <select name="uf"><option value="">--</option><option>SP</option><option>MG</option></select>
    <input type="radio" name="tipo" value="pf"><input type="radio" name="tipo" value="pj">
    <input type="checkbox" name="int[]" value="a"><input type="checkbox" name="int[]" value="b"><input type="checkbox" name="int[]" value="c">
    <textarea name="obs"></textarea>
    <input name="senha" type="password">
    <input name="token" data-form-sensitive>
    <input name="interno" data-form-rascunho-ignorar>
    <input name="doc" type="file">`

const salvo = (id, storage = localStorage) => JSON.parse(storage.getItem(RASCUNHO_PREFIXO + id) || 'null')
const esperarSalvar = () => tick(450)

describe('rascunho automático', () => {
    it('salva depois que a digitação para, sem senha, sensível, arquivo nem campo ignorado', async () => {
        const { form } = await mount(`<form id="cad" x-data x-form data-form-rascunho novalidate>${CAMPOS}</form>`)
        const eventos = []
        form.addEventListener('form:rascunho-salvo', e => eventos.push(e.detail.campos))
        type(form.querySelector('[name=nome]'), 'Maria')
        form.querySelector('[name=uf]').value = 'MG'
        change(form.querySelector('[name=uf]'))
        form.querySelector('[value=pj]').checked = true
        change(form.querySelector('[value=pj]'))
        for (const v of ['a', 'c']) {
            form.querySelector(`[value=${v}]`).checked = true
            change(form.querySelector(`[value=${v}]`))
        }
        type(form.querySelector('[name=obs]'), 'linha 1\nlinha 2')
        type(form.querySelector('[name=senha]'), 'segredo123')
        type(form.querySelector('[name=token]'), 'tok-secreto')
        type(form.querySelector('[name=interno]'), 'nao-guardar')
        expect(salvo('cad')).toBeNull()                         // ainda dentro da espera
        await esperarSalvar()
        const dados = salvo('cad')
        expect(dados.valores).toEqual({ nome: 'Maria', uf: 'MG', tipo: 'pj', 'int[]': ['a', 'c'], obs: 'linha 1\nlinha 2' })
        expect(JSON.stringify(localStorage)).not.toMatch(/segredo123|tok-secreto|nao-guardar/)
        expect(eventos.at(-1)).not.toContain('senha')
    })

    it('restaura ao abrir, sem disparar validação nem form:change, e avisa com form:rascunho-restaurado', async () => {
        localStorage.setItem(RASCUNHO_PREFIXO + 'cad', JSON.stringify({ salvoEm: Date.now(), valores: { nome: 'Ana', uf: 'SP', tipo: 'pf', 'int[]': ['b'], obs: 'oi', senha: 'injetada', inexistente: 'x' } }))
        const restaurados = []
        document.addEventListener('form:rascunho-restaurado', e => restaurados.push(e.detail.campos), { once: true })
        const mudancas = []
        document.addEventListener('form:change', () => mudancas.push(1))
        const { form, api } = await mount(`<form id="cad" x-data x-form data-form-rascunho novalidate>
            <input name="nome" data-form-v="required|min:3">${CAMPOS.replace('<input name="nome">', '')}</form>`)
        expect(form.querySelector('[name=nome]').value).toBe('Ana')
        expect(form.querySelector('[name=uf]').value).toBe('SP')
        expect(form.querySelector('[value=pf]').checked).toBe(true)
        expect(form.querySelector('[value=b]').checked).toBe(true)
        expect(form.querySelector('[name=obs]').value).toBe('oi')
        expect(form.querySelector('[name=senha]').value).toBe('')     // senha nunca é restaurada, mesmo se estiver no storage
        expect(restaurados[0]).toEqual(expect.arrayContaining(['nome', 'uf', 'tipo', 'int[]', 'obs']))
        expect(restaurados[0]).not.toContain('senha')
        expect(api.fields.nome.validated).toBe(false)
        expect(api.errors).toEqual({})
        expect(mudancas).toEqual([])
    })

    it('rascunho vencido é apagado; validade configurável em dias', async () => {
        localStorage.setItem(RASCUNHO_PREFIXO + 'cad', JSON.stringify({ salvoEm: Date.now() - 3 * 86400000, valores: { nome: 'Velho' } }))
        const { form } = await mount(`<form id="cad" x-data x-form data-form-rascunho="2" novalidate><input name="nome"></form>`)
        expect(form.querySelector('[name=nome]').value).toBe('')
        expect(salvo('cad')).toBeNull()
    })

    it('apaga no envio com sucesso (inclusive salvamento pendente) e no reset; não apaga em erro', async () => {
        let resposta = jsonResponse(422, { success: false, errors: { nome: ['Erro'] } })
        AlpineForm.transport('test', fakeTransport(() => resposta), { replace: true })
        const { form, api } = await mount(`<form id="cad" x-data x-form action="/x" method="post" data-form-transport="test" data-form-rascunho novalidate><input name="nome"></form>`)
        type(form.querySelector('[name=nome]'), 'Ana')
        await esperarSalvar()
        await api.submit()
        expect(salvo('cad')).not.toBeNull()                    // falhou: rascunho continua
        resposta = jsonResponse(200, { success: true })
        type(form.querySelector('[name=nome]'), 'Ana Maria')   // salvamento agendado...
        await api.submit()                                      // ...e o sucesso chega antes dele
        await esperarSalvar()
        expect(salvo('cad')).toBeNull()
        type(form.querySelector('[name=nome]'), 'Bia')
        await esperarSalvar()
        expect(salvo('cad')).not.toBeNull()
        api.reset()
        expect(salvo('cad')).toBeNull()
    })

    it('storage "none" (no form ou global) desliga leitura e gravação', async () => {
        localStorage.setItem(RASCUNHO_PREFIXO + 'cad', JSON.stringify({ salvoEm: Date.now(), valores: { nome: 'Guardado' } }))
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        const um = await mount(`<form id="cad" x-data x-form data-form-rascunho data-form-storage="none" novalidate><input name="nome"></form>`)
        expect(um.form.querySelector('[name=nome]').value).toBe('')
        type(um.form.querySelector('[name=nome]'), 'Novo')
        await esperarSalvar()
        document.body.innerHTML = ''
        AlpineForm.configure({ storage: 'none' })
        const dois = await mount(`<form id="outro" x-data x-form data-form-rascunho novalidate><input name="nome"></form>`)
        type(dois.form.querySelector('[name=nome]'), 'Novo')
        await esperarSalvar()
        expect(setItem).not.toHaveBeenCalled()
    })

    it('data-form-rascunho-sessao usa sessionStorage', async () => {
        const { form } = await mount(`<form id="cad" x-data x-form data-form-rascunho data-form-rascunho-sessao novalidate><input name="nome"></form>`)
        type(form.querySelector('[name=nome]'), 'Ana')
        await esperarSalvar()
        expect(salvo('cad', sessionStorage).valores).toEqual({ nome: 'Ana' })
        expect(salvo('cad')).toBeNull()
    })

    it('configuração inválida é erro (sem id, dias inválidos)', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = `
            <div x-data><form x-form data-form-rascunho><input name="a"></form></div>
            <div x-data><form id="b" x-form data-form-rascunho="sete"><input name="a"></form></div>
            <div x-data><form id="c" x-form data-form-rascunho="0"><input name="a"></form></div>`
        await flush()
        const forms = document.querySelectorAll('form')
        for (const f of forms) {
            expect(AlpineForm.get(f)).toBeNull()
            expect(f.getAttribute('data-form-state')).toBe('config-error')
        }
    })

    it('destroy remove os ouvintes; AlpineForm.rascunho salva, lê e descarta pelo código', async () => {
        const { form, api } = await mount(`<form id="cad" x-data x-form data-form-rascunho novalidate><input name="nome"></form>`)
        form.querySelector('[name=nome]').value = 'Direto'
        AlpineForm.rascunho.salvar('cad')
        expect(AlpineForm.rascunho.ler('cad').valores).toEqual({ nome: 'Direto' })
        AlpineForm.rascunho.descartar(form)
        expect(salvo('cad')).toBeNull()
        api.destroy()
        type(form.querySelector('[name=nome]'), 'Depois do destroy')
        await esperarSalvar()
        expect(salvo('cad')).toBeNull()
    })

    it('formulário sem data-form-rascunho não é afetado', async () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        const { form } = await mount(`<form id="cad" x-data x-form novalidate><input name="nome"></form>`)
        type(form.querySelector('[name=nome]'), 'Ana')
        await esperarSalvar()
        expect(setItem).not.toHaveBeenCalled()
    })
})
