# Guia de integração com o backend

O backend continua sendo a autoridade: a biblioteca melhora a experiência, mas **toda regra precisa ser revalidada no servidor**. O backend de referência em `server/` implementa todos os contratos abaixo e é usado pelos exemplos e pelos testes E2E.

## 1. Requisição de envio

- URL/método: `action`/`method` do form, `formaction`/`formmethod` do submitter, ou `data-form-endpoint`/`data-form-method`.
- Corpo: `multipart/form-data` (padrão; o `Content-Type` com boundary é definido pelo navegador), `urlencoded` ou `json` (`data-form-encoding`). Em `GET` os dados vão na query string.
- Cabeçalhos automáticos: `Accept` (JSON preferido), `X-Requested-With: XMLHttpRequest`, CSRF (abaixo), `Idempotency-Key` (com `data-form-idempotency`), cabeçalhos de `data-form-header.*` e de `configure({ headers })`.
- Serialização: ordem do HTML, nomes repetidos preservados, submitter incluído, desabilitados e desmarcados omitidos (salvo `data-form-unchecked-value`), controles fora da árvore com `form="id"` incluídos. Campos com máscara/normalizador enviam a representação de `data-form-submit-value` — **não há input hidden duplicado**.
- JSON: nomes com colchetes viram objetos/arrays (`data-form-nesting`); `__proto__`, `constructor` e `prototype` são recusados (`SerializationError`); arquivo em JSON é erro, salvo `data-form-json-files="metadata"` (envia nome/tamanho/tipo, não o conteúdo).
- Campo de arquivo sem seleção envia uma parte vazia (mesmo comportamento do navegador; o PHP a recebe como `UPLOAD_ERR_NO_FILE`).

### CSRF

O token é lido de `<meta name="csrf-token">` e enviado em `X-CSRF-TOKEN` **somente para a mesma origem**. Para outro nome: `AlpineForm.configure({ csrf: { meta: 'csrf', header: 'X-XSRF-TOKEN' } })`; para desativar: `csrf: null`.

## 2. Contrato de resposta (adaptador `default`)

```json
{ "success": true, "message": "Salvo.", "errors": {}, "data": { "id": 7 }, "redirect": null, "request_id": "a1b2" }
```

| Situação | Resultado (`$form.phase` / `error.kind`) |
|---|---|
| 2xx e `success` ausente ou `true` | `success` |
| 2xx com `success: false` | `error` (`validation` se houver `errors` por campo, senão `logical`) — **HTTP 200 não é sucesso por si só** |
| 204 / corpo vazio | `success`, `result.data = null` |
| 202 com `job` (ou `job_id`) | `processing` → polling (seção 5) |
| 401 · 403 · 413 · 419 · 422 · 429 · 5xx · outros 4xx | `auth` · `forbidden` · `too_large` · `csrf` · `validation` · `rate_limited` · `server` · `http` (429 lê `Retry-After`) |
| HTML (ex.: página de login, erro de proxy) | `html`, com `diagnostic.looksLikeLogin` e trecho — nunca "JSON inválido" genérico |
| texto ou JSON malformado | `parse` |

`message` ou `mensagem` são aceitos. `errors` aceita `{ campo: "msg" }` ou `{ campo: ["msg", …] }`, chaves com ponto (`itens.0.nome`), colchetes (`itens[0][nome]`) ou índice de arquivo (`documentos.1` → segundo arquivo enviado). Chaves sem campo correspondente na tela, e as chaves `""`, `_`, `_general` e `*`, vão para `generalErrors` e para o resumo. `request_id` (ou o cabeçalho `X-Request-Id`) é registrado no console.

Mensagens do servidor são exibidas como texto puro. Erros do servidor somem quando o campo muda (`data-form-server-errors="clear-on-change"`).

### Redirecionamento

Com `data-form-redirect="response"`, `redirect`/`redirect_url` só é seguido se for http(s) da mesma origem ou de uma origem em `data-form-redirect-origins`. Caso contrário é ignorado e registrado.

### Laravel

`data-form-response-adapter="laravel"`: 422 `{ message, errors }` (a mensagem genérica em inglês é descartada quando há erros por campo); 419 = CSRF expirado. Para o token: `<meta name="csrf-token" content="{{ csrf_token() }}">`.

### Joomla

`data-form-response-adapter="joomla"`: `JsonResponse` `{ success, message, messages: { error: [], warning: [] }, data }`. `messages.error`/`warning` vão para o resumo; erros por campo são lidos de `data.errors` (ou `errors`), com chaves como `jform[title]`. O token de formulário do Joomla é um campo hidden comum e é serializado normalmente.

## 3. Validação remota

`data-form-remote="/api/validar-email"` envia (POST por padrão, `application/x-www-form-urlencoded`; em GET, na query string) `<param>=valor` (padrão: o `name` do campo), `_field=<name>` e os campos de `data-form-remote-fields`. Cabeçalhos de CSRF só vão para a mesma origem. Espera:

```json
{ "valid": false, "message": "Este e-mail já está cadastrado." }
```

Só consulta depois que as regras locais passam; aborta a consulta anterior quando o valor muda; resultado é associado ao valor consultado (resposta obsoleta é descartada). Rede/timeout/5xx/resposta fora do contrato = **inconclusivo**: `allow` (padrão) não bloqueia o envio; `block` bloqueia. GET com campo sensível é erro de configuração, salvo `data-form-remote-allow-query`. Outros formatos: `AlpineForm.remoteAdapter(nome, json => ({ valid, message }))`.

## 4. Upload em partes (módulo `alpine-form-chunks`)

```html
<input type="file" name="arquivo" data-form-chunked data-form-chunk-endpoint="/api/uploads"
       data-form-chunk-size="5MiB" data-form-chunk-concurrency="3" data-form-chunk-retries="5" data-form-chunk-persist>
```

Protocolo (`src/chunks/chunk-upload.js` ⇄ `server/src/ChunkStore.php`):

| Requisição | Resposta |
|---|---|
| `POST {endpoint}` JSON `{name,size,type,lastModified,chunkSize,fingerprint}` | `201 {uploadId, chunkSize, totalParts, expiresAt, receivedParts: []}` |
| `GET {endpoint}/{id}` | `{uploadId, size, chunkSize, totalParts, receivedParts, status, expiresAt}` |
| `PUT {endpoint}/{id}/parts/{i}` corpo = bytes; `X-Chunk-Offset`, `X-Chunk-Size`, `X-Chunk-Sha256` | `200 {received}`; `409` parte já existente com conteúdo diferente; `404/410` sessão inexistente/expirada |
| `POST {endpoint}/{id}/complete` JSON `{manifest}` | `{status: "completed", token, size}` |
| `DELETE {endpoint}/{id}` | `204` |

O formulário principal recebe o **token** no lugar do arquivo; o endpoint do formulário deve vincular o token ao registro (no backend de referência, `/api/documentos`). Retry com backoff em 408/429/5xx/rede; 409 não é repetido; sessão expirada é recriada uma vez. SHA-256 por parte requer contexto seguro (HTTPS ou localhost). Com `-persist`, somente metadados ficam no `localStorage`; após recarregar, o usuário precisa selecionar o arquivo de novo.

## 5. Processamento assíncrono (jobs)

Resposta `202`:

```json
{ "success": true, "job": { "id": "…", "status_url": "/api/jobs/…", "cancel_url": "/api/jobs/…" } }
```

A biblioteca consulta `status_url` (ou `data-form-job-url`) **sem sobrepor requisições**, com intervalo crescente (×1,5 até `data-form-job-max-interval`; `Retry-After` tem prioridade). Status esperado:

```json
{ "status": "queued|processing|succeeded|failed|canceled", "progress": 42, "message": "…", "result": {…}, "error": "…" }
```

`progress` só é exibido se for número de 0 a 100 informado pelo servidor; sem ele a barra fica indeterminada. `cancel()` / "Parar de acompanhar" encerra **apenas a observação**; `$form.cancelJob()` envia `DELETE` para `cancel_url`. Com `data-form-job-persist`, o id fica no `sessionStorage` e o acompanhamento é retomado ao recarregar.

## 6. Backend de referência (PHP ≥ 8.1)

```bash
php -S 127.0.0.1:8080 server/router.php   # API + exemplos
php server/bin/worker.php                 # fila de processamento (--once, --idle=ms)
php server/bin/cleanup.php                # remove sessões de upload, tokens e temporários expirados (agende)
php server/tests/run.php                  # testes do backend
```

- Sessão própria com CSRF; todas as rotas não-GET verificam o token. Recursos (uploads, jobs, registros) pertencem ao dono da sessão: acesso de outro dono responde 404.
- Escritas atômicas e travas por arquivo (`flock`); concorrência coberta por testes com processos reais.
- Inspeção de arquivos pelo conteúdo (assinatura/`finfo`), não pela extensão; nomes saneados.
- `Idempotency-Key`: a mesma chave com o mesmo corpo devolve a resposta gravada; com corpo diferente, 422; enquanto a primeira ainda processa, 409. O cliente só reutiliza a chave quando o resultado anterior foi desconhecido (timeout/queda após o upload) e os dados não mudaram — e nunca reenvia sozinho.
- Armazenamento em `server/storage` (configurável por `ALPINEFORM_STORAGE`). O roteador só serve `/api`, `/examples`, `/dist`, `/css`, `/doc.html`, `/docs` e `/vendor`.
- O servidor embutido do PHP é single-thread: serve para demonstração e testes, não para produção.
