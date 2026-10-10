# Contrato final: atributos, regras, API e eventos

Este documento descreve o contrato **implementado** (fonte: `src/core/config.js`, `src/core/field.js`, `src/core/controller.js`, `src/index.js` e módulos). Atributo desconhecido com prefixo `data-form-` em um campo é **erro de configuração** — nunca é ignorado em silêncio.

## 1. Precedência de configuração

```
padrão < AlpineForm.configure() < objeto do x-form="{...}" < data-form-* no <form>
       (opções herdáveis) < ancestral mais próximo dentro do form (grupo) < o próprio campo
```

Valores inválidos (enum fora da lista, duração malformada, booleano diferente de vazio/`true`/`false`) geram `ConfigError` com o nome do atributo. Durações aceitam `250`, `250ms`, `2s`, `1.5s`, `2min`. Tamanhos aceitam `10MB` (decimal, 10⁶) e `10MiB` (binário, 2²⁰); unidade ambígua é erro.

## 2. Atributos do `<form>`

| Atributo | Valores (padrão em **negrito**) | Herdável |
|---|---|---|
| `x-form` | expressão opcional com objeto de opções | — |
| `data-form-validation` | **live** · input · blur · change · submit | sim |
| `data-form-debounce` | duração (**200ms**, máx. 60s) | sim |
| `data-form-errors` | **first** · all | sim |
| `data-form-show-valid` | booleano (**false**) | sim |
| `data-form-hidden` | **validate** · skip (dispensa campos invisíveis) | sim |
| `data-form-server-errors` | **clear-on-change** · keep | sim |
| `data-form-date-format` | **iso** · br | sim |
| `data-form-ui` | nome do adaptador (**default**; `bootstrap` com o módulo) | |
| `data-form-summary` | **general** (só erros sem campo) · all · none | |
| `data-form-summary-target` | seletor do contêiner do resumo | |
| `data-form-focus` | **first** · none | |
| `data-form-scroll` | **smooth** · instant · none | |
| `data-form-transport` | **xhr** · fetch · nome registrado | |
| `data-form-encoding` | **multipart** · urlencoded · json | |
| `data-form-json-files` | **error** · metadata | |
| `data-form-nesting` | **brackets** · dots · flat (JSON) | |
| `data-form-timeout` | duração (**0** = sem limite) | |
| `data-form-credentials` | **same-origin** · include · omit | |
| `data-form-endpoint` / `data-form-method` | sobrescrevem `action` / `method` | |
| `data-form-header.<Nome>` | cabeçalho extra (`data-form-header.X-Tenant="acme"`) | |
| `data-form-response-adapter` | **default** · laravel · joomla · nome registrado | |
| `data-form-reset-on-success` | booleano | |
| `data-form-redirect` | **none** · response | |
| `data-form-redirect-origins` | lista de origens extras permitidas | |
| `data-form-idempotency` | booleano: envia `Idempotency-Key` | |
| `data-form-job-url` / `data-form-job-cancel-url` | modelos de URL do job (quando a resposta não traz) | |
| `data-form-job-interval` / `-max-interval` / `-timeout` | durações (**1.5s** / **10s** / **10min**) | |
| `data-form-job-persist` | booleano: id do job no `sessionStorage` | |
| `data-form-debug` | booleano: log detalhado | |
| `data-form-log` | **errors** · none (nada no console) | |
| `data-form-storage` | **allow** · none (nada em localStorage/sessionStorage) | |

Opções sem atributo (somente `configure()`/`x-form`): `headers`, `csrf` (`{ meta: 'csrf-token', header: 'X-CSRF-TOKEN' }`), `messages`, `locale`, `remote` (padrões da validação remota), `files`, `patternMaxLength`, `patternMaxInput`, `hooks`, `clock`.

## 3. Atributos de campo

| Atributo | Função |
|---|---|
| `data-form-v` | regras (gramática abaixo) |
| `data-form-msg` / `data-form-msg.<regra>[.<variante>]` | mensagem genérica do campo / por regra |
| `data-form-label` | nome usado em `:field` (senão `<label>` associado, senão `name`) |
| `data-form-error-target` | seletor do elemento de erro (padrão: criado após o controle) |
| `data-form-pattern` / `data-form-pattern-flags` | regex da regra `pattern` (flags `i m s u`; `g`/`y` proibidas; tamanho limitado) |
| `data-form-normalize` | normalizadores encadeados: `trim`, `lowercase`, `uppercase`, `digits`, `collapse_spaces`, `decimal[:locale]` |
| `data-form-submit-value` | representação enviada: `raw` · `formatted` · `canonical` |
| `data-form-mask-validation-value` | representação validada (mesmos valores) |
| `data-form-sensitive` | nunca expor o valor (implícito em `type=password`) |
| `data-form-ignore` | controle fora da validação e do envio |
| `data-form-unchecked-value` | valor enviado por checkbox individual desmarcado |
| `data-form-date-kind` | date · datetime · time · month · week (para inputs de texto) |
| `data-form-component` + `data-form-name` | componente externo registrado via `AlpineForm.component` |
| `data-form-disabled` | desabilita um componente externo |
| `data-form-remote` | URL da validação remota |
| `data-form-remote-method` / `-debounce` / `-timeout` / `-cache` / `-cache-ttl` | ajustes da consulta remota |
| `data-form-remote-fields` / `-param` | campos extras enviados / nome do parâmetro |
| `data-form-remote-inconclusive` | `allow` (padrão) · `block` quando rede/5xx impedem a resposta |
| `data-form-remote-adapter` | adaptador remoto registrado |
| `data-form-remote-allow-query` | autoriza GET para campo sensível (senão é erro) |
| `data-form-files-append` / `data-form-files-duplicates` | seleção incremental / `ignore` (padrão) · `allow` |
| `data-form-preview` | habilita/desabilita preview de imagem |
| `data-form-existing-remove-name` | nome do campo de remoção de arquivos existentes |

Atributos de módulos (exigem o módulo carregado): `data-form-mask*`, `data-form-chunked`/`data-form-chunk-*`, `data-form-csv-*`, `data-form-json-max`, `data-form-rascunho-ignorar` (campo).

No `<form>`, com o módulo `alpine-form-rascunho`: `data-form-rascunho` (validade em dias, padrão 7; exige `id` no form) e `data-form-rascunho-sessao` (usa `sessionStorage`). Eventos: `form:rascunho-restaurado` (`{ salvoEm, campos }`), `form:rascunho-salvo` (`{ campos }`), `form:rascunho-apagado`. API: `AlpineForm.rascunho.salvar|ler|descartar(formOuId)`.

No `<select>`, com o módulo `alpine-form-opcoes`: `data-form-opcoes="/url?x={campo}"` (opções da API; `{campo}` = valor de envio do campo, codificado; mesma origem), `data-form-opcoes-valor`, `-texto`, `-grupo`, `-selecionado`, `-vazio`, `-debounce`, `-cache`, `-manter-habilitado`; o módulo escreve `data-form-opcoes-estado` (aguardando|carregando|pronto|erro). Respostas: array, `{ data }`, `{ success, data }`, mapa `{ valor: texto }`. Eventos: `form:opcoes-carregadas` (`{ name, total, url }`), `form:opcoes-erro` (`{ name, url, status }`). API: `AlpineForm.opcoes.recarregar|estado|limparCache`.

No campo de origem, com o módulo `alpine-form-preencher`: `data-form-preencher="/url/{campo}"` ou serviço (`viacep`, `brasilapi-cep`, `brasilapi-cnpj`), `data-form-preencher-campos="chave:campo, ..."` (obrigatório; chaves aninhadas com ponto), `-minimo` (caracteres do valor bruto), `-debounce` (400ms), `-sobrescrever`, `-nao-encontrado`; o módulo escreve `data-form-preencher-estado`. Busca só com valor completo e válido; preenche apenas campos vazios ou preenchidos por ele; 404/400/422, `success:false` ou `{erro:true}` → erro no campo. Outras origens só com `AlpineForm.preencher.permitirOrigem()` ou serviço pronto (sem cookies). Eventos: `form:preenchido` (`{ name, campos }`), `form:preencher-erro` (`{ name, status, motivo }`).

No `<form>`, com o módulo `alpine-form-avisos`: `data-form-avisos` (`""` = sucesso e erro, `sucesso`, `erro`) e `data-form-aviso-sucesso` mostram avisos em `form:success`/`form:error`; `data-form-confirmar` (no form ou no botão submit, com `-titulo`, `-ok`, `-perigo`) abre um `<dialog>` depois da validação e antes da requisição (extensão `beforeSend`); cancelar termina o envio como cancelado. API `AlpineForm.avisos` e mágicas `$avisos`, `$confirmar`.

Com o módulo `alpine-form-autocompletar`: `<div data-form-component="autocompletar" data-form-name="x" data-form-autocompletar="/url?busca={termo}">` com um `<input type="text">` sem `name`; atributos `-valor`, `-texto`, `-descricao` (caminhos com ponto), `-minimo` (2), `-debounce` (250ms), `-limite` (10), `-campos` (`chave:campo`), `-inicial`, `-livre`, `-vazio`. Valor = do item escolhido (digitar depois de escolher limpa). Respostas: array, `{ data }`, `{ success, data }`, `{ itens|items|results }`. Eventos `form:autocompletar-selecionado` (`{ name, valor, texto, item }`) e `form:autocompletar-erro`.

No `<form>`, com o módulo `alpine-form-lista`: `data-form-lista="idOuGrupo ..."` — depois de `form:success`, recarrega as listas (`x-lista`) cujo `id` ou `data-lista-grupo` corresponda; se a resposta trouxer `data.id` e a lista tiver `data-lista-destacar`, essa chave fica em `$lista.destaque`. Exportação (`data-lista-exportar-url` / `data-lista-exportar-completo-url` + botões `data-lista-exportar="filtro|completo"`): GET com filtros e ordenação sem `page`/`per_page` (filtro) ou sem parâmetros (completo); resposta 2xx com o arquivo (`text/csv`, `Content-Disposition`); JSON/HTML/erro não é baixado (`lista:exportacao-erro`). `data-lista-exportar-modo`: `baixar` (padrão), `direto` (URL entregue ao navegador) ou `auto` (filtro com `total` ≤ `data-lista-exportar-limite`, padrão 50000, baixa pela página; acima disso e o completo usam `data-lista-exportar-grande`). Listagens (GET): parâmetros `page`, `per_page`, `sort`, `direction` e filtros pelo `name`; respostas aceitas: Laravel Resource (`data` + `meta`), `paginate()`, `simplePaginate()`, `{ success, data: { itens, total, pagina, por_pagina } }`, `{ items, total }` ou array. Detalhes em `docs/lista.html`.

### Elementos auxiliares (dentro do form ou em contêiner com `data-form-for="idDoForm"`)

| Atributo | Função |
|---|---|
| `data-form-status` | texto da fase atual (`aria-live`) |
| `data-form-progress` | contêiner; recebe `data-form-state` e `aria-busy` |
| `data-form-progress-bar` | `<progress>` ou elemento com largura/ARIA atualizados |
| `data-form-progress-percent` · `-loaded` · `-total` · `-speed` · `-eta` · `-elapsed` | métricas |
| `data-form-cancel` · `data-form-pause` · `data-form-resume` | botões; habilitados conforme a fase |
| `data-form-file-list="nome"` | lista gerada de arquivos com botão "Remover" |
| `data-form-dropzone="nome"` | área de arrastar-e-soltar |
| `data-form-existing` + `data-form-existing-id` / `-name` / `data-form-existing-remove` | arquivos já salvos (edição) |
| `data-form-errors-summary` | contêiner do resumo dentro do form |

## 4. Gramática de `data-form-v`

```
regras := regra ("|" regra)*
regra  := nome (":" parametro ("," parametro)*)?
escape := \|  \:  \,  \\
```

Regra vazia, desconhecida (com sugestão da mais próxima), repetida, parâmetro faltante/inválido ou contradição (`required|nullable`) → `ConfigError`; o campo fica bloqueado e o envio também.

### Regras embutidas

| Grupo | Regras |
|---|---|
| Presença | `required`, `optional`, `nullable`, `accepted`, `required_if:campo,valor…`, `required_unless:campo,valor…`, `required_with:campo…`, `required_without:campo…` |
| Texto | `min:n`, `max:n`, `between:a,b`, `length:n`, `min_length:n`, `max_length:n`, `email[:strict\|loose]`, `url`, `pattern`, `alpha[:spaces]`, `alphanumeric[:spaces]`, `digits[:n]`, `starts_with:…`, `ends_with:…`, `contains:…`, `in:…`, `not_in:…` |
| Números (decimal exato, sem ponto flutuante) | `numeric`, `integer`, `decimal:a[,b]`, `positive`, `negative`, `min_value:x`, `max_value:x`, `multiple_of:x` |
| Comparação | `same:campo`, `different:campo`, `greater_than:campo`, `greater_or_equal:campo`, `less_than:campo`, `less_or_equal:campo` |
| Datas (estritas; `today` usa relógio local injetável) | `date[:kind]`, `before:x`, `after:x`, `before_or_equal:x`, `after_or_equal:x`, `date_between:a,b` — `x` = literal, `today` ou nome de campo |
| Brasil | `cpf`, `cnpj[:numeric]` (alfanumérico por padrão), `cpf_cnpj`, `cep`, `telefone[:celular\|fixo]` (formato, não existência) |
| Cartões | `luhn`, `card[:bandeiras]` |
| Arquivos | `files_min:n`, `files_max:n`, `file_min:tam`, `file_max:tam`, `files_total_max:tam`, `ext:…`, `mime:…`, `non_empty_file`, `image`, `width_min`, `width_max`, `height_min`, `height_max`, `dimensions:LxA`, `aspect_ratio:r[,tol]` |
| Inspetores (módulo) | `csv`, `csv_headers:…`, `csv_columns:n`, `json[:object\|array]`, `json_root`, `json_keys:…`, `pdf_signature`, `xlsx_signature`, `media_duration_max:s`, `media_duration_min:s` |

`min`/`max`/`between` medem valor em campos numéricos, comprimento (code points) em texto e quantidade em listas. Zero, `"0"` e `false` não são vazios; texto só com espaços é vazio.

### Mensagens

Precedência: `data-form-msg.<regra>` no campo > `data-form-msg` do campo > `messages` configuradas > padrão (`AlpineForm.messages`). Placeholders: `:field`, `:other` e os nomes dos parâmetros (`:min`, `:max`, `:length`…). Mensagens são inseridas como **texto** (`textContent`), nunca HTML; o valor de campos sensíveis nunca é interpolado.

## 5. Máscaras (módulo `alpine-form-masks`)

`data-form-mask`: `cpf`, `cnpj`, `cpf_cnpj`, `cep`, `telefone_fixo`, `celular`, `telefone_br`, `card`, `date`, `time`, `month_year`, `integer`, `decimal`, `currency`, `percent`, `pattern`.

Ajustes: `data-form-mask-pattern` (tokens `9` dígito, `A` letra, `*` alfanumérico, `\` escapa), `-case` (upper/lower), `-placeholder`, `-locale`, `-currency`, `-scale`, `-negative`, `-pad`, `-grouping`, `-max-digits`, `-card-brands`.

Representações: **exibido/formatted** (o que está no input), **raw** (caracteres significativos, sem literais; na moeda, sinal + dígitos — não é número) e **canonical** (documentos: raw; datas: ISO quando existe no calendário; números: string decimal com ponto e escala fixa, nunca `Number`). Cada máscara tem padrões próprios de validação/envio, sobrescritos por `data-form-mask-validation-value` e `data-form-submit-value`. Máscara em `type=number` é recusada.

## 6. API `$form` (estado reativo por formulário)

Disponível como `$form` em qualquer expressão Alpine dentro do form (ou em `data-form-for`) e por `AlpineForm.get(formOuId)`.

**Estado:** `ready`, `phase` (`idle` · `validating` · `uploading` · `paused` · `awaiting` · `processing` · `success` · `error` · `canceled`), `pristine`, `dirty`, `validating`, `submitting`, `uploading`, `awaitingResponse`, `processing`, `paused`, `success`, `canceled`, `failed`, `submitted`, `submitCount`, `progress` (`loaded`, `total`, `percent`, `indeterminate`, `lengthComputable`, `speed`, `eta`, `elapsed`, `uploaded`), `errors` (por chave canônica, ex.: `itens.0.nome`), `generalErrors`, `configErrors`, `result`, `error` (`kind`, `message`, `status`…), `status` (texto), `job`, `uploads`, `fields` (estado por campo: `value`, `filled`, `touched`, `dirty`, `validated`, `validating`, `errors`, `localErrors`, `serverErrors`, `valid`, `invalid`, `remote`, `disabled`, `files`, `existing`, …).

**Métodos:** `validate()`, `validateField(nome)`, `submit(opções)`, `cancel()`, `reset()`, `resetValidation()`, `setValue(nome, valor, { as })`, `getValue(nome, { as })`, `getValues(opções)`, `setErrors(erros, opções)`, `clearErrors(nome?)`, `refresh()`, `destroy()`, `addFiles(nome, arquivos)`, `removeFile(nome, id)`, `removeExisting(nome, id, removido)`, `pauseUpload(nome?)`, `resumeUpload(nome?)`, `getUploadSession(nome?)` (síncrono), `cancelJob()`, `clearRemoteCache(nome?)`, `field(nome)`, `has(nome)`, `hasError(nome)`, `firstError(nome)`, `diagnostics()`.

`submit()` chamado durante um envio devolve a **mesma Promise** (sem envio duplicado). Os nomes aceitam a forma do HTML (`itens[0][nome]`, `documentos[]`) ou a canônica (`itens.0.nome`, `documentos`).

## 7. Eventos (`CustomEvent` no `<form>`, com `bubbles`)

`form:ready`, `form:change`, `form:validating`, `form:validated`, `form:invalid`, `form:before-submit`*, `form:submit`*, `form:progress`, `form:uploaded`, `form:processing`, `form:success`, `form:error`, `form:cancel`, `form:reset`*, `form:destroy`, `form:field-added`, `form:field-removed`, `form:reveal`*, `form:config-error`. (*) canceláveis com `preventDefault()`. Detalhes de eventos nunca contêm valores de campos sensíveis.

## 8. API global `AlpineForm`

`version`, `plugin`, `configure(opções)`, `resetConfig()`, `options`, `use(plugin)`, `get(formOuId)`, `attach(form, opções)` (sem diretiva), `diagnose()`, registros — `validator`, `normalizer`, `mask`, `transport`, `responseAdapter`, `remoteAdapter`, `uiAdapter`, `fileInspector`, `component`, `fieldAttributes`, `formHook` —, `registry` (`get`, `has`, `names`, `unregister`), `utils` (`parseSize`, `formatBytes`, `compareDecimal`, `toFixedScale`), `events`, `messages`, `errors` (`AlpineFormError`, `ConfigError`, `OperationalError`, `StateError`, `SerializationError`, `AbortError`). `internals` existe para os módulos oficiais e não é API estável.

Registrar um nome já existente é erro, salvo `{ replace: true }`.
