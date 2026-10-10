---
name: alpine-form-seguranca
description: Use ao revisar a segurança do AlpineForm ou de uma aplicação que o usa, ao preparar uso em banco ou outro ambiente regulado (CSP estrita, LGPD, PCI), ou ao mexer em código que toca DOM, rede, URLs vindas do servidor, console ou armazenamento do navegador.
---

# Segurança do AlpineForm

Contexto: a biblioteca é usada em **páginas de banco**. Ela não passou por auditoria externa nem teste de invasão — diga isso ao relatar. Guia para o usuário final: `docs-src/pages/seguranca.html`.

## Configuração recomendada em produção regulada

```js
AlpineForm.configure({ log: 'none', storage: 'none', idempotency: true, credentials: 'same-origin' })
```

- `log: 'none'` → nada no console. `storage: 'none'` → nada em `localStorage`/`sessionStorage` (desliga `chunk-persist`/`job-persist`). Ambos também por formulário (`data-form-log`, `data-form-storage`).
- Sem `data-form-debug` em produção.
- CSP sem `'unsafe-eval'`/`'unsafe-inline'` com `@alpinejs/csp` (modelo: `examples/csp.php`, testado com Trusted Types em `tests/e2e/csp.spec.js`). Restrições do Alpine CSP: só caminhos de propriedade nas expressões, sem `x-model`, sem `x-form="{...}"`.

## Revisão de código: o que procurar

Rode e analise:

```bash
grep -rnE "\beval\(|new Function|innerHTML|insertAdjacentHTML|outerHTML\s*=|document\.write" src     # deve ser vazio
grep -rnE "console(\.|\[)" src      # só src/index.js (canLog), src/*/cdn.js e FormController.log (controller.js)
grep -rn "localStorage\|sessionStorage" src   # só chunk-upload.js e jobs/poller.js (atrás de storageAllowed); config.js só em comentário
npm audit --omit=dev                # dependências de execução (esperado: 0)
```

Checklist por área:

| Área | Verificar |
|---|---|
| DOM | Texto sempre por `textContent`; atributos por `setAttribute` com valores não executáveis; nada de HTML vindo do servidor |
| Dados sensíveis | `type=password`/`data-form-sensitive`: fora de `state.value`, eventos (`form:change`), placeholders `:value`, logs, URL (GET remoto bloqueado) |
| Rede | CSRF só para a mesma origem (`securityHeaders`); `credentials` padrão `same-origin`; nenhum POST repetido automaticamente |
| Dados do servidor | `status_url`, `cancel_url`, `redirect` só da mesma origem/lista; chaves `__proto__`/`prototype`/`constructor` neutralizadas (`normalizeErrors`, `setErrors`, `toJsonObject`) |
| Console | Nenhum valor de campo ou trecho de resposta no console; tudo via `FormController.log` (respeita `log: 'none'`) |
| Armazenamento | Só metadados, só com `storageAllowed`; nunca valores de campos |
| Arquivos | Preview só raster (SVG nunca); object URLs revogados; servidor confere conteúdo real |
| Regex | `data-form-pattern` limitado (500 chars, flags `imsu`, entrada até 2000) |
| Configuração | Atributo/regra inválida bloqueia envio (nunca "envia sem validar") |
| Recursos | `destroy()` remove listeners, observers, URLs, elementos gerados e ARIA |

## Testes de segurança existentes

- `tests/unit/privacidade.test.js` — log/storage desligados; trecho HTML fora do console; `__proto__` do servidor; `cancel_url` de outra origem.
- `tests/unit/submit.test.js` — CSRF só mesma origem, redirect seguro, prototype pollution no JSON, eventos sem senha.
- `tests/unit/validation.test.js` — mensagens como texto puro, GET remoto com campo sensível.
- `tests/e2e/csp.spec.js` — CSP estrita e Trusted Types sem violações.

Para cada achado novo: escreva o teste, confirme que **falha** sem a correção, corrija, rode a suíte completa e documente em `docs-src/pages/seguranca.html` e `docs/limitacoes.md`.

## Responsabilidades da aplicação (não da biblioteca)

Revalidar tudo no servidor; autorizar cada operação (dono do recurso); CSRF em toda rota de escrita; cookies `HttpOnly`/`Secure`/`SameSite`; **limitar tentativas** em validação remota (enumeração de clientes) e login; inspecionar o conteúdo real dos arquivos; idempotência de operações financeiras; cabeçalhos (CSP, HSTS, `nosniff`, `frame-ancestors`); cartão de crédito via campo hospedado do gateway (PCI); scripts servidos pelo próprio domínio ou com SRI; auditoria externa e pentest.

## Pendências conhecidas

- `npm audit` acusa vulnerabilidades em ferramentas de **teste** (Vitest/tinypool); não afetam o código entregue, mas a correção exige atualizar o Vitest de versão principal.
- Avisos de ordem de carregamento em `src/*/cdn.js` saem antes de `configure()` e ignoram `log: 'none'` (não contêm dados).
- O backend de referência não tem limite de tentativas.
