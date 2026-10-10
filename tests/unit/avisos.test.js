import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, tick, jsonResponse, AlpineForm } from './helpers.js'
import avisosPlugin from '../../src/avisos/index.js'

startAlpine(avisosPlugin)

const avisosNaTela = () => Array.from(document.querySelectorAll('.af-aviso')).map(a => [a.getAttribute('data-tipo'), a.querySelector('.af-aviso-texto').textContent])
const dialogo = () => document.querySelector('dialog.af-confirmar')

function transporte(resposta = () => jsonResponse(200, { success: true, message: 'Cliente salvo.' })) {
    const chamadas = []
    AlpineForm.transport('test', async request => {
        chamadas.push(request)
        return resposta(request)
    }, { replace: true })
    return chamadas
}

afterEach(() => {
    AlpineForm.avisos.limpar()
    dialogo()?.querySelector('.af-confirmar-cancelar')?.click()
    if (AlpineForm.registry.has('transport', 'test')) AlpineForm.registry.unregister('transport', 'test')
    AlpineForm.resetConfig()
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('avisos (toasts)', () => {
    it('mostra por tipo em regiões vivas, texto puro, fecha no botão e some sozinho', async () => {
        vi.useFakeTimers()
        AlpineForm.avisos.sucesso('<b>Salvo</b>')
        AlpineForm.avisos.erro('Falhou')
        AlpineForm.avisos.info('Fixo', { duracao: 0 })
        expect(avisosNaTela()).toEqual([['sucesso', '<b>Salvo</b>'], ['info', 'Fixo'], ['erro', 'Falhou']])
        expect(document.querySelector('.af-aviso b')).toBeNull()
        expect(document.querySelector('[role=alert] .af-aviso--erro')).not.toBeNull()
        expect(document.querySelector('[role=status] .af-aviso--sucesso')).not.toBeNull()
        expect(document.querySelectorAll('.af-avisos [data-form-generated]').length).toBeGreaterThan(5)
        vi.advanceTimersByTime(5100)
        expect(avisosNaTela()).toEqual([['info', 'Fixo'], ['erro', 'Falhou']])
        vi.advanceTimersByTime(3000)
        expect(avisosNaTela()).toEqual([['info', 'Fixo']])
        document.querySelector('.af-aviso-fechar').click()
        expect(avisosNaTela()).toEqual([])
    })

    it('pausa enquanto o mouse está em cima e limita a quantidade na tela', async () => {
        vi.useFakeTimers()
        const id = AlpineForm.avisos.sucesso('Lendo')
        const el = document.getElementById(id)
        el.dispatchEvent(new MouseEvent('mouseenter'))
        vi.advanceTimersByTime(10000)
        expect(document.getElementById(id)).not.toBeNull()
        el.dispatchEvent(new MouseEvent('mouseleave'))
        vi.advanceTimersByTime(6000)
        expect(document.getElementById(id)).toBeNull()
        for (let i = 1; i <= 6; i++) AlpineForm.avisos.info(`Aviso ${i}`)
        expect(avisosNaTela().map(a => a[1])).toEqual(['Aviso 3', 'Aviso 4', 'Aviso 5', 'Aviso 6'])
        expect(() => AlpineForm.avisos.mostrar('x', { tipo: 'roxo' })).toThrow(/Tipo de aviso desconhecido/)
        expect(AlpineForm.avisos.info('')).toBeNull()
    })

    it('data-form-avisos: sucesso com a mensagem do servidor; erro com a mensagem do erro', async () => {
        let falhar = false
        transporte(() => (falhar ? jsonResponse(500, { success: false, message: 'Falha interna simulada.' }) : jsonResponse(200, { success: true, message: 'Cliente salvo.' })))
        const { api } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" data-form-avisos novalidate><input name="nome" value="a"></form>`)
        await api.submit()
        expect(avisosNaTela()).toEqual([['sucesso', 'Cliente salvo.']])
        falhar = true
        await api.submit()
        expect(avisosNaTela().at(-1)).toEqual(['erro', 'Falha interna simulada.'])
    })

    it('data-form-avisos="sucesso" e texto próprio; validação local não gera aviso', async () => {
        transporte(() => jsonResponse(200, { success: true }))
        const { api, form } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" data-form-avisos="sucesso" data-form-aviso-sucesso="Pronto!" novalidate>
            <input name="nome" data-form-v="required"></form>`)
        await api.submit()
        expect(avisosNaTela()).toEqual([])
        form.querySelector('input').value = 'Ana'
        form.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }))
        await api.submit()
        expect(avisosNaTela()).toEqual([['sucesso', 'Pronto!']])
    })
})

describe('confirmação', () => {
    it('data-form-confirmar pergunta só depois de validar; cancelar não envia; confirmar envia', async () => {
        const chamadas = transporte()
        const { api, form } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" data-form-confirmar="Enviar mesmo?" novalidate>
            <input name="nome" data-form-v="required"><button type="submit">Enviar</button></form>`)
        expect((await api.submit()).ok).toBe(false)
        expect(dialogo()).toBeNull()                                  // inválido: nem pergunta
        form.querySelector('input').value = 'Ana'
        form.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }))

        let envio = api.submit()
        await vi.waitFor(() => expect(dialogo()).not.toBeNull())
        expect(dialogo().querySelector('.af-confirmar-texto').textContent).toBe('Enviar mesmo?')
        dialogo().querySelector('.af-confirmar-cancelar').click()
        expect((await envio).ok).toBe(false)
        expect(chamadas).toHaveLength(0)
        expect(dialogo()).toBeNull()

        envio = api.submit()
        await vi.waitFor(() => expect(dialogo()).not.toBeNull())
        dialogo().querySelector('.af-confirmar-ok').click()
        expect((await envio).ok).toBe(true)
        expect(chamadas).toHaveLength(1)
    })

    it('no botão: só esse botão pergunta; perigo foca em Cancelar; Esc cancela; foco volta', async () => {
        const chamadas = transporte()
        const { form } = await mount(`<form x-data x-form action="/x" method="post" data-form-transport="test" novalidate>
            <input name="id" value="7">
            <button type="submit" id="salvar">Salvar</button>
            <button type="submit" id="excluir" name="acao" value="excluir" data-form-confirmar="Excluir o cliente?" data-form-confirmar-titulo="Excluir" data-form-confirmar-ok="Excluir" data-form-confirmar-perigo>Excluir</button>
        </form>`)
        form.querySelector('#salvar').click()
        await vi.waitFor(() => expect(chamadas).toHaveLength(1))
        expect(dialogo()).toBeNull()

        const excluir = form.querySelector('#excluir')
        excluir.focus()
        excluir.click()
        await vi.waitFor(() => expect(dialogo()).not.toBeNull())
        expect(dialogo().classList.contains('af-confirmar--perigo')).toBe(true)
        expect(dialogo().querySelector('h2').textContent).toBe('Excluir')
        expect(dialogo().querySelector('.af-confirmar-ok').textContent).toBe('Excluir')
        expect(document.activeElement).toBe(dialogo().querySelector('.af-confirmar-cancelar'))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flush()
        expect(dialogo()).toBeNull()
        expect(document.activeElement).toBe(excluir)
        expect(chamadas).toHaveLength(1)

        excluir.click()
        await vi.waitFor(() => expect(dialogo()).not.toBeNull())
        dialogo().querySelector('.af-confirmar-ok').click()
        await vi.waitFor(() => expect(chamadas).toHaveLength(2))
        expect(String(chamadas[1].body.get?.('acao') ?? chamadas[1].body)).toContain('excluir')
    })

    it('AlpineForm.avisos.confirmar e $confirmar resolvem true/false; uma pergunta por vez', async () => {
        const p1 = AlpineForm.avisos.confirmar('Primeira?')
        expect(await AlpineForm.avisos.confirmar('Segunda?')).toBe(false)
        dialogo().querySelector('.af-confirmar-ok').click()
        expect(await p1).toBe(true)
        const { wrapper } = await mount(`<div x-data="{ r: null }"><button @click="r = await $confirmar('Ok?')">x</button><span x-text="String(r)"></span></div>`)
        wrapper.querySelector('button').click()
        await vi.waitFor(() => expect(dialogo()).not.toBeNull())
        dialogo().querySelector('.af-confirmar-cancelar').click()
        await vi.waitFor(() => expect(wrapper.querySelector('span').textContent).toBe('false'))
        await tick(0)
    })
})
