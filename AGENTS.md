# AGENTS.md — instruções para assistentes de IA

Este arquivo é a fonte única de instruções para qualquer IA (Claude, Codex, Gemini, Copilot, Cursor, Aider…) que trabalhe neste repositório. `CLAUDE.md`, `GEMINI.md` e `.github/copilot-instructions.md` apenas apontam para cá.

## O que é o projeto

**AlpineForm** (`alpine-form`): micro-framework declarativo de formulários sobre **Alpine.js 3**. Regras, mensagens, máscaras e comportamento de envio ficam em atributos `data-form-*` no HTML; um controlador por `<form x-form>` valida, serializa, envia com progresso real e associa erros do servidor aos campos. Público principal: aplicações PHP/Joomla/Laravel, inclusive **páginas de banco** (ambiente regulado).

- Idioma de tudo (código, comentários, mensagens, documentação, commits): **português do Brasil**.
- Sem dependência em tempo de execução além do Alpine (peer dependency).

## Mapa do repositório

| Caminho | Conteúdo |
|---|---|
| `src/index.js`, `src/cdn.js` | Entrada ESM e IIFE; plugin Alpine (`x-form`, `$form`), API global `AlpineForm` |
| `src/core/controller.js` | `FormController`: descoberta de campos, listeners, validação, envio, erros, reset, destroy |
| `src/core/field.js` | `Field`: leitura de atributos, valores e representações (raw/formatted/canonical) |
| `src/core/config.js` | `OPTION_SPECS` (opções de formulário), precedência, `configure()` |
| `src/core/rule-parser.js` | Gramática de `data-form-v` |
| `src/core/messages.js` | Mensagens padrão (pt-BR) e precedência |
| `src/core/{remote,serializer,registry,events,errors}.js` | Validação remota, montagem do corpo, registro de extensões, eventos `form:*`, classes de erro |
| `src/validators/*.js` | Regras embutidas |
| `src/transport/*.js` | XHR (progresso real), fetch, adaptadores de resposta (default/laravel/joomla), progresso, retry |
| `src/files/`, `src/jobs/`, `src/ui/` | Arquivos e previews, polling de jobs (HTTP 202), adaptador de UI padrão/Bootstrap e `ProgressUi` |
| `src/masks/`, `src/chunks/`, `src/inspectors/`, `src/rascunho/`, `src/lista/`, `src/opcoes/`, `src/preencher/`, `src/avisos/`, `src/autocompletar/` | Módulos opcionais (empacotados separadamente) |
| `src/completo/` | Pacote único `alpine-form-completo` (núcleo + todos os módulos); novo módulo deve ser incluído aqui |
| `dist/` | Saída do build (**gerada**; commitada; não editar à mão) |
| `css/alpine-form.css` | CSS opcional |
| `php/alpine-form.php` | Helpers PHP para projetos (PHP **7.0+**, sem `strict_types`, sem sintaxe 7.1+): `Resposta`, `Entrada`, `Validador`, `Consulta`, `Csv`, `Csrf`; testes em `php/tests/run.php` e carga em `php/tests/carga.php` (`npm run test:php:carga`, lento) |
| `server/` | Backend PHP de referência (contratos de resposta, chunks, fila/worker, idempotência) e seus testes |
| `examples/*.php` | Páginas executáveis (incl. `csp.php`, CSP estrita) |
| `tests/unit/` | Vitest + jsdom + Alpine real; rede simulada por transportes registrados |
| `tests/e2e/` | Playwright no **Chrome instalado** contra o backend PHP real (porta 8099) |
| `docs-src/pages/*.html` | **Fonte** do guia com exemplos |
| `docs/*.html` | Guia **gerado** (não editar à mão) — `docs/*.md` são escritos à mão |
| `doc.html` | Documentação técnica interna (arquitetura, fluxos, rastreabilidade) |
| `scripts/` | Gerador e verificadores da documentação, servidor da documentação |
| `Dockerfile`, `docker/` | Documentação servida por nginx na porta 1900 |

## Comandos

```bash
npm install
npm run build          # gera dist/ — obrigatório depois de mudar src/
npm test               # unitários (Vitest/jsdom)
npm run test:php       # backend PHP
npm run test:e2e       # Playwright no Chrome (sobe/reutiliza php -S 127.0.0.1:8099)
npm run test:all       # build + tudo acima
npm run docs:check     # gera docs/ e confere atributos/regras/máscaras/métodos/links dos exemplos
npm run docs:browser   # carrega cada exemplo HTML da doc no Chrome (precisa do servidor em 8099)
npm run serve          # exemplos em http://127.0.0.1:8080/examples/
npm run docs:serve     # documentação em http://localhost:1900
npm run pacote         # build + pacote/alpine-form-<versão>.zip com o necessário para usar em outros projetos
```

Estado esperado: unitários 263/263, PHP 34/34 + helpers 25/25, E2E 71/71, `docs:check` OK, `docs:browser` 0 problemas. **Nunca declare que os testes passaram sem executá-los.**

## Qual guia ler para cada tarefa

Os guias detalhados ficam em `.claude/skills/*/SKILL.md` (Markdown comum, úteis para qualquer IA). Leia o correspondente **antes** de começar:

| Tarefa | Leia |
|---|---|
| Escrever formulários/backends **usando** a biblioteca em outro projeto | `.claude/skills/alpine-form-usar/SKILL.md` |
| Alterar o código da biblioteca (regra, atributo, máscara, evento, UI, correção) | `.claude/skills/alpine-form-desenvolver/SKILL.md` |
| Escrever ou corrigir documentação | `.claude/skills/alpine-form-documentar/SKILL.md` |
| Revisar segurança ou preparar uso em banco/ambiente regulado | `.claude/skills/alpine-form-seguranca/SKILL.md` |

O guia humano completo está em `docs-src/pages/` (ou `docs/index.html`): é a referência de comportamento para o usuário final.

## Invariantes — nunca quebre

1. **Nada é ignorado em silêncio.** Atributo `data-form-*` desconhecido, regra desconhecida, parâmetro inválido ou módulo ausente geram `ConfigError`, bloqueiam o campo e o envio. Todo atributo novo precisa ser registrado (`registerFieldAttributes` em `src/core/field.js`, `OPTION_SPECS` em `src/core/config.js`, ou `AlpineForm.fieldAttributes()` no módulo).
2. **Sem `eval`, `new Function`, `innerHTML`, `insertAdjacentHTML`, `outerHTML =` ou `document.write` em `src/`.** A biblioteca roda sob CSP estrita e Trusted Types (testado em `tests/e2e/csp.spec.js`). Texto vai para o DOM com `textContent`.
3. **Mensagens (inclusive do servidor) são texto, nunca HTML.**
4. **Valores sensíveis** (`type="password"`, `data-form-sensitive`) nunca aparecem em estado público, eventos, mensagens, logs ou URL.
5. **POST nunca é repetido automaticamente.** Timeout/queda depois do upload = resultado `unknown`. Retry só em operações idempotentes (validação remota, polling, partes de chunk).
6. **Dados do servidor não são confiáveis:** URLs (`status_url`, `cancel_url`, `redirect`) só da mesma origem (ou lista explícita); chaves `__proto__`/`prototype`/`constructor` nunca viram propriedades.
7. **Token CSRF só para a mesma origem.**
8. **Console e armazenamento respeitam `log: 'none'` e `storage: 'none'`.** Use `this.log()` (controlador), nunca `console.*` direto em código de formulário; persistência só via `storageAllowed`.
9. **Todo elemento criado pela biblioteca leva `data-form-generated`**, e atributos observados (`disabled`, `type`…) só são escritos quando mudam. Sem isso o `MutationObserver` entra em ciclo de re-renderização (bug real já corrigido; teste em `tests/unit/dynamic.test.js`).
10. **Respostas antigas nunca são aplicadas:** toda validação assíncrona usa `field.runToken` + `AbortController`; compare o valor antes de aplicar resultado remoto.
11. **Decimais são strings** (`"1234.50"`), nunca `Number`; compare com `compareDecimal`.
12. **Módulos opcionais** (`masks`, `chunks`, `inspectors`, `bootstrap`, `rascunho`, `lista`, `opcoes`, `preencher`, `avisos`, `autocompletar`) acessam registro e controlador só pela API recebida no plugin (`AlpineForm`, `AlpineForm.internals`); não importam `core/registry`, `core/controller` nem `core/services`. Não use `instanceof` com classes de erro entre módulos: use `isAbort()`, `isConfigError()` ou `error.kind`.
13. **Tudo que a biblioteca cria é liberado no `destroy()`:** listeners, observers, object URLs, elementos gerados, atributos ARIA (restaurados ao original).
14. **`dist/` e `docs/*.html` são gerados.** Edite `src/` e `docs-src/` e rode `npm run build` / `npm run docs`.

## Fluxo para qualquer mudança no código

1. Ler o skill `alpine-form-desenvolver`.
2. Escrever/ajustar teste que reproduza o caso (unitário em `tests/unit/`; E2E se envolver navegador real, cursor, progresso ou CSP).
3. Implementar respeitando os invariantes.
4. `npm run build && npm test && npm run test:php && npm run test:e2e`.
5. Atualizar documentação: `docs-src/pages/` (página do assunto + `referencia-rapida.html`), `docs/contrato.md`, `doc.html` se mudou comportamento interno; `npm run docs:check`.
6. Relatar o que foi executado e o resultado real.

## Armadilhas do ambiente (Windows/Laragon)

- Vários arquivos usam **CRLF**: substituições por `sed`/scripts com strings multilinha falham em silêncio. Prefira editar com a ferramenta de edição de arquivos e confira o resultado.
- Playwright usa `channel: 'chrome'` (o download do Chromium falha atrás do proxy corporativo). A E2E usa a porta **8099**; deixe-a livre ou com o servidor do projeto.
- Testes com espera fixa (`tick(10)`) ficam instáveis com a suíte em paralelo: espere pela condição (`vi.waitFor`, `expect.poll`).
- Ao gerar HTML/JS a partir do shell, cuidado com escapes (`\r\n`, `\\`, aspas); prefira gravar arquivos com a ferramenta de escrita.

## Commits

- Mensagem em português, primeira linha no imperativo/resumo (ex.: "Adiciona regra cnh"), corpo com o porquê.
- Rodar a suíte antes de commitar; não commitar com teste falhando.
- Não commitar `node_modules/`, `test-results/`, `server/storage/` (já no `.gitignore`).
- Branch principal publicada: `master` (remoto `origin`).
