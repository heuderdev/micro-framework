---
name: alpine-form-desenvolver
description: Use ao alterar o código da biblioteca AlpineForm em src/ (nova regra, atributo, opção, máscara, evento, adaptador, módulo, correção de bug) ou o backend de referência em server/. Traz a arquitetura, o passo a passo de cada tipo de mudança, onde testar e como validar antes de concluir.
---

# Desenvolver o AlpineForm

Leia antes os **invariantes** em `AGENTS.md` — eles valem para toda mudança. A explicação interna completa (fluxos, símbolos, decisões) está em `doc.html`.

## Arquitetura em 30 segundos

- `AlpineFormPlugin` (`src/index.js`) registra a diretiva `x-form`; cada form ganha um `FormController` (`src/core/controller.js`) com estado reativo (= `$form`, métodos em `publicMethods()`).
- `refresh()` → `discover()` agrupa controles por `name` → `Field` (`src/core/field.js`) lê atributos (`readConfiguration`) e calcula representações.
- Validação: `validateField()` (presença → síncronas → assíncronas → remota), com `runToken` + `AbortController`; mensagens por `resolveMessage` (`src/core/messages.js`).
- Envio: `submit()` → `runSubmit()` → `validateForSubmit()` → extensões `beforeSend` → `collectEntries()` (`src/core/serializer.js`) → transporte (`src/transport/xhr.js`) → adaptador de resposta (`src/transport/response.js`) → `handleResult()` / `runJob()`.
- DOM dinâmico: `MutationObserver` → `onMutations()` → `refresh()` agrupado.
- UI: `DefaultUiAdapter` (`src/ui/default-adapter.js`) e `ProgressUi` (`src/ui/progress-ui.js`).
- Extensões: registro global (`src/core/registry.js`); módulos opcionais são plugins `(AlpineForm) => {...}`.

## Passo a passo por tipo de mudança

### Nova regra de validação
1. Implemente no arquivo do grupo em `src/validators/` (objeto exportado `{ nome: { params, rest?, presence?, async?, validate(value, ctx) } }`). Tipos de parâmetro: `integer`, `number` (decimal como string), `size`, `field` (cria dependência), `date-or-field`, `enum` (+`values`), `ratio`, `dimensions`, `string`.
2. Retorne `true` / `false` / `{ valid:false, variant, vars, items }`. Não rode em vazio (só regras `presence: true` recebem vazio). Números: `compareDecimal`, nunca `Number`.
3. Mensagem padrão em `DEFAULT_MESSAGES` (`src/core/messages.js`), pt-BR, com placeholders.
4. Teste em `tests/unit/validation.test.js` (ou `files.test.js` para arquivos): válido, inválido, vazio, parâmetro inválido (deve virar `ConfigError`).
5. Documente: `docs-src/pages/regras.html`, `referencia-rapida.html`, `docs/contrato.md`.

### Novo atributo de campo
1. Registre em `registry.registerFieldAttributes([...])` no topo de `src/core/field.js` (ou `AlpineForm.fieldAttributes()` se for de módulo). Sem isso ele é "atributo desconhecido".
2. Leia com `this.groupAttribute('data-form-...')` em `Field.readConfiguration()`; valores inválidos → `throw new ConfigError(...)` com mensagem clara em pt-BR.
3. Se mudar dinamicamente deve reconfigurar o campo: inclua em `OBSERVED_ATTRIBUTES` (`controller.js`).
4. Testes + documentação (como acima).

### Nova opção de formulário (atributo no `<form>` e `configure()`)
1. Adicione em `OPTION_SPECS` (`src/core/config.js`): `attr`, `type` (`bool`/`enum`/`duration`/`int`/`list`/`string`), `default`, `values`, `inherit: true` se também vale por campo/grupo. Isso já habilita `data-form-x`, `x-form="{x}"` e `configure({x})`.
2. Use via `this.config.x` (ou `field.option('x')` se herdável).
3. Teste de precedência/valor inválido; documente em `referencia-rapida.html` (atributos e `configure`), página do assunto, `docs/contrato.md`.

### Nova máscara
1. Fábrica em `src/masks/definitions.js` usando `patternMask(...)` (padrões) ou `numericMask(...)`; registre em `BUILTIN_MASKS`. Defina `defaults: { validation, submit }`.
2. Atributo novo de máscara → `MASK_ATTRIBUTES` e `readMaskConfig` (`src/masks/runtime.js`).
3. Testes: motor em `tests/unit/masks-engine.test.js`, integração em `masks-integration.test.js`; cursor/colagem em navegador real em `tests/e2e/mascaras.spec.js`.
4. Documente em `docs-src/pages/mascaras.html` (tabela de máscaras + exemplos).

### Novo evento `form:*`
1. Nome em `EVENTS` (`src/core/events.js`); cancelável → `CANCELABLE`. Dispare com `dispatch(this.form, EVENTS.x, detail)`.
2. `detail` nunca contém valor sensível.
3. Documente em `docs-src/pages/eventos.html` e `referencia-rapida.html`.

### Adaptador de resposta / transporte
- Embutidos registrados em `registerBuiltins()` (`src/index.js`). Adaptador devolve `{ ok, status, kind, message, errors, generalErrors, data, redirect, requestId, job, retryAfter, diagnostic }`. Chaves de erro passam por `normalizeErrors` (neutraliza `__proto__`).
- Transporte recebe `{ url, method, headers, body, credentials, timeout, signal, onUploadProgress, onUploadComplete }` e devolve `{ status, statusText, url, redirected, headers: { get }, text }`; erros com `kind: 'network'|'timeout'`, aborto com `name: 'AbortError'`.

### Mudança de UI (DOM gerado)
- Todo elemento criado: `data-form-generated="<tipo>"`, texto via `textContent`, removido em `destroy()`/`removeField()`.
- Atributos/`disabled` só escritos quando mudam (ver `setDisabled` em `progress-ui.js`).
- Classes vêm de `DEFAULT_CLASSES` (e `BOOTSTRAP_CLASSES` em `src/ui/bootstrap.js` — atualize os dois).
- O teste "UI gerada não dispara refresh em ciclo" (`tests/unit/dynamic.test.js`) e o smoke E2E (0 mutações em repouso, `tests/e2e/erros-e-paginas.spec.js`) precisam continuar passando.

### Novo módulo opcional
1. `src/<modulo>/index.js` exporta `default function plugin(AlpineForm)`; use só a API recebida (`AlpineForm.validator`, `.fieldAttributes`, `.formHook`, `.internals`). Não importe `core/registry`, `core/controller`, `core/services`.
2. `src/<modulo>/cdn.js` para o build IIFE (verifica `window.AlpineForm` e chama `use`).
3. Adicione em `modules` de `build.mjs` e em `exports` do `package.json`.

### Backend de referência (`server/`)
- Rotas em `server/src/Api.php`; erros HTTP via `HttpError`; respostas `{ success, message, errors, data, request_id }`.
- Testes PHP em `server/tests/*Test.php` (runner `server/tests/run.php`), inclusive concorrência.
- O backend é **referência**, não produção — mas mantenha CSRF, dono do recurso (404 para outro dono), escrita atômica e inspeção do conteúdo real dos arquivos.

## Onde testar

| Tipo | Arquivo | Observações |
|---|---|---|
| Parser, utilitários | `tests/unit/parser.test.js`, `lib.test.js` | puros |
| Validação, mensagens, remota | `tests/unit/validation.test.js` | `mount()`, `type()`, `blur()`, `fakeTransport()` em `helpers.js` |
| Envio, respostas, reset/destroy | `tests/unit/submit.test.js` | registre transporte `'test'` e use `data-form-transport="test"` |
| DOM dinâmico | `tests/unit/dynamic.test.js` | espere com `vi.waitFor`, não com `tick(10)` |
| Arquivos, chunks | `tests/unit/files.test.js`, `chunks.test.js` | |
| Privacidade/segurança | `tests/unit/privacidade.test.js` | log/storage, dados do servidor |
| Navegador real | `tests/e2e/*.spec.js` | Chrome, backend PHP em 8099; CSP em `csp.spec.js` |

Comprove que o teste novo **falha sem a correção** e passa com ela.

## Antes de concluir

```bash
npm run build && npm test && npm run test:php && npm run test:e2e && npm run docs:check
```

- `dist/` deve ser regenerado e commitado junto com `src/`.
- Atualize a documentação (skill `alpine-form-documentar`).
- Relate os números reais dos testes; nunca afirme sucesso sem rodar.
