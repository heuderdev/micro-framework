import { describe, it, expect, afterEach } from 'vitest'
import { startAlpine, mount, flush, tick, fakeTransport, jsonResponse, AlpineForm } from './helpers.js'
import masksPlugin from '../../src/masks/index.js'

startAlpine(masksPlugin)

afterEach(() => {
    AlpineForm.registry.unregister('transport', 'test')
    AlpineForm.registry.unregister('transport', 'remote')
})

/** Simula digitação: insere texto na posição do cursor e dispara beforeinput/input como o navegador. */
function typeAt(input, text, position = input.value.length) {
    input.focus()
    const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text })
    input.dispatchEvent(before)
    if (before.defaultPrevented) return
    input.value = input.value.slice(0, position) + text + input.value.slice(position)
    input.setSelectionRange(position + text.length, position + text.length)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
}

function backspace(input, position) {
    input.focus()
    input.setSelectionRange(position, position)
    const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' })
    input.dispatchEvent(before)
    if (before.defaultPrevented) return
    input.value = input.value.slice(0, position - 1) + input.value.slice(position)
    input.setSelectionRange(position - 1, position - 1)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
}

function paste(input, text) {
    input.focus()
    input.select()
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: text }))
    input.value = text
    input.setSelectionRange(text.length, text.length)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }))
}

describe('máscaras integradas ao formulário', () => {
    it('valor inicial do servidor é formatado sem marcar dirty; inputmode adicionado e removido no destroy', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="cpf" value="52998224725" data-form-mask="cpf"></form>`)
        const input = form.querySelector('input')
        expect(input.value).toBe('529.982.247-25')
        expect(input.getAttribute('inputmode')).toBe('numeric')
        expect(api.dirty).toBe(false)
        api.destroy()
        expect(input.hasAttribute('inputmode')).toBe(false)
    })

    it('digitação caractere a caractere com cursor e edição no meio', async () => {
        const { form } = await mount(`<form x-data x-form novalidate><input name="cpf" data-form-mask="cpf"></form>`)
        const input = form.querySelector('input')
        for (const ch of '5299822') typeAt(input, ch)
        expect(input.value).toBe('529.982.2')
        expect(input.selectionStart).toBe(9)
        typeAt(input, '0', 1)
        expect(input.value).toBe('502.998.22')
        expect(input.selectionStart).toBe(2)
    })

    it('Backspace ao lado de literal remove o dígito anterior (sem prender o cursor)', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="cep" value="01310100" data-form-mask="cep"></form>`)
        const input = form.querySelector('input')
        expect(input.value).toBe('01310-100')
        backspace(input, 6)
        expect(input.value).toBe('01311-00')
        expect(input.selectionStart).toBe(4)
        await flush()
        expect(api.fields.cep.value).toBe('01311-00')
    })

    it('colagem formatada e bruta; CPF -> CNPJ dinâmico', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="doc" data-form-mask="cpf_cnpj" data-form-v="cpf_cnpj"></form>`)
        const input = form.querySelector('input')
        paste(input, '11222333000181')
        expect(input.value).toBe('11.222.333/0001-81')
        paste(input, '529.982.247-25')
        expect(input.value).toBe('529.982.247-25')
        expect((await api.validate()).valid).toBe(true)
    })

    it('representações separadas: validação e envio usam o configurado', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { success: true }))
        AlpineForm.transport('test', transport, { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-transport="test" novalidate>
                <input name="cpf" value="52998224725" data-form-mask="cpf" data-form-submit-value="raw">
                <input name="tel" value="11987654321" data-form-mask="telefone_br">
                <input name="valor" data-form-mask="currency" data-form-v="required|numeric|min_value:0.01">
                <input name="data" value="31/12/2024" data-form-mask="date" data-form-v="date">
            </form>`)
        api.setValue('valor', '1234.5', { as: 'canonical' })
        expect(form.querySelector('[name=valor]').value).toBe('R$ 1.234,50')
        expect(api.getValue('valor', { as: 'raw' })).toBe('123450')
        expect(api.getValue('valor')).toBe('1234.50')
        expect(api.getValue('cpf', { as: 'formatted' })).toBe('529.982.247-25')
        expect(api.getValue('data')).toBe('2024-12-31')
        await api.submit()
        const body = transport.calls[0].body
        expect(body.get('cpf')).toBe('52998224725')
        expect(body.get('tel')).toBe('(11) 98765-4321')
        expect(body.get('valor')).toBe('1234.50')
        expect(body.get('data')).toBe('2024-12-31')
        expect(form.querySelectorAll('input[type=hidden]').length).toBe(0)
        expect(form.querySelector('[name=cpf]').value).toBe('529.982.247-25')
    })

    it('validação recebe a representação canônica da moeda e nunca Number', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="valor" data-form-mask="currency" data-form-v="numeric|min_value:0.01"></form>`)
        const input = form.querySelector('input')
        typeAt(input, '0')
        typeAt(input, ',')
        typeAt(input, '0')
        typeAt(input, '0')
        expect(input.value).toBe('R$ 0,00')
        await api.validate()
        expect(api.fields.valor.errors[0]).toBe('O valor mínimo de valor é 0.01.')
        expect(typeof api.getValue('valor')).toBe('string')
    })

    it('reset restaura valor e apresentação; blur completa casas decimais', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="valor" value="10.5" data-form-mask="currency"></form>`)
        const input = form.querySelector('input')
        expect(input.value).toBe('R$ 105')
        api.setValue('valor', '7', { as: 'canonical' })
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        api.reset()
        expect(input.value).toBe('R$ 105')
        input.value = 'R$ 1,5'
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        expect(input.value).toBe('R$ 1,50')
    })

    it('troca dinâmica de máscara reformata a partir dos caracteres significativos', async () => {
        const { form } = await mount(`<form x-data x-form novalidate><input name="t" value="11987654321" data-form-mask="celular"></form>`)
        const input = form.querySelector('input')
        expect(input.value).toBe('(11) 98765-4321')
        input.setAttribute('data-form-mask', 'cpf')
        await tick(10)
        expect(input.value).toBe('119.876.543-21')
    })

    it('validação remota recebe o valor bruto configurado e máscara não substitui validação', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { valid: true }))
        AlpineForm.transport('remote', transport, { replace: true })
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="cpf" value="111.111.111-11" data-form-mask="cpf" data-form-v="cpf" data-form-remote="/r"></form>`)
        const result = await api.validate()
        expect(result.valid).toBe(false)
        expect(transport.calls).toHaveLength(0)
        api.setValue('cpf', '52998224725', { as: 'raw' })
        await api.validate()
        expect(new URLSearchParams(transport.calls[0].body).get('cpf')).toBe('52998224725')
        expect(form.querySelector('input').value).toBe('529.982.247-25')
    })

    it('máscara em type=number é recusada com erro de configuração', async () => {
        const errors = []
        const original = console.error
        console.error = (...args) => errors.push(args.join(' '))
        try {
            const { api } = await mount(`<form x-data x-form novalidate><input type="number" name="n" data-form-mask="integer"></form>`)
            expect(api.fields.n.configError).toMatch(/type="number"/)
        } finally {
            console.error = original
        }
    })

    it('composição IME não é formatada até terminar', async () => {
        const { form } = await mount(`<form x-data x-form novalidate><input name="c" data-form-mask="pattern" data-form-mask-pattern="AAA-9999" data-form-mask-case="upper"></form>`)
        const input = form.querySelector('input')
        input.focus()
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        input.value = 'ab'
        input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
        expect(input.value).toBe('ab')
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
        expect(input.value).toBe('AB')
    })
})
