import { OperationalError, ConfigError } from '../core/errors.js'
import { parseSize } from '../lib/size.js'

/**
 * Parser CSV (RFC 4180): aspas, aspas duplicadas escapadas (""), quebras de linha dentro de aspas,
 * CRLF/LF/CR. Retorna registros e se o texto terminou dentro de aspas (registro incompleto).
 */
export function parseCsv(text, delimiter = ',') {
    const records = []
    let record = []
    let field = ''
    let inQuotes = false
    let i = 0
    let fieldStarted = false
    while (i < text.length) {
        const ch = text[i]
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"'
                    i += 2
                    continue
                }
                inQuotes = false
                i += 1
                continue
            }
            field += ch
            i += 1
            continue
        }
        if (ch === '"' && !fieldStarted) {
            inQuotes = true
            fieldStarted = true
            i += 1
            continue
        }
        if (ch === delimiter) {
            record.push(field)
            field = ''
            fieldStarted = false
            i += 1
            continue
        }
        if (ch === '\r' || ch === '\n') {
            record.push(field)
            records.push(record)
            record = []
            field = ''
            fieldStarted = false
            i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
            continue
        }
        field += ch
        fieldStarted = true
        i += 1
    }
    const trailing = field !== '' || record.length > 0 || fieldStarted
    if (trailing) {
        record.push(field)
        records.push(record)
    }
    return { records, unterminatedQuote: inQuotes, endedWithNewline: !trailing }
}

const CANDIDATES = [',', ';', '\t', '|']

export function detectDelimiter(text) {
    const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || ''
    let best = ','
    let bestCount = 0
    for (const candidate of CANDIDATES) {
        let count = 0
        let quoted = false
        for (const ch of firstLine) {
            if (ch === '"') quoted = !quoted
            else if (!quoted && ch === candidate) count += 1
        }
        if (count > bestCount) {
            best = candidate
            bestCount = count
        }
    }
    return best
}

function delimiterFrom(value) {
    if (value == null || value === 'auto') return null
    const map = { tab: '\t', pipe: '|', comma: ',', semicolon: ';' }
    if (map[value]) return map[value]
    if (value.length === 1) return value
    throw new ConfigError(`data-form-csv-delimiter="${value}" inválido. Use auto, ",", ";", tab ou pipe.`)
}

/**
 * Inspeciona APENAS uma amostra do início do arquivo (padrão 64 KB). Resultado marcado com sampled=true
 * quando o arquivo é maior que a amostra; nesse caso o último registro (possivelmente cortado) é descartado.
 */
export async function inspectCsv(file, { signal, attribute = () => null } = {}) {
    const sampleBytes = attribute('data-form-csv-sample') ? parseSize(attribute('data-form-csv-sample')) : 64 * 1024
    const encoding = attribute('data-form-csv-encoding') || 'utf-8'
    const explicit = delimiterFrom(attribute('data-form-csv-delimiter'))
    const sampled = file.size > sampleBytes
    const buffer = await file.slice(0, Math.min(file.size, sampleBytes)).arrayBuffer()
    if (signal?.aborted) throw new OperationalError('Inspeção cancelada.', { kind: 'abort' })
    let text
    try {
        text = new TextDecoder(encoding, { fatal: true }).decode(buffer, { stream: sampled })
    } catch (error) {
        if (error instanceof RangeError) throw new ConfigError(`Codificação "${encoding}" não suportada por TextDecoder.`)
        return { valid: false, reason: 'encoding', sampled, sampleBytes }
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const delimiter = explicit || detectDelimiter(text)
    const parsed = parseCsv(text, delimiter)
    let records = parsed.records
    if (sampled && !parsed.endedWithNewline && records.length > 1) records = records.slice(0, -1)
    if (sampled && parsed.unterminatedQuote && records.length > 1) records = records.slice(0, -1)
    records = records.filter(r => !(r.length === 1 && r[0] === ''))
    const headers = records[0] ? records[0].map(h => h.trim()) : []
    const widths = new Set(records.map(r => r.length))
    return {
        valid: headers.length > 0 && (!parsed.unterminatedQuote || sampled) && widths.size <= 1,
        reason: headers.length === 0 ? 'empty' : widths.size > 1 ? 'columns' : parsed.unterminatedQuote && !sampled ? 'quotes' : null,
        headers,
        rowsInSample: Math.max(0, records.length - 1),
        delimiter,
        sampled,
        sampleBytes,
    }
}
