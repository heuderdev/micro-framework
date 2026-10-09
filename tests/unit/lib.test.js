import { describe, it, expect } from 'vitest'
import { parseSize, formatBytes } from '../../src/lib/size.js'
import { compareDecimal, isMultipleOf, toFixedScale, parseDecimal } from '../../src/lib/decimal.js'
import { parseByKind, isoWeeksInYear, now } from '../../src/lib/date.js'
import { splitName, nameToKey, setPath, toPlain, normalizeErrorKey } from '../../src/lib/paths.js'
import { isCpf, isCnpj, phoneType, isCep, cnpjCheckDigits, luhn } from '../../src/lib/br.js'
import { isValidCard, detectBrand } from '../../src/lib/cards.js'
import { textLength, isEmptyValue } from '../../src/lib/utils.js'

describe('tamanhos', () => {
    it('MB é decimal e MiB é binário', () => {
        expect(parseSize('10MB')).toBe(10_000_000)
        expect(parseSize('10MiB')).toBe(10_485_760)
        expect(parseSize('1.5 KB')).toBe(1500)
        expect(parseSize('2048')).toBe(2048)
        expect(parseSize('1gb')).toBe(1e9)
    })
    it('unidade ambígua é erro', () => {
        expect(() => parseSize('10M')).toThrow()
        expect(() => parseSize('abc')).toThrow()
    })
    it('formata', () => {
        expect(formatBytes(1_500_000)).toBe('1,5 MB')
        expect(formatBytes(1024, { binary: true })).toBe('1 KiB')
        expect(formatBytes(12)).toBe('12 B')
    })
})

describe('decimal exato', () => {
    it('compara sem ponto flutuante', () => {
        expect(compareDecimal('0.1', '0.10')).toBe(0)
        expect(compareDecimal('0.30000000000000004', '0.3')).toBe(1)
        expect(compareDecimal('-1.5', '-1.49')).toBe(-1)
        expect(compareDecimal('abc', '1')).toBeNull()
        expect(compareDecimal('00012.50', '12.5')).toBe(0)
    })
    it('múltiplo e escala', () => {
        expect(isMultipleOf('0.3', '0.1')).toBe(true)
        expect(isMultipleOf('0.35', '0.1')).toBe(false)
        expect(toFixedScale('12.5', 2)).toBe('12.50')
        expect(toFixedScale('-0.001', 2)).toBe('0.00')
        expect(parseDecimal('1e3')).toBeNull()
    })
})

describe('datas estritas', () => {
    it('rejeita datas inexistentes e formatos ambíguos', () => {
        expect(parseByKind('2024-02-29', 'date')).not.toBeNull()
        expect(parseByKind('2023-02-29', 'date')).toBeNull()
        expect(parseByKind('2024-13-01', 'date')).toBeNull()
        expect(parseByKind('2024-1-1', 'date')).toBeNull()
        expect(parseByKind('01/02/2024', 'date')).toBeNull()
        expect(parseByKind('01/02/2024', 'date', 'br')).toMatchObject({ y: 2024, m: 2, d: 1 })
        expect(parseByKind('2024-03-10T25:00', 'datetime')).toBeNull()
        expect(parseByKind('23:59:59', 'time').key).toBe(86399)
        expect(parseByKind('2024-W53', 'week')).toBeNull()
        expect(parseByKind('2020-W53', 'week')).not.toBeNull()
        expect(isoWeeksInYear(2026)).toBe(53)
    })
    it('today usa o relógio local injetável', () => {
        const fixed = () => new Date(2026, 9, 9, 23, 30)
        expect(now('date', fixed).key).toBe(20261009)
    })
})

describe('nomes e caminhos', () => {
    it('divide nomes com colchetes', () => {
        expect(splitName('itens[0][nome]')).toEqual(['itens', '0', 'nome'])
        expect(splitName('documentos[]')).toEqual(['documentos', ''])
        expect(splitName('usuario.email')).toEqual(['usuario.email'])
        expect(splitName('usuario.email', 'dots')).toEqual(['usuario', 'email'])
        expect(splitName('a[b')).toEqual(['a[b'])
    })
    it('chave canônica', () => {
        expect(nameToKey('itens[0][nome]')).toBe('itens.0.nome')
        expect(nameToKey('documentos[]')).toBe('documentos')
        expect(normalizeErrorKey('jform[title]')).toBe('jform.title')
        expect(normalizeErrorKey('itens.1.nome')).toBe('itens.1.nome')
    })
    it('monta objeto aninhado, arrays com lacunas e repetidos', () => {
        const root = Object.create(null)
        setPath(root, splitName('itens[0][nome]'), 'a', 'itens[0][nome]')
        setPath(root, splitName('itens[2][nome]'), 'c', 'itens[2][nome]')
        setPath(root, splitName('tags[]'), 'x', 'tags[]')
        setPath(root, splitName('tags[]'), 'y', 'tags[]')
        setPath(root, splitName('cor'), 'azul', 'cor')
        setPath(root, splitName('cor'), 'verde', 'cor')
        expect(toPlain(root)).toEqual({ itens: [{ nome: 'a' }, null, { nome: 'c' }], tags: ['x', 'y'], cor: ['azul', 'verde'] })
    })
    it('bloqueia prototype pollution', () => {
        const root = Object.create(null)
        expect(() => setPath(root, splitName('__proto__[x]'), '1', '__proto__[x]')).toThrow(/proibido/)
        expect(() => setPath(root, splitName('a[constructor][prototype]'), '1', 'a')).toThrow(/proibido/)
        expect(({}).x).toBeUndefined()
    })
    it('conflito de estrutura é erro explícito', () => {
        const root = Object.create(null)
        setPath(root, ['a'], '1', 'a')
        expect(() => setPath(root, ['a', 'b'], '2', 'a[b]')).toThrow(/Conflito/)
    })
})

describe('documentos brasileiros', () => {
    it('CPF', () => {
        expect(isCpf('529.982.247-25')).toBe(true)
        expect(isCpf('52998224725')).toBe(true)
        expect(isCpf('529.982.247-24')).toBe(false)
        expect(isCpf('000.000.000-00')).toBe(false)
        expect(isCpf('529.982.24725x')).toBe(false)
    })
    it('CNPJ numérico e alfanumérico', () => {
        expect(isCnpj('11.222.333/0001-81')).toBe(true)
        expect(isCnpj('11222333000181')).toBe(true)
        expect(cnpjCheckDigits('12ABC34501DE')).toBe('35')
        expect(isCnpj('12.ABC.345/01DE-35')).toBe(true)
        expect(isCnpj('12abc34501de35')).toBe(true)
        expect(isCnpj('12.ABC.345/01DE-35', { alphanumeric: false })).toBe(false)
        expect(isCnpj('11.111.111/1111-11')).toBe(false)
    })
    it('CEP e telefone validam formato, não existência', () => {
        expect(isCep('01310-100')).toBe(true)
        expect(isCep('0131010')).toBe(false)
        expect(phoneType('(11) 98765-4321')).toBe('celular')
        expect(phoneType('1133334444')).toBe('fixo')
        expect(phoneType('+55 11 98765-4321')).toBe('celular')
        expect(phoneType('(20) 98765-4321')).toBeNull()
        expect(phoneType('(11) 8765-4321')).toBeNull()
        expect(phoneType('(11) 18765-4321')).toBeNull()
    })
    it('cartões', () => {
        expect(luhn('4111 1111 1111 1111')).toBe(true)
        expect(isValidCard('4111111111111111')).toBe(true)
        expect(isValidCard('378282246310005')).toBe(true)
        expect(isValidCard('4111111111111112')).toBe(false)
        expect(detectBrand('636368')?.name).toBe('elo')
        expect(isValidCard('4111111111111111', ['amex'])).toBe(false)
    })
})

describe('texto', () => {
    it('conta code points e define vazio', () => {
        expect(textLength('😀a')).toBe(2)
        expect(textLength('ação')).toBe(4)
        expect(isEmptyValue('  ')).toBe(true)
        expect(isEmptyValue('0')).toBe(false)
        expect(isEmptyValue(0)).toBe(false)
        expect(isEmptyValue(false)).toBe(false)
        expect(isEmptyValue([])).toBe(true)
        expect(isEmptyValue(null)).toBe(true)
    })
})
