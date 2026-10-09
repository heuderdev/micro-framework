import { describe, it, expect } from 'vitest'
import { BUILTIN_MASKS } from '../../src/masks/definitions.js'
import { compilePattern, formatWithCaret, applySlots } from '../../src/masks/pattern-engine.js'
import { NumericEngine } from '../../src/masks/numeric-engine.js'

const cfg = { locale: 'pt-BR', currency: 'BRL', scale: null, negative: false, maxDigits: 15, pad: null, grouping: null, case: null, cardBrands: null }
const mask = (name, extra = {}) => BUILTIN_MASKS[name]({ ...cfg, ...extra })

describe('motor de padrão', () => {
    it('formata CPF progressivamente sem separador pendente', () => {
        const cpf = mask('cpf')
        expect(cpf.format('123').value).toBe('123')
        expect(cpf.format('1234').value).toBe('123.4')
        expect(cpf.format('12345678909').value).toBe('123.456.789-09')
        expect(cpf.format('123.456.789-09').value).toBe('123.456.789-09')
    })

    it('descarta caracteres inválidos e excesso', () => {
        const cpf = mask('cpf')
        expect(cpf.format('12a3b45678909999').value).toBe('123.456.789-09')
    })

    it('preserva cursor ao digitar no meio', () => {
        const cpf = mask('cpf')
        // "123.456.789" com "0" inserido após o "1" (posição 2 na string bruta digitada)
        const r = cpf.format('1023.456.789', 2)
        expect(r.value).toBe('102.345.678-9')
        expect(r.caret).toBe(2)
    })

    it('cursor após literal inserido automaticamente', () => {
        const cpf = mask('cpf')
        const r = cpf.format('1234', 4)
        expect(r.value).toBe('123.4')
        expect(r.caret).toBe(5)
    })

    it('Backspace sobre literal remove o dígito anterior', () => {
        const cpf = mask('cpf')
        const r = cpf.deleteAcrossLiteral('123.456', 4, 'backward')
        expect(r).toEqual({ value: '12.456', caret: 2 })
        expect(cpf.format(r.value, r.caret)).toEqual({ value: '124.56', caret: 2 })
    })

    it('Delete antes de literal remove o dígito seguinte', () => {
        const cpf = mask('cpf')
        const r = cpf.deleteAcrossLiteral('123.456', 3, 'forward')
        expect(r).toEqual({ value: '123.56', caret: 3 })
    })

    it('Backspace em dígito comum é deixado ao navegador', () => {
        expect(mask('cpf').deleteAcrossLiteral('123.4', 5, 'backward')).toBeNull()
    })

    it('escape de token literal no padrão', () => {
        const compiled = compilePattern('\\A-999')
        expect(applySlots('123', compiled).formatted).toBe('A-123')
    })

    it('padrão personalizado com caixa alta', () => {
        const m = mask('pattern', { pattern: 'AAA-9999', case: 'upper' })
        expect(m.format('abc1234').value).toBe('ABC-1234')
        expect(m.represent('ABC-1234')).toEqual({ raw: 'ABC1234', formatted: 'ABC-1234', canonical: 'ABC1234' })
    })

    it('rejeita padrão sem tokens', () => {
        expect(() => compilePattern('---')).toThrow(/token/)
    })

    it('mapeia cursor com formatWithCaret no fim', () => {
        const compiled = compilePattern('(99) 99999-9999')
        const r = formatWithCaret('11987654321', 11, compiled)
        expect(r.formatted).toBe('(11) 98765-4321')
        expect(r.caret).toBe(r.formatted.length)
    })
})

describe('máscaras dinâmicas', () => {
    it('CPF -> CNPJ conforme quantidade de dígitos', () => {
        const m = mask('cpf_cnpj')
        expect(m.format('12345678901').value).toBe('123.456.789-01')
        expect(m.format('123456789012').value).toBe('12.345.678/9012')
        expect(m.format('11222333000181').value).toBe('11.222.333/0001-81')
        expect(m.format('112223330001').value).toBe('11.222.333/0001')
    })

    it('CNPJ alfanumérico converte para maiúsculas', () => {
        const m = mask('cpf_cnpj')
        expect(m.format('12abc34501de35').value).toBe('12.ABC.345/01DE-35')
        expect(m.represent('12.ABC.345/01DE-35').raw).toBe('12ABC34501DE35')
    })

    it('telefone fixo/celular', () => {
        const m = mask('telefone_br')
        expect(m.format('1133334444').value).toBe('(11) 3333-4444')
        expect(m.format('11987654321').value).toBe('(11) 98765-4321')
        expect(m.represent('(11) 98765-4321').raw).toBe('11987654321')
    })

    it('colagem formatada e bruta produzem o mesmo resultado', () => {
        const m = mask('telefone_br')
        expect(m.format('(11) 98765-4321').value).toBe(m.format('11987654321').value)
        const cep = mask('cep')
        expect(cep.format('01310-100').value).toBe('01310-100')
        expect(cep.format('01310100').value).toBe('01310-100')
    })

    it('cartão usa agrupamento da bandeira', () => {
        const m = mask('card')
        expect(m.format('378282246310005').value).toBe('3782 822463 10005')
        expect(m.format('4111111111111111').value).toBe('4111 1111 1111 1111')
        expect(m.brand('3782')).toBe('amex')
    })

    it('data canônica ISO somente quando existe no calendário', () => {
        const m = mask('date')
        expect(m.represent('31/12/2024').canonical).toBe('2024-12-31')
        expect(m.represent('31/02/2024').canonical).toBe('31/02/2024')
        expect(m.represent('12/0').canonical).toBe('12/0')
        expect(m.fromValue('2024-01-05', 'canonical')).toBe('05/01/2024')
    })

    it('zeros iniciais em máscaras de documento são preservados', () => {
        expect(mask('cpf').format('00012345678').value).toBe('000.123.456-78')
    })
})

describe('motor numérico', () => {
    it('moeda pt-BR', () => {
        const m = mask('currency')
        expect(m.format('123456').value).toBe('R$ 123.456')
        expect(m.format('1234,5').value).toBe('R$ 1.234,5')
        expect(m.represent('R$ 1.234,5')).toEqual({ raw: '12345', formatted: 'R$ 1.234,5', canonical: '1234.50' })
        expect(m.onBlur('R$ 1.234,5')).toBe('R$ 1.234,50')
        expect(m.fromValue('1234.56', 'canonical')).toBe('R$ 1.234,56')
    })

    it('casas além da escala são descartadas sem arredondar', () => {
        const m = mask('currency')
        expect(m.represent('1,999').canonical).toBe('1.99')
    })

    it('ponto em colagem: decimal canônico vs milhar', () => {
        const m = mask('currency')
        expect(m.format('1234.56', null, { paste: true }).value).toBe('R$ 1.234,56')
        expect(m.format('1.234', null, { paste: true }).value).toBe('R$ 1.234')
        expect(m.format('1234.56', null, { paste: false }).value).toBe('R$ 123.456')
    })

    it('zeros à esquerda e vírgula inicial', () => {
        const m = mask('decimal')
        expect(m.format('007').value).toBe('7')
        expect(m.format(',5').value).toBe('0,5')
        expect(m.represent('0,5').canonical).toBe('0.50')
    })

    it('negativos somente quando permitidos', () => {
        expect(mask('decimal').format('-12').value).toBe('12')
        const neg = mask('decimal', { negative: true })
        expect(neg.format('-12,3').value).toBe('-12,3')
        expect(neg.represent('-12,3').canonical).toBe('-12.30')
        expect(neg.format('-').value).toBe('-')
        expect(neg.represent('-0,00').canonical).toBe('0.00')
    })

    it('Backspace sobre separador de milhar remove o dígito anterior', () => {
        const m = mask('integer')
        const r = m.deleteAcrossLiteral('1.234', 2, 'backward')
        expect(r).toEqual({ value: '.234', caret: 0 })
        expect(m.format(r.value, r.caret).value).toBe('234')
    })

    it('cursor preservado na edição do meio (moeda)', () => {
        const m = mask('currency')
        // valor "R$ 1.234" e usuário insere "5" após "1" -> "R$ 15.234"
        const input = 'R$ 15.234'
        const r = m.format(input, 5)
        expect(r.value).toBe('R$ 15.234')
        expect(r.caret).toBe(5)
    })

    it('percentual com sufixo', () => {
        const m = mask('percent')
        expect(m.format('12,5').value).toBe('12,5%')
        expect(m.represent('12,5%').canonical).toBe('12.50')
        expect(m.format('12,5', 4).caret).toBe(4)
    })

    it('escala zero para inteiro e limite de dígitos', () => {
        const engine = new NumericEngine({ style: 'integer', scale: 0, maxDigits: 4 })
        expect(engine.format('123456').value).toBe('1.234')
    })
})
