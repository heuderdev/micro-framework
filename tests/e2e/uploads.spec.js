import { test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { open, state, waitPhase, expect } from './helpers.js'

test.describe('progresso real de upload (XHR)', () => {
    test('fases enviando → aguardando resposta → sucesso; 100% enviado não é concluído', async ({ page }) => {
        await open(page, 'progresso')
        await page.evaluate(() => {
            const seen = []
            window.__phases = seen
            const api = window.AlpineForm.get('progresso')
            const track = () => {
                if (seen.at(-1) !== api.phase) seen.push(api.phase)
                if (api.phase !== 'success' && api.phase !== 'error') requestAnimationFrame(track)
            }
            track()
            window.AlpineForm.get('progresso').addFiles('arquivo', [new File([new Uint8Array(8 * 1024 * 1024)], 'oito.bin')])
        })
        await page.click('#progresso button[type=submit]')
        await waitPhase(page, 'progresso', 'awaiting')
        const awaiting = await state(page, 'progresso', s => ({ awaiting: s.awaitingResponse, percent: s.progress.percent, loaded: s.progress.loaded, total: s.progress.total, success: s.success }))
        expect(awaiting.awaiting).toBe(true)
        expect(awaiting.percent).toBe(100)
        expect(awaiting.loaded).toBe(awaiting.total)
        expect(awaiting.total).toBeGreaterThan(8 * 1024 * 1024)
        expect(awaiting.success).toBe(false)
        await expect(page.locator('#progresso [data-form-status]')).not.toHaveText('')
        await waitPhase(page, 'progresso', ['success', 'error'])
        expect(await state(page, 'progresso', s => s.phase)).toBe('success')
        const phases = await page.evaluate(() => window.__phases)
        expect(phases.indexOf('uploading')).toBeLessThan(phases.indexOf('awaiting'))
        expect(phases.at(-1)).toBe('success')
    })

    test('cancelamento aborta a requisição e não é tratado como erro', async ({ page }) => {
        await open(page, 'progresso')
        await page.evaluate(() => window.AlpineForm.get('progresso').addFiles('arquivo', [new File([new Uint8Array(1024)], 'pequeno.bin')]))
        await page.click('#progresso button[type=submit]')
        await waitPhase(page, 'progresso', 'awaiting')
        await page.click('#progresso [data-form-cancel]')
        await waitPhase(page, 'progresso', 'canceled')
        const s = await state(page, 'progresso', s => ({ failed: s.failed, submitting: s.submitting }))
        expect(s).toEqual({ failed: false, submitting: false })
    })

    test('fetch: progresso indeterminado; timeout após envio é "resultado desconhecido"', async ({ page }) => {
        await open(page, 'progresso')
        await page.click('#indeterminado button[type=submit]')
        /* fetch não expõe progresso de upload: a fase pode ser "uploading" ou "awaiting", mas sem percentual */
        await waitPhase(page, 'indeterminado', ['uploading', 'awaiting'])
        expect(await state(page, 'indeterminado', s => ({ indeterminate: s.progress.indeterminate, percent: s.progress.percent }))).toEqual({ indeterminate: true, percent: null })
        await waitPhase(page, 'indeterminado', 'success')

        await page.click('#timeout button[type=submit]')
        await waitPhase(page, 'timeout', 'error')
        /* corpo já entregue quando o tempo esgotou: o servidor pode ter processado → kind "unknown", sem reenvio */
        expect(await state(page, 'timeout', s => s.error.kind)).toBe('unknown')
        /* formulários da mesma página não interferem entre si */
        expect(await state(page, 'indeterminado', s => s.phase)).toBe('success')
        expect(await state(page, 'progresso', s => s.phase)).toBe('idle')
    })
})

test.describe('múltiplos arquivos', () => {
    test('arquivo removido da lista não é enviado', async ({ page }) => {
        await open(page, 'arquivos-multiplos')
        await page.setInputFiles('#documentos', [
            { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%a\n') },
            { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0a40000000049454e44ae426082', 'hex') },
            { name: 'c.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%c\n') },
        ])
        await expect(page.locator('#multiplos .af-file')).toHaveCount(3)
        await page.getByRole('button', { name: 'Remover b.png' }).click()
        await expect(page.locator('#multiplos .af-file')).toHaveCount(2)
        const posted = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/upload'))
        await page.click('#multiplos button[type=submit]')
        const body = (await posted).postData() ?? ''
        await waitPhase(page, 'multiplos', ['success', 'error'])
        const result = await state(page, 'multiplos', s => ({ phase: s.phase, data: s.result && s.result.data }))
        expect(result.phase).toBe('success')
        expect(result.data.arquivos.documentos.map(f => f.name)).toEqual(['a.pdf', 'c.pdf'])
        expect(body).not.toContain('b.png')
        /* object URL do thumbnail revogado ao remover: nenhuma <img blob:> órfã */
        await expect(page.locator('#multiplos img[src^="blob:"]')).toHaveCount(0)
    })
})

test.describe('chunks com backend PHP real', () => {
    test('pausa, retomada, token no envio final e registro gravado', async ({ page }) => {
        await open(page, 'chunks')
        await page.evaluate(() => localStorage.clear())
        /* desacelera as partes para que a pausa aconteça no meio do envio */
        await page.route('**/api/uploads/*/parts/*', async route => {
            await new Promise(r => setTimeout(r, 120))
            await route.continue()
        })
        await page.getByRole('button', { name: 'Gerar arquivo de 24 MB' }).click()
        await page.click('#chunks button[type=submit]')
        await page.waitForFunction(() => (window.AlpineForm.get('chunks').uploads.arquivo?.files[0]?.receivedParts ?? 0) >= 3)
        await page.click('#chunks [data-form-pause]')
        await waitPhase(page, 'chunks', 'paused')
        const atPause = await state(page, 'chunks', s => s.uploads.arquivo.files[0])
        expect(atPause.status).toBe('paused')
        expect(atPause.receivedParts).toBeLessThan(24)
        await page.waitForTimeout(600)
        const stillPaused = await state(page, 'chunks', s => s.uploads.arquivo.files[0].receivedParts)
        expect(stillPaused).toBeLessThanOrEqual(atPause.receivedParts + 3)

        const resumedStatus = page.waitForRequest(r => r.method() === 'GET' && /\/api\/uploads\/[0-9a-f]+$/.test(r.url()))
        await page.click('#chunks [data-form-resume]')
        await resumedStatus
        await waitPhase(page, 'chunks', ['success', 'error'], 120_000)
        const final = await state(page, 'chunks', s => ({ phase: s.phase, file: s.uploads.arquivo.files[0], data: s.result.data, percent: s.progress.percent }))
        expect(final.phase).toBe('success')
        expect(final.file.status).toBe('completed')
        expect(final.file.receivedParts).toBe(24)
        expect(final.percent).toBe(100)
        expect(final.data.arquivos).toEqual([{ name: 'grande-24MB.bin', size: 24 * 1024 * 1024 }])
    })

    test('cancelar descarta a sessão no servidor (DELETE)', async ({ page }) => {
        await open(page, 'chunks')
        await page.evaluate(() => localStorage.clear())
        await page.route('**/api/uploads/*/parts/*', async route => {
            await new Promise(r => setTimeout(r, 150))
            await route.continue()
        })
        await page.getByRole('button', { name: 'Gerar arquivo de 24 MB' }).click()
        await page.click('#chunks button[type=submit]')
        await page.waitForFunction(() => (window.AlpineForm.get('chunks').uploads.arquivo?.files[0]?.receivedParts ?? 0) >= 1)
        const deleted = page.waitForRequest(r => r.method() === 'DELETE' && /\/api\/uploads\/[0-9a-f]+$/.test(r.url()))
        await page.click('#chunks [data-form-cancel]')
        await deleted
        await waitPhase(page, 'chunks', 'canceled')
    })
})

test.describe('processamento assíncrono (fila + worker reais)', () => {
    let worker
    test.beforeAll(() => {
        worker = spawn('php', ['server/bin/worker.php', '--idle=100', '--tipos=import_csv'], { stdio: 'ignore' })
    })
    test.afterAll(() => {
        worker?.kill()
    })

    test('202 com job → polling com progresso informado pelo worker → resultado', async ({ page }) => {
        await open(page, 'processamento')
        await page.evaluate(() => sessionStorage.clear())
        await page.getByRole('button', { name: /Gerar CSV/ }).click()
        await page.click('#processamento button[type=submit]')
        await waitPhase(page, 'processamento', 'processing')
        await waitPhase(page, 'processamento', ['success', 'error'], 60_000)
        const s = await state(page, 'processamento', s => ({ phase: s.phase, job: s.job, data: s.result.data }))
        expect(s.phase).toBe('success')
        expect(s.job.status).toBe('succeeded')
        expect(s.data.linhas).toBe(5000)
        expect(s.data.sha256).toMatch(/^[0-9a-f]{64}$/)
    })
})
