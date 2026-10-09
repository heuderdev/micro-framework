import { ConfigError } from '../core/errors.js'

const UNITS = {
    b: 1,
    kb: 1e3,
    mb: 1e6,
    gb: 1e9,
    tb: 1e12,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
}

const SIZE_RE = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i

/**
 * Converte "10MB", "1.5 MiB", "512KB" ou "2048" em bytes inteiros.
 * KB/MB/GB/TB são decimais (SI, 1000); KiB/MiB/GiB/TiB são binários (1024).
 * Sem unidade: bytes. Unidades ambíguas (K, M, G) geram ConfigError.
 */
export function parseSize(input) {
    const text = String(input ?? '').trim()
    const match = SIZE_RE.exec(text)
    if (!match) throw new ConfigError(`Tamanho inválido: "${text}". Use, por exemplo, 500KB, 10MB ou 2MiB.`)
    const unit = (match[2] || 'b').toLowerCase()
    const factor = UNITS[unit]
    if (!factor) {
        throw new ConfigError(`Unidade de tamanho "${match[2]}" não reconhecida em "${text}". Use B, KB, MB, GB, KiB, MiB ou GiB.`)
    }
    const bytes = Math.floor(Number(match[1]) * factor)
    if (!Number.isSafeInteger(bytes)) throw new ConfigError(`Tamanho fora do limite suportado: "${text}".`)
    return bytes
}

export function isBinaryUnit(input) {
    return /i\s*b$/i.test(String(input ?? '').trim())
}

const DECIMAL_STEPS = [['TB', 1e12], ['GB', 1e9], ['MB', 1e6], ['KB', 1e3]]
const BINARY_STEPS = [['TiB', 1024 ** 4], ['GiB', 1024 ** 3], ['MiB', 1024 ** 2], ['KiB', 1024]]

export function formatBytes(bytes, { binary = false, locale = 'pt-BR', maxFractionDigits = 1 } = {}) {
    if (!Number.isFinite(bytes)) return ''
    const steps = binary ? BINARY_STEPS : DECIMAL_STEPS
    const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits })
    for (const [unit, size] of steps) {
        if (Math.abs(bytes) >= size) return `${fmt.format(bytes / size)} ${unit}`
    }
    return `${fmt.format(bytes)} B`
}
