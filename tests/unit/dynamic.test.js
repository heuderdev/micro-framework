import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, tick, type, fakeTransport, jsonResponse, AlpineForm } from './helpers.js'

startAlpine()

afterEach(() => {
    AlpineForm.registry.unregister('transport', 'test')
    vi.restoreAllMocks()
})

describe('DOM dinâmico', () => {
    it('x-for: campos adicionados são descobertos e removidos com limpeza', async () => {
        const { form, api } = await mount(`
            <form x-data="{ itens: [{ id: 1 }] , seq: 1 }" x-form novalidate>
                <template x-for="(item, i) in itens" :key="item.id">
                    <div><input :name="'itens[' + i + '][nome]'" data-form-v="required"></div>
                </template>
                <button type="button" id="add" @click="itens.push({ id: ++seq })">+</button>
                <button type="button" id="rm" @click="itens.splice(0, 1)">-</button>
            </form>`)
        expect(Object.keys(api.fields)).toEqual(['itens.0.nome'])
        form.querySelector('#add').click()
        await vi.waitFor(() => expect(Object.keys(api.fields).sort()).toEqual(['itens.0.nome', 'itens.1.nome']))
        await api.validate()
        expect(form.querySelectorAll('.af-error').length).toBe(2)
        form.querySelector('#rm').click()
        await vi.waitFor(() => expect(Object.keys(api.fields)).toEqual(['itens.0.nome']))
        expect(Object.keys(api.errors)).toEqual(['itens.0.nome'])
    })

    it('erro do servidor acompanha a linha quando outra é removida e os nomes são reindexados', async () => {
        AlpineForm.transport('test', fakeTransport(() => jsonResponse(422, { errors: { 'itens.1.nome': ['Esgotado.'] } })), { replace: true })
        const { form, api } = await mount(`
            <form x-data="{ itens: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }] }" x-form action="/p" method="post" data-form-transport="test" novalidate>
                <template x-for="(item, i) in itens" :key="item.id">
                    <input :data-row="item.id" :name="'itens[' + i + '][nome]'" :value="item.v">
                </template>
                <button type="button" id="rm" @click="itens.splice(0, 1)">-</button>
            </form>`)
        await api.submit()
        const row2 = form.querySelector('[data-row="2"]')
        expect(api.fields['itens.1.nome'].serverErrors).toEqual(['Esgotado.'])
        form.querySelector('#rm').click()
        await tick(10)
        expect(row2.getAttribute('name')).toBe('itens[0][nome]')
        expect(api.fields['itens.0.nome'].serverErrors).toEqual(['Esgotado.'])
        expect(api.fields['itens.1.nome']).toBeUndefined()
        expect(document.getElementById(row2.getAttribute('aria-describedby')).textContent).toBe('Esgotado.')
    })

    it('x-if: campo removido sai da validação e do envio', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { success: true }))
        AlpineForm.transport('test', transport, { replace: true })
        const { form, api } = await mount(`
            <form x-data="{ cupom: true }" x-form action="/p" method="post" data-form-transport="test" novalidate>
                <template x-if="cupom"><input name="cupom" data-form-v="required"></template>
                <input name="nome" value="x">
                <button type="button" id="t" @click="cupom = !cupom">t</button>
            </form>`)
        expect((await api.validate()).valid).toBe(false)
        form.querySelector('#t').click()
        await tick(10)
        expect(api.fields.cupom).toBeUndefined()
        expect(form.querySelector('.af-error')).toBeNull()
        await api.submit()
        expect(Array.from(transport.calls[0].body.keys())).toEqual(['nome'])
    })

    it('regras alteradas dinamicamente (:data-form-v) são reaplicadas', async () => {
        const { form, api } = await mount(`
            <form x-data="{ obrig: false }" x-form novalidate>
                <input name="a" :data-form-v="obrig ? 'required' : ''">
                <button type="button" @click="obrig = true">x</button>
            </form>`)
        expect((await api.validate()).valid).toBe(true)
        form.querySelector('button').click()
        await tick(10)
        expect((await api.validate()).valid).toBe(false)
    })

    it('política de ocultos: x-show + data-form-hidden="skip" dispensa somente quando invisível', async () => {
        vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
            return this.closest('[style*="display: none"]') ? [] : [{}]
        })
        const { form, api } = await mount(`
            <form x-data="{ casa: false }" x-form novalidate>
                <div x-show="casa" data-form-hidden="skip"><input name="cep" data-form-v="required"></div>
                <div x-show="casa"><input name="numero" data-form-v="required"></div>
                <button type="button" @click="casa = true">casa</button>
            </form>`)
        let result = await api.validate()
        expect(result.invalidFields).toEqual(['numero'])
        form.querySelector('button').click()
        await tick(40)
        result = await api.validate()
        expect(result.invalidFields.sort()).toEqual(['cep', 'numero'])
    })

    it('múltiplos formulários isolados, inclusive com nomes iguais', async () => {
        const { wrapper } = await mount(`
            <form x-data x-form id="a" novalidate><input name="email" data-form-v="required"></form>
            <form x-data x-form id="b" novalidate><input name="email" data-form-v="required"></form>`)
        const a = AlpineForm.get('a')
        const b = AlpineForm.get('b')
        await a.validate()
        expect(a.errors.email).toBeTruthy()
        expect(b.errors).toEqual({})
        expect(wrapper.querySelectorAll('.af-error').length).toBe(1)
        type(wrapper.querySelector('#b input'), 'x')
        await flush()
        expect(a.fields.email.dirty).toBe(false)
        expect(b.fields.email.dirty).toBe(true)
    })

    it('$form em elementos fora do form via data-form-for e refresh() para campos externos', async () => {
        const { wrapper, api } = await mount(`
            <div x-data>
                <form x-form id="ext" novalidate><input name="a" data-form-v="required"></form>
                <div data-form-for="ext"><span id="out" x-text="$form && $form.dirty ? 'sujo' : 'limpo'"></span></div>
            </div>`)
        type(wrapper.querySelector('[name=a]'), 'x')
        await flush()
        expect(wrapper.querySelector('#out').textContent).toBe('sujo')
        const extra = document.createElement('input')
        extra.setAttribute('form', 'ext')
        extra.name = 'b'
        extra.setAttribute('data-form-v', 'required')
        wrapper.appendChild(extra)
        expect(api.has('b')).toBe(false)
        api.refresh()
        expect(api.has('b')).toBe(true)
    })

    it('componente externo via adaptador participa da validação e da serialização', async () => {
        AlpineForm.component('nota_teste', {
            getValue: el => el.dataset.valor || '',
            setValue: (el, v) => { el.dataset.valor = v },
            subscribe(el, notify) {
                const handler = () => notify()
                el.addEventListener('mudou', handler)
                return () => el.removeEventListener('mudou', handler)
            },
        }, { replace: true })
        const transport = fakeTransport(() => jsonResponse(200, { success: true }))
        AlpineForm.transport('test', transport, { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form action="/c" method="post" data-form-transport="test" novalidate>
                <div data-form-component="nota_teste" data-form-name="nota" data-form-v="required|min_value:3"></div>
            </form>`)
        const widget = form.querySelector('[data-form-component]')
        widget.dataset.valor = '2'
        widget.dispatchEvent(new Event('mudou'))
        await flush()
        expect(api.fields.nota.errors[0]).toBe('O valor mínimo de nota é 3.')
        api.setValue('nota', '5')
        await api.submit()
        expect(transport.calls[0].body.get('nota')).toBe('5')
    })

    it('diagnóstico quando um <form x-form> não foi inicializado pelo Alpine', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        document.body.insertAdjacentHTML('beforeend', '<div x-ignore><form x-form id="solto"></form></div>')
        await flush()
        const missing = AlpineForm.diagnose()
        expect(missing.map(f => f.id)).toEqual(['solto'])
        expect(AlpineForm.get('solto')).toBeNull()
        expect(warn.mock.calls.some(call => String(call[0]).includes('não foi inicializado'))).toBe(true)
    })

    it('UI gerada (lista de arquivos, botões de cancelar) não dispara refresh em ciclo', async () => {
        const { form, api } = await mount(`
            <form x-data x-form action="/c" method="post" novalidate>
                <input type="file" name="docs[]" multiple>
                <div data-form-file-list="docs[]"></div>
                <button type="button" data-form-cancel>Cancelar</button>
                <div data-form-progress><p data-form-status></p></div>
            </form>`)
        api.addFiles('docs', [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')])
        await flush()
        await tick(20)
        let mutations = 0
        const observer = new MutationObserver(records => (mutations += records.length))
        observer.observe(form, { subtree: true, childList: true, attributes: true })
        await tick(50)
        observer.disconnect()
        expect(mutations).toBe(0)
        expect(form.querySelectorAll('.af-file')).toHaveLength(2)
    })
})
