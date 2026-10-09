import { defineConfig } from '@playwright/test'

/**
 * E2E em navegador real contra o backend PHP de referência (sem mocks de rede).
 * Usa o Google Chrome instalado (channel "chrome"); para usar o Chromium do Playwright,
 * rode `npx playwright install chromium` e defina PW_CHANNEL= (vazio).
 * O servidor embutido do PHP é single-thread: os testes rodam em série.
 */
const port = Number(process.env.E2E_PORT || 8099)
const channel = process.env.PW_CHANNEL ?? 'chrome'

export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: false,
    workers: 1,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: [['list']],
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        ...(channel ? { channel } : {}),
        trace: 'retain-on-failure',
    },
    webServer: {
        command: `php -S 127.0.0.1:${port} server/router.php`,
        url: `http://127.0.0.1:${port}/examples/index.php`,
        reuseExistingServer: true,
        timeout: 20_000,
    },
})
