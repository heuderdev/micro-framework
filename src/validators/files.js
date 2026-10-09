import { formatBytes } from '../lib/size.js'
import { toArray } from '../lib/utils.js'

/**
 * Regras de arquivo recebem a lista de itens NOVOS do campo ({ id, file, name, size, type }).
 * files_min/files_max contam também arquivos existentes mantidos (edição).
 * Extensão e MIME são informados pelo navegador a partir do nome: não comprovam o conteúdo.
 * Regras de dimensão ignoram arquivos que não são imagens raster; use "image" para exigir imagem.
 */
export const RASTER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']

function items(value) {
    return toArray(value).filter(item => item && item.file)
}

function perFile(test, varsFor) {
    return (value, ctx) => {
        const failed = []
        for (const item of items(value)) {
            if (!test(item, ctx)) failed.push({ id: item.id, vars: { file: item.name, ...varsFor(ctx, item) } })
        }
        return failed.length ? { valid: false, items: failed } : true
    }
}

function asyncPerFile(test, varsFor) {
    return async (value, ctx) => {
        const failed = []
        for (const item of items(value)) {
            ctx.signal?.throwIfAborted?.()
            const result = await test(item, ctx)
            if (result !== true) {
                failed.push({ id: item.id, variant: result?.variant ?? null, vars: { file: item.name, ...varsFor(ctx, item) } })
            }
        }
        return failed.length ? { valid: false, items: failed } : true
    }
}

function extensionMatches(name, allowed) {
    const lower = name.toLowerCase()
    return allowed.some(ext => lower.endsWith('.' + ext.toLowerCase().replace(/^\./, '')))
}

function mimeMatches(type, allowed) {
    if (!type) return false
    const lower = type.toLowerCase()
    return allowed.some(pattern => {
        const p = pattern.toLowerCase()
        return p.endsWith('/*') ? lower.startsWith(p.slice(0, -1)) : lower === p
    })
}

function fileOnly(rule) {
    return {
        ...rule,
        validate(value, ctx) {
            if (ctx.field.kind !== 'file') return ctx.configError(`A regra "${ctx.rule.name}" só se aplica a campos de arquivo.`)
            return rule.validate(value, ctx)
        },
    }
}

async function decodeImage(item, ctx) {
    if (!RASTER_IMAGE_TYPES.includes((item.type || '').toLowerCase())) return { notImage: true }
    try {
        return await ctx.inspect('image', item)
    } catch (error) {
        if (error?.kind === 'abort' || error?.name === 'AbortError') throw error
        return { error: true }
    }
}

function dimensionRule(test, varsFor) {
    return fileOnly({
        async: true,
        params: [{ name: 'n', type: 'integer' }],
        validate: asyncPerFile(async (item, ctx) => {
            const meta = await decodeImage(item, ctx)
            if (meta.notImage) return true
            if (meta.error) return { variant: 'decode' }
            return test(meta, ctx.params.n) ? true : { variant: null }
        }, varsFor),
    })
}

export default {
    files_min: fileOnly({
        params: [{ name: 'min', type: 'integer' }],
        validate: (value, ctx) => items(value).length + (ctx.field.existingCount || 0) >= ctx.params.min || { valid: false, vars: { min: ctx.params.min } },
    }),
    files_max: fileOnly({
        params: [{ name: 'max', type: 'integer' }],
        validate: (value, ctx) => items(value).length + (ctx.field.existingCount || 0) <= ctx.params.max || { valid: false, vars: { max: ctx.params.max } },
    }),
    file_min: fileOnly({
        params: [{ name: 'min', type: 'size' }],
        validate: perFile((item, ctx) => item.size >= ctx.params.min.bytes, ctx => ({ min: ctx.params.min.text })),
    }),
    file_max: fileOnly({
        params: [{ name: 'max', type: 'size' }],
        validate: perFile((item, ctx) => item.size <= ctx.params.max.bytes, (ctx, item) => ({ max: ctx.params.max.text, size: formatBytes(item.size) })),
    }),
    files_total_max: fileOnly({
        params: [{ name: 'max', type: 'size' }],
        validate(value, ctx) {
            const total = items(value).reduce((sum, item) => sum + item.size, 0)
            return total <= ctx.params.max.bytes || { valid: false, vars: { max: ctx.params.max.text, size: formatBytes(total) } }
        },
    }),
    ext: fileOnly({
        rest: { name: 'values', type: 'string', min: 1 },
        validate: perFile((item, ctx) => extensionMatches(item.name, ctx.params.values), ctx => ({ allowed: ctx.params.values.join(', ') })),
    }),
    mime: fileOnly({
        rest: { name: 'values', type: 'string', min: 1 },
        validate: perFile((item, ctx) => mimeMatches(item.type, ctx.params.values), ctx => ({ allowed: ctx.params.values.join(', ') })),
    }),
    non_empty_file: fileOnly({
        validate: perFile(item => item.size > 0, () => ({})),
    }),
    image: fileOnly({
        async: true,
        validate: asyncPerFile(async (item, ctx) => {
            if (!RASTER_IMAGE_TYPES.includes((item.type || '').toLowerCase())) return { variant: null }
            const meta = await decodeImage(item, ctx)
            return meta.error ? { variant: 'decode' } : true
        }, () => ({})),
    }),
    width_min: dimensionRule((m, n) => m.width >= n, ctx => ({ min: ctx.params.n })),
    width_max: dimensionRule((m, n) => m.width <= n, ctx => ({ max: ctx.params.n })),
    height_min: dimensionRule((m, n) => m.height >= n, ctx => ({ min: ctx.params.n })),
    height_max: dimensionRule((m, n) => m.height <= n, ctx => ({ max: ctx.params.n })),
    dimensions: fileOnly({
        async: true,
        params: [{ name: 'size', type: 'dimensions' }],
        validate: asyncPerFile(async (item, ctx) => {
            const meta = await decodeImage(item, ctx)
            if (meta.notImage) return true
            if (meta.error) return { variant: 'decode' }
            return meta.width === ctx.params.size.width && meta.height === ctx.params.size.height ? true : { variant: null }
        }, ctx => ({ width: ctx.params.size.width, height: ctx.params.size.height })),
    }),
    aspect_ratio: fileOnly({
        async: true,
        params: [{ name: 'ratio', type: 'ratio' }, { name: 'tolerance', type: 'number', optional: true }],
        validate: asyncPerFile(async (item, ctx) => {
            const meta = await decodeImage(item, ctx)
            if (meta.notImage) return true
            if (meta.error) return { variant: 'decode' }
            const tolerance = ctx.params.tolerance != null ? Number(ctx.params.tolerance) : 0.01
            const actual = meta.width / meta.height
            return Math.abs(actual - ctx.params.ratio.value) / ctx.params.ratio.value <= tolerance ? true : { variant: null }
        }, ctx => ({ ratio: ctx.params.ratio.text })),
    }),
}
