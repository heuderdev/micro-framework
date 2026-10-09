import { luhn } from './br.js'

/**
 * Tabela de bandeiras (prefixos IIN/BIN públicos). A ordem importa: bandeiras com prefixos
 * mais específicos (Elo, Hipercard) vêm antes de Visa/Discover, que compartilham faixas.
 * gaps = tamanhos dos grupos exibidos; lengths = comprimentos válidos.
 */
export const CARD_BRANDS = [
    {
        name: 'elo',
        prefix: /^(4011(78|79)|43(1274|8935)|45(1416|7393|763[12])|50(4175|6699|67[0-7]\d|9000)|627780|63(6297|6368)|650(0(3[1-9]|[4-9]\d)|4([0-3]\d|8[5-9]|9\d)|5\d\d|9([0-2]\d|3[0-8]))|65(1652|5(0\d|1\d|2[01])))/,
        lengths: [16],
        gaps: [4, 4, 4, 4],
    },
    { name: 'hipercard', prefix: /^(606282|3841)/, lengths: [16, 19], gaps: [4, 4, 4, 4, 3] },
    { name: 'amex', prefix: /^3[47]/, lengths: [15], gaps: [4, 6, 5] },
    { name: 'diners', prefix: /^3(0[0-5]|[689])/, lengths: [14, 16, 19], gaps: [4, 6, 4, 5] },
    { name: 'jcb', prefix: /^35(2[89]|[3-8])/, lengths: [16, 17, 18, 19], gaps: [4, 4, 4, 4, 3] },
    { name: 'mastercard', prefix: /^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/, lengths: [16], gaps: [4, 4, 4, 4] },
    { name: 'discover', prefix: /^(6011|65|64[4-9])/, lengths: [16, 17, 18, 19], gaps: [4, 4, 4, 4, 3] },
    { name: 'visa', prefix: /^4/, lengths: [13, 16, 19], gaps: [4, 4, 4, 4, 3] },
]

export const GENERIC_CARD = { name: null, lengths: [12, 13, 14, 15, 16, 17, 18, 19], gaps: [4, 4, 4, 4, 3] }

export function detectBrand(digits, allowed = null) {
    for (const brand of CARD_BRANDS) {
        if (allowed && !allowed.includes(brand.name)) continue
        if (brand.prefix.test(digits)) return brand
    }
    return null
}

export function isValidCard(value, allowed = null) {
    const digits = String(value ?? '').replace(/[\s-]/g, '')
    if (!/^\d+$/.test(digits)) return false
    const brand = detectBrand(digits, allowed)
    if (allowed && !brand) return false
    const lengths = brand ? brand.lengths : GENERIC_CARD.lengths
    return lengths.includes(digits.length) && luhn(digits)
}
