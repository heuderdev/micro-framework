import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, type, blur, change, flush, tick, fakeTransport, jsonResponse, AlpineForm } from './helpers.js'

startAlpine()

afterEach(() => {
    AlpineForm.registry.unregister('transport', 'remote')
    AlpineForm.resetConfig()
})

const $ = (root, sel) => root.querySelector(sel)

describe('validação ao vivo (modo live)', () => {
    it('não mostra erros antes da interação, valida no blur e revalida ao digitar', async () => {
        const { form, api } = await mount(`
            <form x-data x-form data-form-debounce="0" novalidate>
                <input name="nome" data-form-v="required|min:3">
            </form>`)
        const input = $(form, 'input')
        type(input, 'a')
        await flush()
        expect(api.fields.nome.errors).toEqual([])
        expect(api.fields.nome.validated).toBe(false)
        expect(form.querySelector('.af-error')).toBeNull()
        blur(input)
        await flush()
        expect(api.fields.nome.errors).toEqual(['Digite pelo menos 3 caracteres.'])
        type(input, 'abc')
        await flush()
        expect(api.fields.nome.errors).toEqual([])
        expect(api.fields.nome.valid).toBe(true)
    })

    it('campo não validado nunca aparece como aprovado', async () => {
        const { form, api } = await mount(`<form x-data x-form data-form-show-valid novalidate><input name="a" data-form-v="required"></form>`)
        expect(api.fields.a.valid).toBe(false)
        expect($(form, 'input').classList.contains('af-valid')).toBe(false)
    })

    it('selects e checkboxes validam no change', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <select name="uf" data-form-v="required"><option value="">-</option><option value="SP">SP</option></select>
            </form>`)
        const select = $(form, 'select')
        select.value = ''
        change(select)
        await flush()
        expect(api.fields.uf.errors[0]).toBe('Selecione uma opção em uf.')
        select.value = 'SP'
        change(select)
        await flush()
        expect(api.fields.uf.errors).toEqual([])
    })

    it('modos por formulário com sobrescrita por grupo e por campo', async () => {
        const { form, api } = await mount(`
            <form x-data x-form data-form-validation="submit" data-form-debounce="0" novalidate>
                <fieldset data-form-validation="input"><input name="a" data-form-v="required|min:2"></fieldset>
                <input name="b" data-form-v="required|min:2">
                <input name="c" data-form-v="required|min:2" data-form-validation="blur">
            </form>`)
        type($(form, '[name=a]'), 'x')
        type($(form, '[name=b]'), 'x')
        type($(form, '[name=c]'), 'x')
        await flush()
        expect(api.fields.a.errors.length).toBe(1)
        expect(api.fields.b.validated).toBe(false)
        expect(api.fields.c.validated).toBe(false)
        blur($(form, '[name=c]'))
        blur($(form, '[name=b]'))
        await flush()
        expect(api.fields.c.errors.length).toBe(1)
        expect(api.fields.b.validated).toBe(false)
    })

    it('composição IME não valida nem altera até compositionend', async () => {
        const { form, api } = await mount(`<form x-data x-form data-form-validation="input" data-form-debounce="0" novalidate><input name="t" data-form-v="min:3"></form>`)
        const input = $(form, 'input')
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        input.value = 'に'
        input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
        await flush()
        expect(api.fields.t.validated).toBe(false)
        input.value = '日本'
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
        await flush()
        expect(api.fields.t.errors).toEqual(['Digite pelo menos 3 caracteres.'])
    })

    it('debounce agrupa digitação', async () => {
        const { form, api } = await mount(`<form x-data x-form data-form-validation="input" data-form-debounce="60" novalidate><input name="t" data-form-v="min:3"></form>`)
        const input = $(form, 'input')
        type(input, 'a')
        type(input, 'ab')
        await tick(10)
        expect(api.fields.t.validated).toBe(false)
        await tick(80)
        expect(api.fields.t.errors.length).toBe(1)
    })
})

describe('mensagens', () => {
    it('precedência: regra no campo > genérica do campo > configurada > padrão', async () => {
        AlpineForm.configure({ messages: { min: 'Config :min.' } })
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input name="a" data-form-v="min:3" data-form-msg.min="Campo :min.">
                <input name="b" data-form-v="min:3" data-form-msg="Genérica.">
                <input name="c" data-form-v="min:3">
                <input name="d" data-form-v="email">
            </form>`)
        for (const name of ['a', 'b', 'c', 'd']) type($(form, `[name=${name}]`), 'x')
        await api.validate()
        expect(api.fields.a.errors[0]).toBe('Campo 3.')
        expect(api.fields.b.errors[0]).toBe('Genérica.')
        expect(api.fields.c.errors[0]).toBe('Config 3.')
        expect(api.fields.d.errors[0]).toBe('Informe um e-mail válido.')
    })

    it('label: data-form-label > label associado > name; :value nunca expõe senha', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <label for="x">Nome completo *</label><input id="x" name="nome" data-form-v="required">
                <input name="apelido" data-form-label="Apelido" data-form-v="required">
                <input name="cidade" data-form-v="required">
                <input name="senha" type="password" data-form-v="min:10" data-form-msg.min="Valor ':value' curto">
                <input name="cor" data-form-v="in:azul" data-form-msg.in="':value' não está em :allowed">
            </form>`)
        type($(form, '[name=senha]'), 'segredo')
        type($(form, '[name=cor]'), 'roxo')
        await api.validate()
        expect(api.fields.nome.errors[0]).toBe('O campo Nome completo é obrigatório.')
        expect(api.fields.apelido.errors[0]).toBe('O campo Apelido é obrigatório.')
        expect(api.fields.cidade.errors[0]).toBe('O campo cidade é obrigatório.')
        expect(api.fields.senha.errors[0]).toBe("Valor '' curto")
        expect(api.fields.senha.value).toBeNull()
        expect(api.fields.cor.errors[0]).toBe("'roxo' não está em azul")
    })

    it('modo "all" coleta todos os erros síncronos', async () => {
        const { form, api } = await mount(`<form x-data x-form data-form-errors="all" novalidate><input name="a" data-form-v="min:5|digits|starts_with:9"></form>`)
        type($(form, 'input'), 'ab')
        await api.validate()
        expect(api.fields.a.errors).toHaveLength(3)
    })

    it('mensagem do servidor/validador é texto puro (sem HTML)', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a"></form>`)
        api.setErrors({ a: '<img src=x onerror=alert(1)>Erro' })
        await flush()
        const err = form.querySelector('.af-error')
        expect(err.querySelector('img')).toBeNull()
        expect(err.textContent).toBe('<img src=x onerror=alert(1)>Erro')
    })
})

describe('erros de configuração', () => {
    it('regra desconhecida bloqueia o campo e o envio, com diagnóstico', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" data-form-v="requried"></form>`)
        expect(api.configErrors[0].message).toMatch(/Você quis dizer "required"/)
        expect(api.fields.a.configError).toMatch(/requried/)
        const result = await api.validate()
        expect(result.valid).toBe(false)
        expect($(form, 'input').getAttribute('aria-invalid')).toBe('true')
        expect(spy).toHaveBeenCalled()
    })

    it('atributo booleano/numero malformado e atributo desconhecido', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { api } = await mount(`
            <form x-data x-form novalidate>
                <input name="a" data-form-v="required" data-form-debounce="rápido">
                <input name="b" data-form-v="required" data-form-show-valid="sim">
                <input name="c" data-form-vv="required">
                <input name="d" data-form-pattern="^a$">
                <input name="e" data-form-mask="cpf">
            </form>`)
        expect(api.fields.a.configError).toMatch(/Duração inválida/)
        expect(api.fields.b.configError).toMatch(/booleano/)
        expect(api.fields.c.configError).toMatch(/desconhecido "data-form-vv"/)
        expect(api.fields.d.configError).toMatch(/sem a regra "pattern"/)
        expect(api.fields.e.configError).toMatch(/módulo de máscaras/)
    })

    it('configuração inválida no <form> impede a inicialização', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { form, api } = await mount(`<form x-data x-form data-form-validation="sempre"><input name="a"></form>`)
        expect(api).toBeNull()
        expect(form.getAttribute('data-form-state')).toBe('config-error')
        expect(spy.mock.calls[0][1]).toMatch(/Valores aceitos: live, input/)
    })

    it('referência a campo inexistente vira erro de configuração ao validar', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" data-form-v="same:fantasma"></form>`)
        type($(form, 'input'), 'x')
        await api.validate()
        expect(api.fields.a.configError).toMatch(/fantasma/)
    })
})

describe('semântica de tipos e vazio', () => {
    it('zero e "0" não são vazios; espaços são', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input name="n" type="number" value="0" data-form-v="required|min:0">
                <input name="s" value="   " data-form-v="required">
                <input name="opt" value="" data-form-v="email|min:5">
            </form>`)
        await api.validate()
        expect(api.fields.n.errors).toEqual([])
        expect(api.fields.s.errors).toEqual(['O campo s é obrigatório.'])
        expect(api.fields.opt.errors).toEqual([])
    })

    it('min/max: valor em numérico, comprimento em texto, quantidade em lista', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input name="idade" type="number" value="150" data-form-v="max:120">
                <input name="nome" value="abcdefghij" data-form-v="max:5">
                <input name="preco" value="9.5" data-form-v="numeric|min:10">
                <select name="tags" multiple data-form-v="min:2"><option selected>a</option><option>b</option></select>
            </form>`)
        await api.validate()
        expect(api.fields.idade.errors[0]).toBe('O valor máximo de idade é 120.')
        expect(api.fields.nome.errors[0]).toBe('Digite no máximo 5 caracteres.')
        expect(api.fields.preco.errors[0]).toBe('O valor mínimo de preco é 10.')
        expect(api.fields.tags.errors[0]).toBe('Selecione pelo menos 2 opções.')
    })

    it('checkbox individual, grupo, radio e accepted', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input type="checkbox" name="termos" value="1" data-form-v="accepted">
                <input type="checkbox" name="cores[]" value="r" data-form-v="required">
                <input type="checkbox" name="cores[]" value="g">
                <input type="radio" name="plano" value="a" data-form-v="required">
                <input type="radio" name="plano" value="b">
            </form>`)
        expect(api.fields.termos.kind).toBe('checkbox')
        expect(api.fields.cores.kind).toBe('checkbox-group')
        expect(api.fields.plano.kind).toBe('radio')
        await api.validate()
        expect(api.fields.termos.errors[0]).toBe('Você precisa aceitar termos.')
        expect(api.fields.cores.errors[0]).toBe('Selecione ao menos uma opção em cores[].')
        expect(api.fields.plano.errors[0]).toBe('Selecione uma opção em plano.')
        form.querySelector('[value=g]').checked = true
        form.querySelector('[value=b]').checked = true
        form.querySelector('[name=termos]').checked = true
        await api.validate()
        expect(api.errors).toEqual({})
        expect(api.getValue('cores')).toEqual(['g'])
        expect(api.getValue('plano')).toBe('b')
        expect(api.getValue('termos')).toBe('1')
    })

    it('desabilitados e readonly', async () => {
        const { api } = await mount(`
            <form x-data x-form novalidate>
                <input name="a" disabled data-form-v="required">
                <fieldset disabled><input name="b" data-form-v="required"></fieldset>
                <input name="c" readonly data-form-v="required">
            </form>`)
        const result = await api.validate()
        expect(result.invalidFields).toEqual(['c'])
    })

    it('hidden só é validado com data-form-v; erro vai ao resumo', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input type="hidden" name="token" value="">
                <input type="hidden" name="id" value="" data-form-v="required" data-form-label="Identificador">
            </form>`)
        await api.submit()
        expect(api.errors).toEqual({ id: ['O campo Identificador é obrigatório.'] })
        expect(form.querySelector('.af-summary').textContent).toContain('O campo Identificador é obrigatório.')
    })

    it('datas estritas com tipos nativos e comparação com outro campo', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input type="date" name="inicio" value="2024-05-10">
                <input type="date" name="fim" value="2024-05-01" data-form-v="after_or_equal:inicio">
                <input name="nasc" value="31/02/2000" data-form-date-format="br" data-form-v="date">
                <input type="time" name="hora" value="08:00" data-form-v="after:09:00">
            </form>`)
        await api.validate()
        expect(api.fields.fim.errors[0]).toBe('fim deve ser igual ou posterior a inicio.')
        expect(api.fields.nasc.errors[0]).toBe('Informe uma data válida em nasc.')
        expect(api.fields.hora.errors[0]).toMatch(/posterior a 09:00/)
    })

    it('decimal com precisão exata', async () => {
        const { api } = await mount(`
            <form x-data x-form novalidate>
                <input name="a" value="0.30" data-form-v="numeric|multiple_of:0.1|max_value:0.3">
                <input name="b" value="10.005" data-form-v="decimal:2">
                <input name="c" value="1,5" data-form-v="numeric">
                <input name="d" value="1.234,56" data-form-normalize="decimal:pt-BR" data-form-v="numeric|min_value:1234.56">
            </form>`)
        await api.validate()
        expect(api.fields.a.errors).toEqual([])
        expect(api.fields.b.errors[0]).toBe('b deve ter no máximo 2 casas decimais.')
        expect(api.fields.c.errors[0]).toBe('Informe um número válido em c.')
        expect(api.fields.d.errors).toEqual([])
        expect(api.getValue('d')).toBe('1234.56')
        expect(api.getValue('d', { as: 'display' })).toBe('1.234,56')
    })

    it('pattern com limite de entrada', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="p" data-form-v="pattern" data-form-pattern="^[A-Z]{3}-\\d{4}$"></form>`)
        type($(form, 'input'), 'ABC-1234')
        expect((await api.validate()).valid).toBe(true)
        type($(form, 'input'), 'abc-1234')
        expect((await api.validate()).valid).toBe(false)
    })
})

describe('dependências entre campos', () => {
    it('revalida dependente já validado quando o campo referenciado muda', async () => {
        const { form, api } = await mount(`
            <form x-data x-form data-form-debounce="0" novalidate>
                <input name="senha" type="password" data-form-v="required">
                <input name="conf" type="password" data-form-v="same:senha">
            </form>`)
        type($(form, '[name=senha]'), 'abc')
        type($(form, '[name=conf]'), 'abc')
        blur($(form, '[name=conf]'))
        await flush()
        expect(api.fields.conf.errors).toEqual([])
        type($(form, '[name=senha]'), 'abcd')
        await flush()
        expect(api.fields.conf.errors[0]).toBe('conf deve ser igual a senha.')
    })

    it('required_if acompanha o controle referenciado', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <select name="tipo"><option value="pf">PF</option><option value="pj">PJ</option></select>
                <input name="cnpj" data-form-v="required_if:tipo,pj">
            </form>`)
        await api.validate()
        expect(api.fields.cnpj.errors).toEqual([])
        const select = $(form, 'select')
        select.value = 'pj'
        change(select)
        await flush()
        expect(api.fields.cnpj.errors[0]).toBe('O campo cnpj é obrigatório.')
    })

    it('ciclos são detectados sem laço infinito', async () => {
        const { form, api } = await mount(`
            <form x-data x-form data-form-debounce="0" novalidate>
                <input name="a" data-form-v="same:b">
                <input name="b" data-form-v="same:a">
            </form>`)
        expect(api.diagnostics().cycles.length).toBeGreaterThan(0)
        await api.validate()
        const spy = vi.fn()
        form.addEventListener('form:validated', spy)
        type($(form, '[name=a]'), 'x')
        await flush()
        expect(spy.mock.calls.length).toBeLessThanOrEqual(3)
    })
})

describe('validação remota e assíncrona', () => {
    it('descarta resposta obsoleta e associa resultado ao valor consultado', async () => {
        const resolvers = []
        AlpineForm.transport('remote', request => new Promise(resolve => resolvers.push({ request, resolve })), { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input name="email" data-form-v="email" data-form-remote="/api/check" data-form-remote-cache="0">
            </form>`)
        const input = $(form, 'input')
        type(input, 'a@a.com')
        const first = api.validateField('email')
        await flush()
        type(input, 'b@b.com')
        const second = api.validateField('email')
        await flush()
        expect(resolvers).toHaveLength(2)
        expect(resolvers[0].request.signal.aborted).toBe(true)
        resolvers[1].resolve(jsonResponse(200, { valid: true }))
        await second
        resolvers[0].resolve(jsonResponse(200, { valid: false, message: 'Obsoleta' }))
        await first
        await flush()
        expect(api.fields.email.errors).toEqual([])
        expect(api.fields.email.remote).toBe('valid')
    })

    it('mensagem do campo prevalece sobre a do servidor; aborto não vira erro', async () => {
        AlpineForm.transport('remote', async () => jsonResponse(200, { valid: false, message: 'Do servidor' }), { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input name="a" data-form-remote="/x" data-form-msg.remote="Do campo">
                <input name="b" data-form-remote="/x">
            </form>`)
        type($(form, '[name=a]'), 'v')
        type($(form, '[name=b]'), 'v')
        await api.validate()
        expect(api.fields.a.errors).toEqual(['Do campo'])
        expect(api.fields.b.errors).toEqual(['Do servidor'])
    })

    it('rede indisponível: inconclusivo (allow) não bloqueia; block bloqueia', async () => {
        AlpineForm.transport('remote', async () => { throw Object.assign(new Error('rede'), { kind: 'network' }) }, { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input name="a" data-form-remote="/x" data-form-remote-inconclusive="allow">
                <input name="b" data-form-remote="/x" data-form-remote-inconclusive="block">
            </form>`)
        type($(form, '[name=a]'), 'v')
        type($(form, '[name=b]'), 'v')
        const result = await api.validate()
        expect(api.fields.a.remote).toBe('inconclusive')
        expect(api.fields.a.errors).toEqual([])
        expect(result.invalidFields).toEqual(['b'])
        expect(form.querySelector('[name=a]').nextElementSibling.textContent).toMatch(/Não foi possível verificar agora/)
    })

    it('cache limitado evita consultas repetidas e pode ser invalidado', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { valid: true }))
        AlpineForm.transport('remote', transport, { replace: true })
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" data-form-remote="/x"></form>`)
        type($(form, 'input'), 'v')
        await api.validateField('a')
        await api.validateField('a')
        expect(transport.calls).toHaveLength(1)
        api.clearRemoteCache('a')
        await api.validateField('a')
        expect(transport.calls).toHaveLength(2)
        expect(transport.calls[0].method).toBe('POST')
        expect(transport.calls[0].body).toContain('a=v')
    })

    it('GET com campo sensível exige decisão explícita', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { api } = await mount(`<form x-data x-form novalidate><input type="password" name="s" data-form-remote="/x" data-form-remote-method="get"></form>`)
        expect(api.fields.s.configError).toMatch(/exporia o valor na URL/)
    })

    it('regra assíncrona registrada recebe signal e respeita ordem', async () => {
        const seen = []
        AlpineForm.validator('lento_teste', {
            async: true,
            async validate(value, ctx) {
                seen.push(value)
                await new Promise(r => setTimeout(r, value === 'primeiro' ? 40 : 5))
                if (ctx.signal.aborted) throw new DOMException('x', 'AbortError')
                return value !== 'primeiro' || 'falhou'
            },
        }, { replace: true })
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" data-form-v="lento_teste"></form>`)
        type($(form, 'input'), 'primeiro')
        const p1 = api.validateField('a')
        type($(form, 'input'), 'segundo')
        const p2 = api.validateField('a')
        await Promise.all([p1, p2])
        expect(seen).toEqual(['primeiro', 'segundo'])
        expect(api.fields.a.errors).toEqual([])
    })
})

describe('acessibilidade', () => {
    it('preserva aria-describedby existente e gera ids únicos entre formulários', async () => {
        const { wrapper } = await mount(`
            <form x-data x-form id="f1" novalidate><input name="a" aria-describedby="dica" data-form-v="required"><span id="dica">Dica</span></form>
            <form x-data x-form id="f2" novalidate><input name="a" data-form-v="required"></form>`)
        await AlpineForm.get('f1').validate()
        await AlpineForm.get('f2').validate()
        const [a1, a2] = wrapper.querySelectorAll('input')
        expect(a1.getAttribute('aria-describedby').split(' ')[0]).toBe('dica')
        const id1 = a1.getAttribute('aria-describedby').split(' ')[1]
        const id2 = a2.getAttribute('aria-describedby')
        expect(id1).not.toBe(id2)
        expect(document.getElementById(id1).textContent).toBe('O campo a é obrigatório.')
        expect(document.getElementById(id1).getAttribute('aria-live')).toBeNull()
    })

    it('destino de erro personalizado', async () => {
        const { api } = await mount(`
            <form x-data x-form novalidate><input name="email" data-form-v="required" data-form-error-target="#erro-email"></form>
            <p id="erro-email"></p>`)
        await api.validate()
        expect(document.getElementById('erro-email').textContent).toBe('O campo email é obrigatório.')
    })

    it('resumo com role=alert e foco no primeiro erro no envio', async () => {
        const { form, api } = await mount(`
            <form x-data x-form data-form-transport="xhr" novalidate>
                <input name="a" data-form-v="required"><input name="b" data-form-v="required">
            </form>`)
        const reveal = vi.fn()
        form.addEventListener('form:reveal', reveal)
        const result = await api.submit()
        await tick(20)
        expect(result.reason).toBe('invalid')
        expect(document.activeElement).toBe(form.querySelector('[name=a]'))
        expect(reveal).toHaveBeenCalledTimes(1)
    })
})
