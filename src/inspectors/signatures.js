/**
 * Verificações de ASSINATURA (magic bytes) e estrutura de contêiner. Não são parsers completos:
 * confirmam que o arquivo começa como um PDF / é um ZIP com as entradas esperadas de um XLSX.
 * Conteúdo malicioso, corrompido ou criptografado não é detectado. A inspeção final é do servidor.
 */
export async function inspectPdf(file) {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
    const text = new TextDecoder('latin1').decode(head)
    return { valid: text.includes('%PDF-'), headerOffset: text.indexOf('%PDF-') }
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

/**
 * Lê somente o final do arquivo (até 66 KB) para localizar o diretório central do ZIP e listar nomes
 * de entradas. Arquivos com diretório central maior que a janela lida são reportados como "unverified".
 */
export async function inspectZipEntries(file) {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) return { zip: false, entries: [] }
    const window = Math.min(file.size, 66 * 1024)
    const tailStart = file.size - window
    const tail = new DataView(await file.slice(tailStart).arrayBuffer())
    let eocd = -1
    for (let i = tail.byteLength - 22; i >= 0; i--) {
        if (tail.getUint32(i, true) === EOCD_SIGNATURE) {
            eocd = i
            break
        }
    }
    if (eocd < 0) return { zip: true, entries: [], unverified: true }
    const cdSize = tail.getUint32(eocd + 12, true)
    const cdOffset = tail.getUint32(eocd + 16, true)
    if (cdOffset === 0xffffffff || cdOffset < tailStart || cdOffset + cdSize > file.size) {
        return { zip: true, entries: [], unverified: true }
    }
    const entries = []
    const decoder = new TextDecoder('utf-8')
    let p = cdOffset - tailStart
    const end = p + cdSize
    while (p + 46 <= end && tail.getUint32(p, true) === CENTRAL_SIGNATURE) {
        const nameLength = tail.getUint16(p + 28, true)
        const extraLength = tail.getUint16(p + 30, true)
        const commentLength = tail.getUint16(p + 32, true)
        const name = decoder.decode(new Uint8Array(tail.buffer, tail.byteOffset + p + 46, nameLength))
        entries.push(name)
        p += 46 + nameLength + extraLength + commentLength
        if (entries.length > 10000) break
    }
    return { zip: true, entries }
}

export async function inspectXlsx(file) {
    const zip = await inspectZipEntries(file)
    if (!zip.zip) return { valid: false, reason: 'not-zip' }
    if (zip.unverified) return { valid: false, reason: 'unverified' }
    const names = new Set(zip.entries)
    return { valid: names.has('[Content_Types].xml') && names.has('xl/workbook.xml'), reason: 'entries', entries: zip.entries.length }
}
