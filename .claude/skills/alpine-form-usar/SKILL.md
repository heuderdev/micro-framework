---
name: alpine-form-usar
description: Use ao criar, alterar ou depurar formulários que usam a biblioteca AlpineForm (atributos data-form-*, x-form, $form) e o backend que responde a eles — PHP, Joomla ou Laravel. Cobre carregamento dos scripts, regras, máscaras, arquivos, envio, contrato de resposta, CSP e segurança.
---

# Usar o AlpineForm em um projeto

Referência completa com exemplos testados: `docs-src/pages/*.html` (ou `docs/index.html`). Este guia diz **o que fazer**; a página indicada mostra **todos os detalhes**.

## 1. Carregamento (ordem obrigatória)

```html
<script src="/js/alpine-form/alpine-form.min.js"></script>            <!-- sempre -->
<script src="/js/alpine-form/alpine-form-masks.min.js"></script>      <!-- só se usar data-form-mask -->
<script src="/js/alpine-form/alpine-form-chunks.min.js"></script>     <!-- só se usar data-form-chunked -->
<script src="/js/alpine-form/alpine-form-inspectors.min.js"></script> <!-- só se usar csv/json/pdf_signature/... -->
<script src="/js/alpine-form/alpine-form-bootstrap.min.js"></script>  <!-- só com data-form-ui="bootstrap" -->
<script src="/js/alpine-form/alpine-form-rascunho.min.js"></script>   <!-- só se usar data-form-rascunho -->
<script src="/js/alpine-form/alpine-form-lista.min.js"></script>      <!-- só se usar x-lista / data-form-lista -->
<script src="/js/alpine-form/alpine-form-opcoes.min.js"></script>     <!-- só se usar data-form-opcoes -->
<script src="/js/app.js"></script>                                    <!-- extensões, configure(), Alpine.data() -->
<script defer src="/js/alpine.min.js"></script>                       <!-- SEMPRE por último, com defer -->
```

- O Alpine **não** vem junto. Arquivos em `dist/` (`.min.js` produção, `.js` legível, `.esm.js` para bundler).
- Atributo de módulo não carregado = erro de configuração (o envio é bloqueado).
- Detalhes: `docs-src/pages/instalacao.html` (HTML puro, Joomla, Laravel, Vite).

## 2. Formulário mínimo

```html
<form x-data x-form action="/api/clientes" method="post" novalidate>
    <label for="nome">Nome</label>
    <input id="nome" name="nome" data-form-v="required|min:3">
    <button type="submit" x-bind:disabled="$form.submitting">Salvar</button>
    <p data-form-status></p>
</form>
```

Checklist: `x-data` (no form ou ancestral) + `x-form` + `novalidate` + `name` em todo campo + `<label>` associado.

## 3. Decisões rápidas

| Necessidade | Como |
|---|---|
| Regras | `data-form-v="required|min:3|email"` — lista completa em `docs-src/pages/regras.html`. Não invente regras: regra desconhecida é erro. |
| Mensagem própria | `data-form-msg.<regra>="..."`, placeholders `:field`, `:min`, `:max`, `:other`… |
| Nome no erro | `data-form-label="CPF do responsável"` (senão o `<label>`) |
| Quando validar | `data-form-validation="live"` (padrão) · `input` · `blur` · `change` · `submit` |
| Confirmação de senha | `data-form-v="required|same:senha"` |
| Obrigatório condicional | `required_if:tipo,pj`, `required_without:telefone` |
| Campo que aparece/some | `x-show` + `data-form-hidden="skip"` · `:disabled` · `x-if` (ver `condicionais.html`) |
| Checar no servidor (e-mail livre) | `data-form-remote="/api/..."` → servidor responde `{ "valid": bool, "message": "..." }` |
| Máscara | `data-form-mask="cpf|cnpj|cpf_cnpj|cep|telefone_br|celular|currency|decimal|percent|date|time|card|pattern"` + **sempre** a regra correspondente |
| Enviar sem máscara | `data-form-submit-value="raw"` (moeda/data já enviam canônico: `1234.50`, `2026-12-31`) |
| Arquivos | `type="file"` + `file_max:5MB`, `ext:pdf`, `image`, `files_max:5`; lista com `<div data-form-file-list="campo">` |
| Arquivo grande | módulo chunks + `data-form-chunked data-form-chunk-endpoint="/api/uploads"` |
| Progresso/cancelar | `[data-form-progress]`, `[data-form-progress-bar]`, `[data-form-status]`, `[data-form-cancel]` |
| Processamento demorado | servidor responde 202 com `job` (ver `processamento.html`) |
| JSON em vez de multipart | `data-form-encoding="json"` (arquivos não vão em JSON) |
| Laravel / Joomla | `data-form-response-adapter="laravel"` / `"joomla"` |
| Evitar pedido duplicado | `data-form-idempotency` + servidor idempotente |
| Reagir a sucesso | `@form:success="..."` ou `form.addEventListener('form:success', ...)` |
| Bootstrap 5 | módulo bootstrap + `data-form-ui="bootstrap"` |
| Não perder o que foi digitado (rascunho) | módulo rascunho + `<form id="x" data-form-rascunho>`; `data-form-rascunho-sessao` para sumir ao fechar a aba; `data-form-rascunho-ignorar` no campo. Senha/sensível/arquivo nunca são guardados. Evite em dados pessoais/financeiros (ver `rascunho.html`) |
| Select que depende de outro (UF → cidade) / opções da API | módulo opcoes + `<select name="cidade" data-form-opcoes="/api/cidades?uf={uf}"><option value="">…</option></select>`; edição: `<option selected>` do servidor ou `data-form-opcoes-selecionado`; ver `opcoes.html` |
| Tabela/lista paginada vinda da API | módulo lista + `<section id="x" x-data x-lista data-lista-url="/api/...">` com `x-for="item in $lista.itens"`, `data-lista-filtros`, `data-lista-ordenar`, `<nav data-lista-paginacao>`, `data-lista-url-sincronizar`. Servidor: `page`/`per_page`/`sort`/`direction`, ordenação por lista branca (ver `lista.html`) |
| Backend PHP sem framework (ou Joomla 3) | `php/alpine-form.php`: `Resposta::sucesso/invalido/erro`, `Entrada::ler()`, `Validador` (mesmas regras do HTML), `Consulta::ler($_GET, ['ordenaveis' => [...]])` para listagens; ver `php.html` |
| Atualizar listas depois de cadastrar/excluir | `data-form-lista="idDaLista grupo"` no `<form>`; `data-lista-destacar` na lista para realçar `data.id` |

Para o formulário completo de um caso comum, comece pelas receitas: `docs-src/pages/receitas.html` (cadastro PF/PJ, CEP, login, senha, pedido com itens, wizard, avatar, importação CSV, modal, busca).

## 4. Contrato do backend

```json
// sucesso (HTTP 200)
{ "success": true, "message": "Salvo.", "data": { "id": 7 } }
// falha (HTTP 422, ou 200 com success:false)
{ "success": false, "message": "Confira os campos.", "errors": { "email": ["Já cadastrado."], "itens.0.qtd": "Mínimo 1." } }
```

- Chaves de `errors` = `name` do campo (aceita `itens[0][qtd]` ou `itens.0.qtd`); chave sem campo, `""` ou `"_general"` → resumo.
- HTTP 200 com `success:false` é falha. 204 é sucesso. HTML na resposta vira erro `html` (sessão expirada?).
- **O servidor sempre revalida tudo.** Exemplos de controller: `docs-src/pages/backend.html` (PHP puro, Joomla 3/4/5, Laravel).
- CSRF: `<meta name="csrf-token">` → cabeçalho `X-CSRF-TOKEN` (Laravel); no Joomla, `HTMLHelper::_('form.token')` dentro do form.

## 5. Ambiente regulado (banco etc.)

Siga `.claude/skills/alpine-form-seguranca/SKILL.md`. No mínimo:

```js
AlpineForm.configure({ log: 'none', storage: 'none', idempotency: true })
```

Com CSP sem `'unsafe-eval'`: use `@alpinejs/csp`; nas expressões do HTML só caminhos de propriedade (`$form.submitting`, `ehPj`), sem `x-model` e sem `x-form="{...}"` — lógica em `Alpine.data()` num arquivo JS (modelo: `examples/csp.php` + `examples/csp-app.js`).

## 6. Erros comuns (e o que fazer)

| Sintoma | Causa provável |
|---|---|
| Nada acontece | falta `x-data`; Alpine carregado antes do AlpineForm; `AlpineForm.diagnose()` no console |
| Balões do navegador | falta `novalidate` |
| "Regra desconhecida" / "Atributo desconhecido" | erro de digitação ou módulo não carregado |
| `$form.getValue(...)` quebra em `x-text` | os campos ainda não existem no 1º render: `x-text="$form.ready ? $form.getValue('x') : ''"` |
| Erro do servidor não aparece no campo | chave de `errors` diferente do `name` |
| 100% e parado | normal: fase `awaiting` (servidor processando) |

Lista completa: `docs-src/pages/erros-e-solucoes.html`.

## 7. Verificação

- Abra a página com o console aberto: nenhum erro `[AlpineForm]`.
- `AlpineForm.get('idDoForm').configErrors` deve ser `[]`; `.diagnostics()` mostra regras e dependências.
- Teste envio válido, inválido (422) e servidor fora do ar.
