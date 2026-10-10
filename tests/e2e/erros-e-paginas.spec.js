import { test } from '@playwright/test'
import { open, state, waitPhase, expect } from './helpers.js'

const PAGES = ['index', 'cadastro', 'condicionais', 'remoto', 'escolhas', 'linhas', 'arquivo-unico', 'arquivos-multiplos', 'imagem', 'csv', 'edicao', 'progresso', 'chunks', 'processamento', 'erros', 'mascaras', 'bootstrap', 'extensao', 'esm', 'csp', 'rascunho', 'lista', 'opcoes', 'preencher', 'avisos', 'autocompletar']

test.describe('todas as páginas de exemplo', () => {
    for (const name of PAGES) {
        test(`${name}: carrega sem erros e fica estável em repouso`, async ({ page }) => {
            const problems = []
            page.on('pageerror', error => problems.push(error.message))
            page.on('console', message => {
                if (message.type() === 'error') problems.push(message.text())
            })
            await page.goto(`/examples/${name}.php`)
            await page.waitForFunction(() => {
                const forms = Array.from(document.querySelectorAll('form[x-form]'))
                return document.readyState === 'complete' && (!forms.length || (window.AlpineForm && forms.every(f => window.AlpineForm.get(f)?.ready)))
            })
            /* nenhum ciclo de re-renderização: o DOM não muda sem interação */
            const mutations = await page.evaluate(() => new Promise(resolve => {
                let count = 0
                const observer = new MutationObserver(records => (count += records.length))
                setTimeout(() => {
                    observer.observe(document.body, { subtree: true, childList: true, attributes: true })
                    setTimeout(() => {
                        observer.disconnect()
                        resolve(count)
                    }, 500)
                }, 300)
            }))
            expect(mutations).toBe(0)
            expect(problems).toEqual([])
        })
    }
})

test.describe('erros do backend', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, 'erros')
    })

    async function scenario(page, value) {
        await page.selectOption('#cenario', value)
        await page.click('#erros-padrao button[type=submit]')
        await waitPhase(page, 'erros-padrao', ['success', 'error'])
        return state(page, 'erros-padrao', s => ({ phase: s.phase, error: s.error, general: s.generalErrors, result: s.result }))
    }

    test('HTTP 200 com success:false é falha; erro sem campo vai para o resumo', async ({ page }) => {
        const s = await scenario(page, 'erro-logico')
        expect(s.phase).toBe('error')
        expect(s.general.length).toBeGreaterThan(0)
        await expect(page.locator('#erros-padrao .af-summary')).toBeVisible()
    })

    test('204 é sucesso sem corpo', async ({ page }) => {
        const s = await scenario(page, 'sem-conteudo')
        expect(s.phase).toBe('success')
        expect(s.result.status).toBe(204)
    })

    test('HTML inesperado com 200 gera diagnóstico específico, não "JSON inválido"', async ({ page }) => {
        const s = await scenario(page, 'html')
        expect(s.phase).toBe('error')
        expect(s.error.kind).toMatch(/html/)
    })

    test('429 com Retry-After e 419 (CSRF) são falhas com tipo próprio', async ({ page }) => {
        const limit = await scenario(page, 'limite')
        expect(limit.phase).toBe('error')
        expect(limit.error.status).toBe(429)
        const csrf = await scenario(page, 'csrf')
        expect(csrf.error.status).toBe(419)
    })

    test('Laravel: 422 associa "email" e "itens.0.nome" aos campos; formulários isolados', async ({ page }) => {
        await page.click('#erros-laravel button[type=submit]')
        await waitPhase(page, 'erros-laravel', 'error')
        const errors = await state(page, 'erros-laravel', s => s.errors)
        expect(errors['email']).toEqual(['O campo e-mail já está em uso.'])
        /* chaves de estado são canônicas com ponto: itens[0][nome] → itens.0.nome */
        expect(errors['itens.0.nome']).toEqual(['Nome do item obrigatório.'])
        await expect(page.locator('#email-laravel')).toHaveAttribute('aria-invalid', 'true')
        /* erro do servidor some quando o campo muda */
        await page.fill('#email-laravel', 'outra@exemplo.com')
        await expect(page.locator('#email-laravel')).not.toHaveAttribute('aria-invalid', 'true')
        expect(await state(page, 'erros-padrao', s => s.phase)).toBe('idle')
    })

    test('Joomla: jform[title] associado ao campo; messages.error no resumo', async ({ page }) => {
        await page.click('#erros-joomla button[type=submit]')
        await waitPhase(page, 'erros-joomla', 'error')
        const s = await state(page, 'erros-joomla', s => ({ errors: s.errors, general: s.generalErrors }))
        expect(s.errors['jform.title']).toEqual(['Título obrigatório.'])
        expect(s.general).toContain('Token inválido ou permissão insuficiente.')
    })

    test('redirecionamento para outra origem é bloqueado; mesma origem é seguido', async ({ page }) => {
        await page.check('input[value=redirect-externo]')
        await page.click('#erros-redirect button[type=submit]')
        await waitPhase(page, 'erros-redirect', ['success', 'error'])
        expect(page.url()).toContain('/examples/erros.php')

        await page.check('input[value=redirect]')
        await Promise.all([page.waitForURL(/\/examples\/index\.php\?ok=1$/), page.click('#erros-redirect button[type=submit]')])
    })
})
