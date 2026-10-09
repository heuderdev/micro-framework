/**
 * Algoritmos brasileiros. Validam formato e dígitos verificadores;
 * NÃO comprovam existência, titularidade ou situação cadastral.
 */

export function onlyDigits(value) {
    return String(value ?? '').replace(/\D+/g, '')
}

const CPF_FORMAT = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/

export function isCpf(value) {
    const text = String(value ?? '').trim()
    if (!CPF_FORMAT.test(text)) return false
    const digits = onlyDigits(text)
    if (/^(\d)\1{10}$/.test(digits)) return false
    const calc = length => {
        let sum = 0
        for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i)
        const rest = (sum * 10) % 11
        return rest === 10 ? 0 : rest
    }
    return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10])
}

/**
 * CNPJ numérico e alfanumérico (IN RFB 2.229/2024, emissão a partir de julho/2026):
 * 12 posições [0-9A-Z] + 2 dígitos verificadores numéricos.
 * Valor de cada caractere = código ASCII - 48 (0-9 -> 0-9, A -> 17 ... Z -> 42).
 * Letras minúsculas são aceitas e comparadas como maiúsculas.
 */
const CNPJ_FORMAT = /^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}$/
const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function normalizeCnpj(value) {
    return String(value ?? '').toUpperCase().replace(/[.\-/\s]/g, '')
}

export function cnpjCheckDigits(base12) {
    const values = Array.from(base12, ch => ch.charCodeAt(0) - 48)
    const dv = weights => {
        const sum = weights.reduce((acc, w, i) => acc + values[i] * w, 0)
        const rest = sum % 11
        return rest < 2 ? 0 : 11 - rest
    }
    const d1 = dv(W1)
    values.push(d1)
    const d2 = dv(W2)
    return `${d1}${d2}`
}

export function isCnpj(value, { alphanumeric = true } = {}) {
    const text = String(value ?? '').trim().toUpperCase()
    if (!CNPJ_FORMAT.test(text)) return false
    const clean = normalizeCnpj(text)
    if (!alphanumeric && /[A-Z]/.test(clean)) return false
    if (/^(.)\1{13}$/.test(clean)) return false
    return cnpjCheckDigits(clean.slice(0, 12)) === clean.slice(12)
}

export function isCep(value) {
    return /^\d{5}-?\d{3}$/.test(String(value ?? '').trim())
}

export const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/**
 * Telefone nacional com DDD: fixo (10 dígitos, começa com 2-5) ou celular (11 dígitos, começa com 9).
 * Aceita prefixo +55. Não aceita prefixo de operadora nem 0 de longa distância.
 * Retorna 'celular', 'fixo' ou null.
 */
export function phoneType(value) {
    const text = String(value ?? '').trim()
    if (!/^\+?[\d\s().-]+$/.test(text)) return null
    let digits = onlyDigits(text)
    if (text.startsWith('+')) {
        if (!digits.startsWith('55')) return null
        digits = digits.slice(2)
    } else if (digits.length >= 12 && digits.startsWith('55')) {
        digits = digits.slice(2)
    }
    if (!DDDS.has(Number(digits.slice(0, 2)))) return null
    const local = digits.slice(2)
    if (local.length === 9 && local[0] === '9') return 'celular'
    if (local.length === 8 && /[2-5]/.test(local[0])) return 'fixo'
    return null
}

export function luhn(value) {
    const digits = onlyDigits(value)
    if (digits.length < 12 || digits.length > 19 || /\D/.test(String(value).replace(/[\s-]/g, ''))) return false
    let sum = 0
    let double = false
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = Number(digits[i])
        if (double) {
            n *= 2
            if (n > 9) n -= 9
        }
        sum += n
        double = !double
    }
    return sum % 10 === 0
}
