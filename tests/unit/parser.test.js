import { describe, it, expect } from 'vitest'
import '../../src/index.js'
import { tokenize, parseRules, compilePattern, convertParam } from '../../src/core/rule-parser.js'
import { ConfigError } from '../../src/core/errors.js'

describe('tokenize', () => {
    it('separa regras, nome e parâmetros com espaços removidos', () => {
        expect(tokenize(' required | min: 3 | in:a, b ,c ')).toEqual([
            { name: 'required', args: [], hasParams: false },
            { name: 'min', args: ['3'], hasParams: true },
            { name: 'in', args: ['a', 'b', 'c'], hasParams: true },
        ])
    })

    it('string vazia = sem regras', () => {
        expect(tokenize('')).toEqual([])
        expect(tokenize('   ')).toEqual([])
    })

    it('escapes \\| \\: \\, \\\\', () => {
        expect(tokenize('in:a\\,b,c\\|d,e\\:f,g\\\\h')[0].args).toEqual(['a,b', 'c|d', 'e:f', 'g\\h'])
    })

    it('rejeita escape inválido e barra final', () => {
        expect(() => tokenize('in:a\\x')).toThrow(ConfigError)
        expect(() => tokenize('required\\')).toThrow(/termina/)
    })

    it('rejeita regra vazia', () => {
        expect(() => tokenize('required||min:3')).toThrow(/Regra vazia/)
        expect(() => tokenize('required|')).toThrow(/Regra vazia/)
    })

    it('limita o tamanho total', () => {
        expect(() => tokenize('a'.repeat(2001))).toThrow(/2000/)
    })
})

describe('parseRules', () => {
    it('converte parâmetros pelo tipo declarado', () => {
        const rules = parseRules('required|min:3|file_max:10MB|same:senha|before:today')
        expect(rules.map(r => r.name)).toEqual(['required', 'min', 'file_max', 'same', 'before'])
        expect(rules[1].params).toEqual({ min: '3' })
        expect(rules[2].params.max).toEqual({ bytes: 10_000_000, text: '10 MB' })
        expect(rules[3].refs).toEqual(['senha'])
        expect(rules[4].params.target).toEqual({ keyword: 'today' })
    })

    it('regra desconhecida nunca é ignorada e sugere a correta', () => {
        expect(() => parseRules('requried')).toThrow(/Regra desconhecida "requried"\. Você quis dizer "required"\?/)
    })

    it('regra repetida, parâmetro vazio e parâmetro inválido', () => {
        expect(() => parseRules('required|required')).toThrow(/repetida/)
        expect(() => parseRules('min:')).toThrow(/vazio/)
        expect(() => parseRules('min:abc')).toThrow(/número/)
        expect(() => parseRules('min')).toThrow(/exige 1/)
        expect(() => parseRules('email:strict,loose')).toThrow(/no máximo/)
        expect(() => parseRules('file_max:10M')).toThrow(/Unidade/)
        expect(() => parseRules('length:-1')).toThrow(/inteiro/)
    })

    it('nome de regra inválido', () => {
        expect(() => parseRules('Required')).toThrow(/Nome de regra inválido/)
    })

    it('contradição required + nullable', () => {
        expect(() => parseRules('required|nullable')).toThrow(/contraditória/)
    })

    it('parâmetros variádicos com mínimo', () => {
        expect(parseRules('in:a,b')[0].params.values).toEqual(['a', 'b'])
        expect(() => parseRules('in')).toThrow(/ao menos 1/)
        expect(parseRules('required_if:tipo,pj,pf')[0].params).toEqual({ other: { ref: 'tipo' }, values: ['pj', 'pf'] })
    })

    it('datas: literal, palavra-chave e referência', () => {
        expect(convertParam('date-or-field', '2024-01-31', 'after')).toEqual({ literal: '2024-01-31' })
        expect(convertParam('date-or-field', 'now', 'after')).toEqual({ keyword: 'now' })
        expect(convertParam('date-or-field', 'inicio', 'after')).toEqual({ ref: 'inicio' })
    })

    it('proporção e dimensões', () => {
        expect(convertParam('ratio', '16/9', 'aspect_ratio').value).toBeCloseTo(16 / 9)
        expect(convertParam('dimensions', '800x600', 'dimensions')).toEqual({ width: 800, height: 600, text: '800x600' })
        expect(() => convertParam('ratio', '0', 'aspect_ratio')).toThrow(/positiva/)
    })
})

describe('compilePattern', () => {
    it('compila com flags permitidas', () => {
        expect(compilePattern('^[a-z]+$', 'i').test('ABC')).toBe(true)
    })

    it('rejeita regex inválida, flags proibidas e tamanho excessivo', () => {
        expect(() => compilePattern('([a-z')).toThrow(/inválida/)
        expect(() => compilePattern('a', 'g')).toThrow(/Flags/)
        expect(() => compilePattern('a', 'ii')).toThrow(/Flags/)
        expect(() => compilePattern('a'.repeat(501))).toThrow(/500/)
        expect(() => compilePattern(null)).toThrow(/data-form-pattern/)
    })
})
