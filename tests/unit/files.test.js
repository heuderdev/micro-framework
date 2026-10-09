import { describe, it, expect, afterEach, vi } from 'vitest'
import { startAlpine, mount, flush, change, fakeTransport, jsonResponse, AlpineForm } from './helpers.js'
import inspectorsPlugin from '../../src/inspectors/index.js'
import { parseCsv, inspectCsv } from '../../src/inspectors/csv.js'
import { inspectXlsx, inspectPdf } from '../../src/inspectors/signatures.js'

startAlpine(inspectorsPlugin)

afterEach(() => {
    AlpineForm.registry.unregister('transport', 'test')
    vi.restoreAllMocks()
})

const file = (name, size = 10, type = '') => new File([new Uint8Array(size)], name, { type, lastModified: 1 })

function setInputFiles(input, files) {
    Object.defineProperty(input, 'files', { configurable: true, get: () => files })
    change(input)
}

describe('arquivos', () => {
    it('regras por arquivo e por grupo, com erro individual na lista', async () => {
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input type="file" name="docs[]" multiple data-form-v="required|files_max:2|file_max:1KB|files_total_max:1500B|ext:pdf,png|mime:application/pdf,image/*|non_empty_file">
                <div data-form-file-list="docs[]"></div>
            </form>`)
        api.addFiles('docs', [file('a.pdf', 10, 'application/pdf'), file('grande.png', 2000, 'image/png'), file('c.exe', 0, 'application/x-msdownload')])
        await api.validate()
        expect(api.fields.docs.errors[0]).toBe('Envie no máximo 2 arquivo(s).')
        api.removeFile('docs', api.fields.docs.files[2].id)
        await api.validate()
        expect(api.fields.docs.errors[0]).toBe('O arquivo grande.png excede o limite de 1 KB.')
        expect(api.fields.docs.files[1].errors).toEqual(['O arquivo grande.png excede o limite de 1 KB.'])
        expect(form.querySelectorAll('.af-file--invalid')).toHaveLength(1)
    })

    it('arquivo removido da UI não é enviado (fonte de verdade = lista interna)', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { success: true }))
        AlpineForm.transport('test', transport, { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form action="/u" method="post" data-form-transport="test" novalidate>
                <input type="file" name="docs[]" multiple>
                <div data-form-file-list="docs[]"></div>
            </form>`)
        setInputFiles(form.querySelector('input'), [file('a.txt'), file('b.txt'), file('c.txt')])
        expect(api.fields.docs.files.map(f => f.name)).toEqual(['a.txt', 'b.txt', 'c.txt'])
        form.querySelector('[data-file-id] + * button, li[data-file-id]:nth-child(2) button').click()
        await flush()
        await api.submit()
        const sent = Array.from(transport.calls[0].body.getAll('docs[]')).map(f => f.name)
        expect(sent).toEqual(['a.txt', 'c.txt'])
    })

    it('seleção incremental e política de duplicados', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input type="file" name="f" multiple data-form-files-append></form>`)
        const input = form.querySelector('input')
        setInputFiles(input, [file('a.txt')])
        setInputFiles(input, [file('a.txt'), file('b.txt')])
        expect(api.fields.f.files.map(f => f.name)).toEqual(['a.txt', 'b.txt'])
    })

    it('arquivo vazio nativo é enviado quando nada foi selecionado (compatibilidade com PHP)', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { success: true }))
        AlpineForm.transport('test', transport, { replace: true })
        const { api } = await mount(`<form x-data x-form action="/u" method="post" data-form-transport="test" novalidate><input type="file" name="f"></form>`)
        await api.submit()
        const value = transport.calls[0].body.get('f')
        expect(value).toBeInstanceOf(File)
        expect(value.name).toBe('')
        expect(value.size).toBe(0)
    })

    it('object URLs de preview são criadas só para imagens raster e revogadas', async () => {
        const created = []
        const revoked = []
        URL.createObjectURL = vi.fn(f => {
            created.push(f.name)
            return `blob:${f.name}`
        })
        URL.revokeObjectURL = vi.fn(u => revoked.push(u))
        const { form, api } = await mount(`
            <form x-data x-form novalidate>
                <input type="file" name="imgs" multiple>
                <div data-form-file-list="imgs"></div>
            </form>`)
        api.addFiles('imgs', [file('a.png', 10, 'image/png'), file('b.svg', 10, 'image/svg+xml'), file('c.pdf', 10, 'application/pdf')])
        expect(created).toEqual(['a.png'])
        expect(form.querySelector('img').getAttribute('src')).toBe('blob:a.png')
        api.removeFile('imgs', api.fields.imgs.files[0].id)
        expect(revoked).toEqual(['blob:a.png'])
        api.addFiles('imgs', [file('d.png', 10, 'image/png')])
        api.destroy()
        expect(revoked).toEqual(['blob:a.png', 'blob:d.png'])
    })

    it('existentes: pedido de remoção separado e contagem conjunta', async () => {
        const transport = fakeTransport(() => jsonResponse(200, { success: true }))
        AlpineForm.transport('test', transport, { replace: true })
        const { form, api } = await mount(`
            <form x-data x-form action="/p" method="post" data-form-transport="test" novalidate>
                <ul>
                  <li data-form-existing="anexos[]" data-form-existing-id="1">um <button type="button" data-form-existing-remove>x</button></li>
                  <li data-form-existing="anexos[]" data-form-existing-id="2">dois <button type="button" data-form-existing-remove>x</button></li>
                </ul>
                <input type="file" name="anexos[]" multiple data-form-v="required|files_max:2">
            </form>`)
        expect((await api.validate()).valid).toBe(true)
        const buttons = form.querySelectorAll('[data-form-existing-remove]')
        buttons[0].click()
        buttons[1].click()
        expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
        expect((await api.validate()).valid).toBe(false)
        api.addFiles('anexos', [file('novo.pdf')])
        await api.submit()
        const body = transport.calls[0].body
        expect(body.getAll('anexos_remover[]')).toEqual(['1', '2'])
        expect(body.getAll('anexos[]').map(f => f.name)).toEqual(['novo.pdf'])
    })

    it('dimensões de imagem via inspetor, inclusive falha de decodificação', async () => {
        AlpineForm.fileInspector('image', {
            inspect: async f => {
                if (f.name === 'quebrada.png') throw Object.assign(new Error('decode'), { kind: 'decode' })
                return { width: 100, height: 50 }
            },
        }, { replace: true })
        const { api } = await mount(`<form x-data x-form novalidate><input type="file" name="img" multiple data-form-v="image|width_min:200|aspect_ratio:2/1"></form>`)
        api.addFiles('img', [file('ok.png', 5, 'image/png'), file('quebrada.png', 5, 'image/png'), file('doc.pdf', 5, 'application/pdf')])
        await api.validate()
        const [ok, broken, pdf] = api.fields.img.files
        expect(ok.errors).toEqual([])
        expect(broken.errors).toEqual(['Não foi possível ler a imagem quebrada.png neste navegador.'])
        expect(pdf.errors).toEqual(['O arquivo doc.pdf não é uma imagem válida.'])
        api.addFiles('img', [])
        AlpineForm.fileInspector('image', { inspect: async () => ({ width: 100, height: 50 }) }, { replace: true })
    })

    it('drag-and-drop adiciona arquivos ao campo da dropzone', async () => {
        const { form, api } = await mount(`<form x-data x-form novalidate><input type="file" name="f" multiple><div data-form-dropzone="f">solte</div></form>`)
        const zone = form.querySelector('[data-form-dropzone]')
        const drop = new Event('drop', { bubbles: true, cancelable: true })
        drop.dataTransfer = { files: [file('x.txt')] }
        zone.dispatchEvent(drop)
        expect(drop.defaultPrevented).toBe(true)
        expect(api.fields.f.files.map(f => f.name)).toEqual(['x.txt'])
    })
})

describe('inspetores (módulo opcional)', () => {
    it('parser CSV RFC 4180', () => {
        const { records } = parseCsv('a,"b ""x"", y",c\r\n1,"multi\nlinha",3\n', ',')
        expect(records).toEqual([['a', 'b "x", y', 'c'], ['1', 'multi\nlinha', '3']])
    })

    it('CSV por amostragem: cabeçalho, delimitador e marca sampled', async () => {
        const rows = ['nome;email;valor', ...Array.from({ length: 5000 }, (_, i) => `n${i};e${i}@x;${i}`)].join('\n')
        const result = await inspectCsv(new File([rows], 'a.csv'), { attribute: n => (n === 'data-form-csv-sample' ? '4KB' : null) })
        expect(result.delimiter).toBe(';')
        expect(result.headers).toEqual(['nome', 'email', 'valor'])
        expect(result.sampled).toBe(true)
        expect(result.valid).toBe(true)
    })

    it('regras csv_headers e json no formulário', async () => {
        const { api } = await mount(`
            <form x-data x-form novalidate>
                <input type="file" name="planilha" data-form-v="csv|csv_headers:nome,email">
                <input type="file" name="dados" data-form-v="json|json_root:object|json_keys:id">
            </form>`)
        api.addFiles('planilha', [new File(['nome,telefone\nana,1'], 'a.csv')])
        api.addFiles('dados', [new File(['{"x":1}'], 'a.json')])
        await api.validate()
        expect(api.fields.planilha.errors[0]).toBe('O arquivo a.csv deve conter as colunas: nome, email (verificado no cabeçalho).')
        expect(api.fields.dados.errors[0]).toBe('O JSON de a.json deve conter as chaves: id.')
    })

    it('assinaturas PDF e XLSX', async () => {
        expect((await inspectPdf(new File(['%PDF-1.7\n...'], 'a.pdf'))).valid).toBe(true)
        expect((await inspectPdf(new File(['<html>'], 'a.pdf'))).valid).toBe(false)
        expect((await inspectXlsx(new File(['texto'], 'a.xlsx'))).valid).toBe(false)
    })
})
