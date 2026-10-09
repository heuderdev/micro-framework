import { inspectCsv, parseCsv, detectDelimiter } from './csv.js'
import { inspectJson } from './json.js'
import { inspectPdf, inspectXlsx, inspectZipEntries } from './signatures.js'
import { inspectMedia } from './media.js'

export { inspectCsv, parseCsv, detectDelimiter, inspectJson, inspectPdf, inspectXlsx, inspectZipEntries, inspectMedia }

export const INSPECTOR_ATTRIBUTES = ['data-form-csv-delimiter', 'data-form-csv-sample', 'data-form-csv-encoding', 'data-form-json-max']

export const INSPECTOR_MESSAGES = {
    csv: 'O arquivo :file não parece um CSV válido (verificado em amostra).',
    'csv.encoding': 'O arquivo :file não está na codificação esperada.',
    csv_headers: 'O arquivo :file deve conter as colunas: :allowed (verificado no cabeçalho).',
    csv_columns: 'O arquivo :file deve ter :count colunas (verificado no cabeçalho).',
    json: 'O arquivo :file não contém JSON válido.',
    'json.oversize': 'O arquivo :file é grande demais para ser verificado no navegador.',
    json_root: 'O JSON de :file deve ter raiz do tipo :type.',
    json_keys: 'O JSON de :file deve conter as chaves: :allowed.',
    pdf_signature: 'O arquivo :file não tem assinatura de PDF.',
    xlsx_signature: 'O arquivo :file não tem a estrutura de uma planilha XLSX.',
    media_duration_max: 'A mídia :file deve ter no máximo :max segundos.',
    media_duration_min: 'A mídia :file deve ter no mínimo :min segundos.',
    'media.decode': 'Não foi possível ler os metadados de :file neste navegador.',
}

function fileRule(inspector, test, varsFor = () => ({}), extra = {}) {
    return {
        async: true,
        ...extra,
        async validate(value, ctx) {
            if (ctx.field.kind !== 'file') return ctx.configError(`A regra "${ctx.rule.name}" só se aplica a campos de arquivo.`)
            const failed = []
            for (const item of value || []) {
                let meta
                try {
                    meta = await ctx.inspect(inspector, item)
                } catch (error) {
                    if (error?.kind === 'abort' || error?.name === 'AbortError') throw error
                    if (error?.name === 'ConfigError') throw error
                    failed.push({ id: item.id, variant: 'decode', vars: { file: item.name } })
                    continue
                }
                const outcome = test(meta, ctx, item)
                if (outcome !== true) failed.push({ id: item.id, variant: outcome?.variant ?? null, vars: { file: item.name, ...varsFor(ctx, meta) } })
            }
            return failed.length ? { valid: false, items: failed } : true
        },
    }
}

const lower = list => list.map(s => s.trim().toLowerCase())

export const INSPECTOR_VALIDATORS = {
    csv: fileRule('csv', meta => (meta.valid ? true : { variant: meta.reason === 'encoding' ? 'encoding' : null })),
    csv_headers: fileRule('csv', (meta, ctx) => {
        if (!meta.headers) return { variant: meta.reason === 'encoding' ? 'encoding' : null }
        const present = new Set(lower(meta.headers))
        return lower(ctx.params.values).every(h => present.has(h)) || {}
    }, ctx => ({ allowed: ctx.params.values.join(', ') }), { rest: { name: 'values', type: 'string', min: 1 } }),
    csv_columns: fileRule('csv', (meta, ctx) => (meta.headers?.length === ctx.params.count ? true : {}), ctx => ({ count: ctx.params.count }), { params: [{ name: 'count', type: 'integer' }] }),
    json: fileRule('json', meta => (meta.valid ? true : { variant: meta.reason === 'oversize' ? 'oversize' : null })),
    json_root: fileRule('json', (meta, ctx) => (meta.valid && meta.root === ctx.params.type ? true : {}), ctx => ({ type: ctx.params.type === 'object' ? 'objeto' : 'lista' }), {
        params: [{ name: 'type', type: 'enum', values: ['object', 'array'] }],
    }),
    json_keys: fileRule('json', (meta, ctx) => (meta.valid && ctx.params.values.every(k => meta.keys.includes(k)) ? true : {}), ctx => ({ allowed: ctx.params.values.join(', ') }), {
        rest: { name: 'values', type: 'string', min: 1 },
    }),
    pdf_signature: fileRule('pdf', meta => meta.valid || {}),
    xlsx_signature: fileRule('xlsx', meta => meta.valid || {}),
    media_duration_max: fileRule('media', (meta, ctx) => (meta.duration != null && meta.duration <= Number(ctx.params.max) ? true : {}), ctx => ({ max: ctx.params.max }), {
        params: [{ name: 'max', type: 'number' }],
    }),
    media_duration_min: fileRule('media', (meta, ctx) => (meta.duration != null && meta.duration >= Number(ctx.params.min) ? true : {}), ctx => ({ min: ctx.params.min }), {
        params: [{ name: 'min', type: 'number' }],
    }),
}

/**
 * Módulo opcional de inspetores (parsers fora do núcleo).
 *   ESM:    import inspectors from 'alpine-form/inspectors'; AlpineForm.use(inspectors)
 *   script: <script src="alpine-form-inspectors.min.js"></script>
 * Para PDF/XLSX completos, registre um inspetor próprio com uma biblioteca especializada
 * (ver docs/extensao.md) — este módulo verifica apenas assinatura/estrutura.
 */
export default function inspectorsPlugin(AlpineForm) {
    const inspectors = { csv: inspectCsv, json: inspectJson, pdf: inspectPdf, xlsx: inspectXlsx, media: inspectMedia }
    for (const [name, inspect] of Object.entries(inspectors)) {
        if (!AlpineForm.registry.has('fileInspector', name)) AlpineForm.fileInspector(name, { inspect })
    }
    for (const [name, definition] of Object.entries(INSPECTOR_VALIDATORS)) {
        if (!AlpineForm.registry.has('validator', name)) AlpineForm.validator(name, definition)
    }
    for (const [key, message] of Object.entries(INSPECTOR_MESSAGES)) {
        if (!(key in AlpineForm.messages)) AlpineForm.messages[key] = message
    }
    for (const name of Object.keys(INSPECTOR_VALIDATORS)) {
        const key = `${name}.decode`
        if (!(key in AlpineForm.messages)) AlpineForm.messages[key] = 'Não foi possível ler o arquivo :file neste navegador.'
    }
    AlpineForm.fieldAttributes(INSPECTOR_ATTRIBUTES)
}
