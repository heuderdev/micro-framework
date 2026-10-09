import { describe, it, expect } from 'vitest'
import { startAlpine, mount, type, blur, flush } from './helpers.js'

startAlpine()

describe('smoke', () => {
    it('inicializa e valida', async () => {
        const { form, api } = await mount(`
          <form x-data x-form action="/api" method="post" novalidate>
            <label for="n">Nome</label>
            <input id="n" name="nome" data-form-v="required|min:3" data-form-msg.min="Digite pelo menos :min caracteres.">
          </form>`)
        expect(api).toBeTruthy()
        expect(api.ready).toBe(true)
        const input = form.querySelector('input')
        type(input, 'ab')
        blur(input)
        await flush()
        expect(api.fields.nome.errors).toEqual(['Digite pelo menos 3 caracteres.'])
        expect(input.getAttribute('aria-invalid')).toBe('true')
        const err = document.getElementById(input.getAttribute('aria-describedby'))
        expect(err.textContent).toBe('Digite pelo menos 3 caracteres.')
    })
})
