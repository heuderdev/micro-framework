import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, type, flush, tick, fakeTransport, jsonResponse, textResponse, AlpineForm } from './helpers.js'
import { OperationalError, AbortError } from '../../src/core/errors.js'

startAlpine()

afterEach(() => {
    AlpineForm.registry.unregister('transport', 'test')
    AlpineForm.registry.unregister('transport', 'job')
})

function useTransport(handler) {
    const transport = fakeTransport(handler)
    AlpineForm.transport('test', transport, { replace: true })
    return transport
}

const entries = body => Array.from(body.entries()).map(([k, v]) => [k, v instanceof File ? `file:${v.name}` : v])

describe('serialização', () => {
    it('segue a ordem do HTML, preserva nomes repetidos, submitter e ignora desabilitados/desmarcados', async () => {
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { form, api } = await mount(`
            <form x-data x-form action="/api/x" method="post" data-form-transport="test" novalidate>
                <input name="tag" value="a"><input name="tag" value="b">
                <input name="off" value="x" disabled>
                <input type="checkbox" name="c1" value="1">
                <input type="checkbox" name="c2" value="2" checked>
                <select name="m[]" multiple><option selected>x</option><option>y</option><option selected disabled>z</option></select>
                <textarea name="obs">linha</textarea>
                <input name="semnome-ignorado" data-form-ignore value="i">
                <button type="submit" name="acao" value="salvar">Salvar</button>
                <button type="submit" name="acao" value="publicar" id="pub">Publicar</button>
            </form>`)
        await api.submit({ submitter: form.querySelector('#pub') })
        expect(entries(transport.calls[0].body)).toEqual([
            ['tag', 'a'], ['tag', 'b'], ['c2', '2'], ['m[]', 'x'], ['obs', 'linha'], ['semnome-ignorado', 'i'], ['acao', 'publicar'],
        ])
        expect(api.fields['tag.0']).toBeTruthy()
        expect(api.fields['tag.1']).toBeTruthy()
    })

    it('submitter com formaction/formmethod e Content-Type multipart não é definido manualmente', async () => {
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { form, api } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-transport="test" novalidate>
                <input name="x" value="1">
                <button id="b" formaction="/outra" formmethod="put">Enviar</button>
            </form>`)
        await api.submit({ submitter: form.querySelector('#b') })
        const request = transport.calls[0]
        expect(request.url).toMatch(/\/outra$/)
        expect(request.method).toBe('PUT')
        expect(Object.keys(request.headers).map(h => h.toLowerCase())).not.toContain('content-type')
        expect(request.headers['X-Requested-With']).toBe('XMLHttpRequest')
    })

    it('controles associados pelo atributo form fora da árvore', async () => {
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { api, wrapper } = await mount(`
            <form x-data x-form id="ext" action="/a" method="post" data-form-transport="test" novalidate><input name="dentro" value="1"></form>
            <input form="ext" name="fora" data-form-v="required">`)
        expect(api.fields.fora).toBeTruthy()
        const result = await api.submit()
        expect(result.reason).toBe('invalid')
        const fora = wrapper.querySelector('[name=fora]')
        fora.value = 'ok'
        fora.dispatchEvent(new InputEvent('input', { bubbles: true }))
        await api.submit()
        expect(entries(transport.calls[0].body)).toEqual([['dentro', '1'], ['fora', 'ok']])
    })

    it('JSON aninhado com política explícita e arquivos tratados explicitamente', async () => {
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { api } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-encoding="json" data-form-transport="test" novalidate>
                <input name="itens[0][nome]" value="a"><input name="itens[1][nome]" value="b">
                <input name="usuario.email" value="e@x"><input name="docs[]" value="1"><input name="docs[]" value="2">
            </form>`)
        await api.submit()
        expect(JSON.parse(transport.calls[0].body)).toEqual({ itens: [{ nome: 'a' }, { nome: 'b' }], 'usuario.email': 'e@x', docs: ['1', '2'] })
        expect(transport.calls[0].headers['Content-Type']).toBe('application/json')

        const { api: withFile, form } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-encoding="json" data-form-transport="test" novalidate>
                <input type="file" name="arq">
            </form>`)
        withFile.addFiles('arq', [new File(['x'], 'a.txt')])
        const result = await withFile.submit()
        expect(result.reason).toBe('serialization')
        expect(form.querySelector('.af-summary').textContent).toMatch(/contém arquivo/)
    })

    it('JSON rejeita nomes perigosos (prototype pollution)', async () => {
        useTransport(() => jsonResponse(200, { success: true }))
        const { api } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-encoding="json" data-form-transport="test" novalidate>
                <input name="__proto__[admin]" value="1">
            </form>`)
        const result = await api.submit()
        expect(result.reason).toBe('serialization')
        expect(({}).admin).toBeUndefined()
    })

    it('GET coloca os dados na query string', async () => {
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { api } = await mount(`<form x-data x-form action="/busca?antigo=1" method="get" data-form-transport="test" novalidate><input name="q" value="a b"></form>`)
        await api.submit()
        expect(transport.calls[0].url).toMatch(/\/busca\?q=a\+b$/)
        expect(transport.calls[0].body).toBeNull()
    })

    it('CSRF da meta tag só para a mesma origem; cabeçalhos por atributo', async () => {
        document.head.innerHTML = '<meta name="csrf-token" content="tok123">'
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" data-form-header.X-Tenant="acme" novalidate><input name="a" value="1"></form>`)
        await api.submit()
        expect(transport.calls[0].headers['X-CSRF-TOKEN']).toBe('tok123')
        expect(transport.calls[0].headers['x-tenant']).toBe('acme')
        const { api: cross } = await mount(`<form x-data x-form action="https://outro.exemplo/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
        await cross.submit()
        expect(transport.calls[1].headers['X-CSRF-TOKEN']).toBeUndefined()
    })
})

describe('respostas', () => {
    it('HTTP 200 com success:false não é sucesso; erro sem campo vai ao resumo', async () => {
        useTransport(() => jsonResponse(200, { success: false, mensagem: 'Recusado.', errors: { nome: 'Nome reservado.', fantasma: ['Sem campo.'] } }))
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="nome" value="x"></form>`)
        const success = vi.fn()
        form.addEventListener('form:success', success)
        const result = await api.submit()
        expect(result.ok).toBe(false)
        expect(success).not.toHaveBeenCalled()
        expect(api.fields.nome.serverErrors).toEqual(['Nome reservado.'])
        expect(api.generalErrors).toEqual(['Recusado.', 'Sem campo.'])
        expect(form.querySelector('.af-summary').textContent).toContain('Sem campo.')
        expect(api.phase).toBe('error')
    })

    it('204 é sucesso sem dados', async () => {
        useTransport(() => ({ status: 204, statusText: '', url: '', redirected: false, headers: { get: () => null }, text: '' }))
        const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
        const result = await api.submit()
        expect(result.ok).toBe(true)
        expect(api.result.data).toBeNull()
        expect(api.phase).toBe('success')
    })

    it('HTML inesperado gera diagnóstico (possível login)', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        useTransport(() => textResponse(200, '<html><form><input type="password"></form></html>'))
        const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
        const result = await api.submit()
        expect(result.ok).toBe(false)
        expect(api.error.kind).toBe('html')
        expect(api.error.diagnostic.looksLikeLogin).toBe(true)
        expect(api.error.message).toMatch(/página HTML/)
    })

    it('422 associa erros por caminho, arrays e arquivo individual', async () => {
        useTransport(() => jsonResponse(422, { message: 'Confira.', errors: { 'itens.1.nome': ['Inválido.'], 'docs.1': 'Arquivo ruim.', 'cores': 'Escolha outra.' } }))
        const { api, form } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-transport="test" novalidate>
                <input name="itens[0][nome]" value="a"><input name="itens[1][nome]" value="b">
                <input type="file" name="docs[]" multiple>
                <input type="checkbox" name="cores[]" value="r" checked>
                <div data-form-file-list="docs[]"></div>
            </form>`)
        api.addFiles('docs', [new File(['1'], 'um.pdf'), new File(['2'], 'dois.pdf')])
        await api.submit()
        expect(api.fields['itens.1.nome'].serverErrors).toEqual(['Inválido.'])
        expect(api.fields.docs.serverErrors).toEqual(['dois.pdf: Arquivo ruim.'])
        expect(api.fields.docs.files[1].errors).toEqual(['Arquivo ruim.'])
        expect(api.fields.cores.serverErrors).toEqual(['Escolha outra.'])
        expect(form.querySelectorAll('.af-file--invalid')).toHaveLength(1)
    })

    it('erro do servidor some quando o campo muda; resposta antiga não se aplica a valor novo', async () => {
        let release
        useTransport(() => new Promise(resolve => {
            release = () => resolve(jsonResponse(422, { errors: { a: 'Erro do servidor.' } }))
        }))
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"><input name="b" value="2"></form>`)
        const pending = api.submit()
        await flush()
        type(form.querySelector('[name=a]'), 'mudou')
        release()
        await pending
        expect(api.fields.a.serverErrors).toEqual([])
        api.setErrors({ b: 'Erro b' })
        expect(api.fields.b.errors).toEqual(['Erro b'])
        type(form.querySelector('[name=b]'), 'novo')
        await flush()
        expect(api.fields.b.errors).toEqual([])
    })

    it('status HTTP mapeados para mensagens', async () => {
        const cases = [[401, 'auth'], [403, 'forbidden'], [419, 'csrf'], [413, 'too_large'], [429, 'rate_limited'], [503, 'server'], [404, 'http']]
        for (const [status, kind] of cases) {
            useTransport(() => jsonResponse(status, {}, status === 429 ? { 'retry-after': '30' } : {}))
            const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
            await api.submit()
            expect(api.error.kind).toBe(kind)
            expect(api.generalErrors.length).toBe(1)
        }
    })

    it('adaptadores Laravel e Joomla', async () => {
        useTransport(() => jsonResponse(422, { message: 'The given data was invalid.', errors: { email: ['Em uso.'] } }))
        const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" data-form-response-adapter="laravel" novalidate><input name="email" value="x"></form>`)
        await api.submit()
        expect(api.fields.email.serverErrors).toEqual(['Em uso.'])
        expect(api.generalErrors).toEqual([])

        useTransport(() => jsonResponse(200, { success: false, message: 'Falhou.', messages: { error: ['Token inválido.'] }, data: { errors: { 'jform[title]': 'Título obrigatório.' } } }))
        const { api: joomla } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" data-form-response-adapter="joomla" novalidate><input name="jform[title]" value=""></form>`)
        await joomla.submit()
        expect(joomla.fields['jform.title'].serverErrors).toEqual(['Título obrigatório.'])
        expect(joomla.generalErrors).toEqual(['Falhou.', 'Token inválido.'])
    })

    it('redirecionamento somente para origem permitida', async () => {
        const assign = vi.fn()
        const original = window.location
        Object.defineProperty(window, 'location', { configurable: true, value: { ...original, href: original.href, origin: original.origin, assign } })
        try {
            useTransport(() => jsonResponse(200, { success: true, redirect: 'https://malicioso.exemplo/' }))
            const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" data-form-redirect="response" novalidate><input name="a" value="1"></form>`)
            vi.spyOn(console, 'warn').mockImplementation(() => {})
            await api.submit()
            expect(assign).not.toHaveBeenCalled()
            useTransport(() => jsonResponse(200, { success: true, redirect: '/painel' }))
            await api.submit()
            expect(assign).toHaveBeenCalledWith(`${original.origin}/painel`)
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: original })
        }
    })
})

describe('ciclo de envio', () => {
    it('prevenção de envio duplicado: a mesma Promise é devolvida', async () => {
        let release
        const transport = useTransport(() => new Promise(resolve => { release = () => resolve(jsonResponse(200, { success: true })) }))
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"><button>OK</button></form>`)
        const p1 = api.submit()
        const p2 = api.submit()
        form.querySelector('button').click()
        form.requestSubmit?.()
        expect(p1).toBe(p2)
        await flush()
        release()
        await p1
        expect(transport.calls).toHaveLength(1)
    })

    it('fases: validating -> uploading -> awaiting -> success, com progresso real e indeterminado', async () => {
        useTransport(async request => {
            request.onUploadProgress({ loaded: 0, total: 1000, lengthComputable: true })
            request.onUploadProgress({ loaded: 500, total: 1000, lengthComputable: true })
            request.onUploadComplete()
            await tick(5)
            return jsonResponse(200, { success: true })
        })
        const { form, api } = await mount(`
            <form x-data x-form action="/a" method="post" data-form-transport="test" novalidate>
                <input name="a" value="1">
                <div data-form-progress><div data-form-progress-bar></div><span data-form-progress-percent></span><span data-form-status></span></div>
            </form>`)
        const phases = []
        const progress = []
        form.addEventListener('form:validating', () => phases.push('validating-field'))
        form.addEventListener('form:progress', e => progress.push(e.detail.percent))
        form.addEventListener('form:uploaded', () => phases.push(api.phase))
        form.addEventListener('form:success', () => phases.push(api.phase))
        await api.submit()
        expect(progress).toContain(50)
        expect(phases).toEqual(['validating-field', 'awaiting', 'success'])
        expect(api.progress.uploaded).toBe(true)
        const bar = form.querySelector('[data-form-progress-bar]')
        expect(bar.getAttribute('role')).toBe('progressbar')
        expect(form.querySelector('[data-form-progress]').getAttribute('data-form-state')).toBe('success')
        expect(form.querySelector('[data-form-status]').getAttribute('role')).toBe('status')

        useTransport(async request => {
            request.onUploadProgress({ loaded: 0, total: null, lengthComputable: false })
            expect(api2.progress.indeterminate).toBe(true)
            return jsonResponse(200, { success: true })
        })
        const { api: api2, form: form2 } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"><div data-form-progress-bar></div></form>`)
        await api2.submit()
        expect(form2.querySelector('[data-form-progress-bar]').hasAttribute('aria-valuenow')).toBe(false)
    })

    it('cancelamento aborta o transporte e não é tratado como erro de preenchimento', async () => {
        useTransport(request => new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new AbortError()))))
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"><button type="button" data-form-cancel>Cancelar</button></form>`)
        const cancel = vi.fn()
        form.addEventListener('form:cancel', cancel)
        const pending = api.submit()
        await flush()
        expect(api.uploading).toBe(true)
        form.querySelector('[data-form-cancel]').click()
        const result = await pending
        expect(result.reason).toBe('canceled')
        expect(api.phase).toBe('canceled')
        expect(api.errors).toEqual({})
        expect(cancel).toHaveBeenCalled()
    })

    it('timeout após upload completo = resultado desconhecido, sem reenvio automático', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const transport = useTransport(async request => {
            request.onUploadComplete()
            throw new OperationalError('Tempo', { kind: 'timeout', uploadComplete: true })
        })
        const { api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" data-form-timeout="1s" novalidate><input name="a" value="1"></form>`)
        await api.submit()
        expect(transport.calls).toHaveLength(1)
        expect(transport.calls[0].timeout).toBe(1000)
        expect(api.error.kind).toBe('unknown')
        expect(api.error.message).toMatch(/Não é possível confirmar/)
    })

    it('Idempotency-Key reutilizada somente quando o resultado foi desconhecido e os dados não mudaram', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        let mode = 'network'
        const transport = useTransport(async () => {
            if (mode === 'network') throw new OperationalError('rede', { kind: 'network', uploadComplete: true })
            return jsonResponse(200, { success: true })
        })
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" data-form-idempotency novalidate><input name="a" value="1"></form>`)
        await api.submit()
        await api.submit()
        expect(transport.calls[0].headers['Idempotency-Key']).toBe(transport.calls[1].headers['Idempotency-Key'])
        mode = 'ok'
        type(form.querySelector('input'), '2')
        await api.submit()
        expect(transport.calls[2].headers['Idempotency-Key']).not.toBe(transport.calls[1].headers['Idempotency-Key'])
    })

    it('form:before-submit cancelável e hooks', async () => {
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="1"></form>`)
        form.addEventListener('form:before-submit', e => e.preventDefault(), { once: true })
        expect((await api.submit()).reason).toBe('prevented')
        form.addEventListener('form:submit', e => { e.detail.request.headers['X-Extra'] = 'sim' }, { once: true })
        await api.submit()
        expect(transport.calls).toHaveLength(1)
        expect(transport.calls[0].headers['X-Extra']).toBe('sim')
    })

    it('valores alterados durante validação assíncrona forçam revalidação antes de enviar', async () => {
        let input
        AlpineForm.validator('muda_valor', {
            async: true,
            async validate() {
                if (input.value === 'v1') {
                    input.value = 'v2'
                    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
                }
                return true
            },
        }, { replace: true })
        const transport = useTransport(() => jsonResponse(200, { success: true }))
        const { form, api } = await mount(`<form x-data x-form action="/a" method="post" data-form-transport="test" novalidate><input name="a" value="v1" data-form-v="muda_valor"></form>`)
        input = form.querySelector('input')
        await api.submit()
        expect(entries(transport.calls[0].body)).toEqual([['a', 'v2']])
    })

    it('eventos não expõem senha', async () => {
        useTransport(() => jsonResponse(200, { success: true }))
        const { form } = await mount(`<form x-data x-form novalidate><input type="password" name="s"></form>`)
        const details = []
        form.addEventListener('form:change', e => details.push(e.detail))
        type(form.querySelector('input'), 'segredo')
        await flush()
        expect(details[0].value).toBeUndefined()
        expect(JSON.stringify(details)).not.toContain('segredo')
    })
})

describe('reset e destroy', () => {
    it('reset restaura valores, limpa estado e erros', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" value="inicial" data-form-v="min:20"></form>`)
        type(form.querySelector('input'), 'mudado')
        await api.validate()
        expect(api.dirty).toBe(true)
        expect(api.errors.a).toBeTruthy()
        api.reset()
        expect(form.querySelector('input').value).toBe('inicial')
        expect(api.dirty).toBe(false)
        expect(api.errors).toEqual({})
        expect(api.fields.a.validated).toBe(false)
        expect(form.querySelector('.af-error').hidden).toBe(true)
    })

    it('reset nativo (botão) também limpa o estado', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" value="x" data-form-v="min:5"><button type="reset">Limpar</button></form>`)
        await api.validate()
        form.querySelector('button').click()
        await tick(5)
        expect(api.errors).toEqual({})
    })

    it('destroy remove listeners, elementos gerados e atributos ARIA adicionados', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input name="a" aria-describedby="x" data-form-v="required"></form>`)
        await api.validate()
        const input = form.querySelector('input')
        expect(input.getAttribute('aria-invalid')).toBe('true')
        const destroyed = vi.fn()
        form.addEventListener('form:destroy', destroyed)
        api.destroy()
        expect(destroyed).toHaveBeenCalled()
        expect(form.querySelector('[data-form-generated]')).toBeNull()
        expect(input.getAttribute('aria-describedby')).toBe('x')
        expect(input.hasAttribute('aria-invalid')).toBe(false)
        expect(AlpineForm.get(form)).toBeNull()
        type(input, 'y')
        await flush()
    })

    it('remover o form do DOM destrói o controlador (cleanup do Alpine)', async () => {
        const { form, wrapper } = await mount(`<div x-data="{ show: true }"><template x-if="show"><form x-form novalidate><input name="a"></form></template><button @click="show = false">x</button></div>`)
        const realForm = wrapper.querySelector('form')
        expect(AlpineForm.get(realForm)).toBeTruthy()
        wrapper.querySelector('button').click()
        await flush()
        expect(AlpineForm.get(realForm)).toBeNull()
        expect(form.isConnected).toBe(false)
    })

    it('inicialização duplicada é evitada', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { form } = await mount(`<form x-data x-form novalidate><input name="a"></form>`)
        expect(() => AlpineForm.attach(form)).toThrow(/já foi inicializado/)
        warn.mockRestore()
    })

    it('formulário aninhado gera diagnóstico e não é suportado', async () => {
        const outer = document.createElement('form')
        const inner = document.createElement('form')
        outer.appendChild(inner)
        document.body.appendChild(outer)
        expect(() => AlpineForm.attach(inner)).toThrow(/aninhado/)
    })
})
