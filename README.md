# AlpineForm

Micro-framework declarativo de formulários sobre **Alpine.js 3**. Regras, mensagens, máscaras e comportamento de envio ficam nos próprios inputs; nenhum campo precisa ser registrado em JavaScript.

```html
<form x-data x-form action="/api/cadastro" method="post" novalidate>
    <input name="nome" data-form-v="required|min:3" data-form-msg.min="Digite pelo menos :min caracteres.">
    <input name="cpf" data-form-mask="cpf" data-form-v="required|cpf" data-form-submit-value="raw">
    <button type="submit" :disabled="$form.submitting">Enviar</button>
    <p data-form-status></p>
</form>
```

O que a biblioteca faz:

- validação ao vivo (blur → revalida ao digitar), por envio, por campo ou por grupo; dependências entre campos (`same`, `required_if`, comparações de data) com detecção de ciclos;
- validação remota e regras assíncronas com cancelamento (`AbortSignal`), debounce, cache e descarte de respostas obsoletas;
- serialização fiel ao HTML (ordem, nomes repetidos, submitter, controles com `form="id"`), em multipart, urlencoded ou JSON aninhado sem *prototype pollution*;
- envio por XHR com **progresso real** de upload; distinção entre *enviado 100%*, *aguardando resposta* e *concluído*; cancelamento, timeout, `Idempotency-Key`;
- associação de erros do servidor aos campos (inclusive `itens.0.nome`, `jform[title]`, arquivo individual) e resumo de erros sem campo; adaptadores Laravel e Joomla;
- arquivos: lista interna como fonte de verdade, remoção, duplicados, preview com revogação de object URLs, dimensões de imagem, arquivos existentes em edição;
- módulos opcionais: **máscaras** (motor próprio com cursor/seleção/colagem/IME), **chunks** (upload em partes com pausa, retomada, SHA-256 e backend real), **inspetores** (CSV por amostragem, JSON, PDF/XLSX, mídia) e **Bootstrap 5**;
- processamento assíncrono após upload (HTTP 202 + polling sem sobreposição).

## Instalação e ordem de carregamento

Sem bundler (IIFE): o núcleo primeiro, depois os módulos opcionais, e **o Alpine por último, com `defer`**.

```html
<script src="/dist/alpine-form.min.js"></script>
<script src="/dist/alpine-form-masks.min.js"></script>     <!-- opcional -->
<script src="/dist/alpine-form-chunks.min.js"></script>    <!-- opcional -->
<script src="/dist/alpine-form-inspectors.min.js"></script><!-- opcional -->
<script defer src="/caminho/alpine.min.js"></script>
<link rel="stylesheet" href="/css/alpine-form.css">        <!-- opcional -->
```

Com bundler (ESM):

```js
import Alpine from 'alpinejs'
import AlpineFormPlugin, { AlpineForm } from 'alpine-form'
import masks from 'alpine-form/masks'
import chunks from 'alpine-form/chunks'

AlpineForm.use(masks).use(chunks)
Alpine.plugin(AlpineFormPlugin)
Alpine.start()
```

`x-form` precisa estar dentro de um componente Alpine (`x-data` no `<form>` ou num ancestral). Formulários não inicializados são listados por `AlpineForm.diagnose()` e avisados no console.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/index.html](docs/index.html) | **Guia completo com exemplos** (26 páginas: instalação, validação, regras, máscaras, arquivos, envio, backend PHP/Joomla/Laravel, receitas, referência rápida, erros e soluções). Abra direto no navegador ou em `npm run serve` → `/docs/index.html` |
| [docs/contrato.md](docs/contrato.md) | Contrato final: atributos HTML, regras, máscaras, API `$form`, estado, eventos, API global |
| [docs/integracao.md](docs/integracao.md) | Contrato de resposta do backend, CSRF, Laravel/Joomla, chunks, jobs, segurança |
| [docs/extensao.md](docs/extensao.md) | Validadores, normalizadores, máscaras, transportes, adaptadores, componentes, plugins |
| [docs/limitacoes.md](docs/limitacoes.md) | Tabela de limitações e decisões |
| [docs/matriz.md](docs/matriz.md) | Matriz requisito → módulo → teste |
| `doc.html` | Documentação técnica aprofundada (arquitetura e funcionamento interno) |

## Arquitetura (resumo)

```
x-form (diretiva Alpine) ──► FormController (um por <form>, estado reativo isolado = $form)
   │                            ├─ Field ×N ......... descoberta, leitura de valores, representações, regras
   │                            ├─ rule-parser ...... data-form-v → regras compiladas (erro em regra desconhecida)
   │                            ├─ validators ....... registro de regras síncronas/assíncronas
   │                            ├─ remote ........... validação remota (abort, debounce, cache, inconclusivo)
   │                            ├─ serializer ....... FormData / urlencoded / JSON aninhado
   │                            ├─ transport ........ xhr (progresso real) | fetch | registrados
   │                            ├─ response ......... adaptadores default | laravel | joomla
   │                            ├─ JobPoller ........ 202 + polling
   │                            ├─ FileManager ...... lista interna de arquivos, previews, existentes
   │                            ├─ UI adapter ....... erros, ARIA, resumo, lista de arquivos (default | bootstrap)
   │                            └─ ProgressUi ....... data-form-progress-*, data-form-status, botões
   └─ registry ◄── plugins opcionais: masks, chunks, inspectors, bootstrap (somente API pública)
```

O núcleo não depende dos módulos opcionais: um atributo de módulo não carregado (`data-form-mask`, `data-form-chunked`…) é **erro de configuração explícito**, nunca ignorado.

## Estrutura de diretórios

```
src/
  index.js, cdn.js            entrada ESM e IIFE do núcleo
  core/                       controller, field, config, rule-parser, messages, remote, serializer, registry, eventos, erros
  validators/                 presença, texto, números, comparação, datas, Brasil, cartões, arquivos
  transport/                  xhr, fetch, response (adaptadores), progress, retry
  files/                      file-manager, image-inspector
  jobs/poller.js              polling de processamento
  ui/                         default-adapter, progress-ui, bootstrap
  masks/                      módulo opcional de máscaras (motores de padrão e numérico)
  chunks/                     módulo opcional de upload em partes
  inspectors/                 módulo opcional de inspeção de arquivos
  lib/                        utilidades (decimal exato, datas, tamanhos, caminhos, DOM, cartões, BR)
css/alpine-form.css           CSS mínimo opcional
dist/                         saída do build (ESM, IIFE, IIFE minificado)
server/                       backend PHP de referência (router, API, chunks, fila, worker, testes)
examples/                     páginas executáveis (PHP embutido)
tests/unit/                   Vitest + jsdom (integração com Alpine real, rede simulada)
tests/e2e/                    Playwright em Chrome real contra o backend PHP real
```

## Build, execução e testes

Requisitos: Node ≥ 18, PHP ≥ 8.1 (extensões padrão; `fileinfo` recomendada), Google Chrome para E2E.

```bash
npm install
npm run build          # gera dist/ (ESM, IIFE, IIFE minificado) e dist/sizes.json
npm run serve          # http://127.0.0.1:8080/examples/
php server/bin/worker.php   # em outro terminal, para o exemplo de processamento
```

| Comando | O que executa | Tipo |
|---|---|---|
| `npm test` | 168 testes Vitest/jsdom com Alpine real | integração; **rede simulada** por transportes registrados |
| `npm run test:php` | 28 testes do backend (chunks, concorrência com processos reais, fila, idempotência, validação) | backend real, sem HTTP |
| `npm run test:e2e` | 44 testes Playwright no Chrome instalado, servidor PHP embutido e worker real | **tudo real** (rede, navegador, backend) |
| `npm run test:all` | build + os três acima | |
| `npm run docs:check` | gera `docs/*.html` a partir de `docs-src/` e confere atributos, regras, máscaras, métodos e links de todos os exemplos contra a biblioteca | estático |
| `npm run docs:serve` | gera e serve a documentação em `http://localhost:1900` (técnica em `/tecnica`); no Windows também `docs-servidor.bat` | servidor |
| `npm run docs:browser` | carrega cada exemplo HTML da documentação no Chrome (servidor em 127.0.0.1:8099) | navegador real |

Último resultado executado (2026-10-09): unitários 168/168, PHP 28/28 (PHP 8.4.2), E2E 44/44 (Chrome).

O Playwright usa `channel: 'chrome'` (Chrome instalado). Para usar o Chromium do Playwright: `npx playwright install chromium` e `PW_CHANNEL= npm run test:e2e`.

Tamanho (minificado / gzip): núcleo 143,8 / 44,9 KiB; máscaras 21,7 / 7,8; chunks 19,5 / 6,7; inspetores 9,1 / 3,7; Bootstrap 1,6 / 0,8.

## Documentação em Docker (porta 1900)

```bash
docker compose up -d --build          # http://localhost:1900  ·  técnica: http://localhost:1900/tecnica
docker compose logs -f docs
docker compose down
```

Sem Compose: `docker build -t alpineform-docs . && docker run -d -p 1900:1900 --restart unless-stopped alpineform-docs`.
O build gera as páginas a partir de `docs-src/` (Node) e serve com nginx (`docker/nginx-docs.conf`). A imagem contém só a documentação, não a biblioteca nem o backend PHP dos exemplos.

## Exemplos

`npm run serve` e abra `http://127.0.0.1:8080/examples/`. Todos usam o backend de referência (`/api/*`), nunca URLs públicas fictícias:

cadastro com validação ao vivo, senha e confirmação · campos condicionais · validação remota · radios/checkboxes/select múltiplo · linhas repetidas · arquivo único · múltiplos arquivos com remoção · imagem e preview · CSV por amostragem · edição com arquivos existentes · upload grande com progresso e cancelamento · chunks com pausa/retomada · processamento após upload · erros Joomla/Laravel · máscaras CPF/CNPJ/telefone/CEP/moeda/padrão · Bootstrap · extensões · ESM.

## Licença

MIT.
