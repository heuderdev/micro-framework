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
- módulos opcionais: **máscaras** (motor próprio com cursor/seleção/colagem/IME), **chunks** (upload em partes com pausa, retomada, SHA-256 e backend real), **inspetores** (CSV por amostragem, JSON, PDF/XLSX, mídia), **rascunho** (guarda o que foi digitado e devolve ao reabrir a página), **listagens** (`x-lista`: paginação, ordenação, filtros com espera, URL compartilhável, seleção em lote, rolagem infinita, exportação CSV com filtro e completa, e atualização após cadastro com `data-form-lista`), **selects dependentes** (`data-form-opcoes="/api/cidades?uf={uf}"`), **autopreenchimento** (CEP → endereço, CNPJ → empresa, sem apagar o que foi digitado), **avisos e confirmação** (toasts e `data-form-confirmar`), **autocompletar** acessível e **Bootstrap 5**;
- processamento assíncrono após upload (HTTP 202 + polling sem sobreposição).

## Instalação e ordem de carregamento

Sem bundler (IIFE): o núcleo primeiro, depois os módulos opcionais, e **o Alpine por último, com `defer`**.

```html
<script src="/dist/alpine-form.min.js"></script>
<script src="/dist/alpine-form-masks.min.js"></script>     <!-- opcional -->
<script src="/dist/alpine-form-chunks.min.js"></script>    <!-- opcional -->
<script src="/dist/alpine-form-inspectors.min.js"></script><!-- opcional -->
<script src="/dist/alpine-form-rascunho.min.js"></script>  <!-- opcional -->
<script src="/dist/alpine-form-lista.min.js"></script>     <!-- opcional -->
<script src="/dist/alpine-form-opcoes.min.js"></script>    <!-- opcional -->
<script src="/dist/alpine-form-preencher.min.js"></script> <!-- opcional -->
<script src="/dist/alpine-form-avisos.min.js"></script>    <!-- opcional -->
<script src="/dist/alpine-form-autocompletar.min.js"></script><!-- opcional -->
<!-- ou, no lugar do núcleo e de todos os módulos: <script src="/dist/alpine-form-completo.min.js"></script> -->
<script defer src="/caminho/alpine.min.js"></script>
<link rel="stylesheet" href="/css/alpine-form.css">        <!-- opcional -->
```

Com bundler (ESM):

```js
import Alpine from 'alpinejs'
import AlpineFormPlugin, { AlpineForm } from 'alpine-form'
import masks from 'alpine-form/masks'
import chunks from 'alpine-form/chunks'
import rascunho from 'alpine-form/rascunho'
import lista from 'alpine-form/lista'
import opcoes from 'alpine-form/opcoes'
import preencher from 'alpine-form/preencher'
import avisos from 'alpine-form/avisos'
import autocompletar from 'alpine-form/autocompletar'

AlpineForm.use(masks).use(chunks).use(rascunho).use(lista).use(opcoes).use(preencher).use(avisos).use(autocompletar)
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
   └─ registry ◄── plugins opcionais: masks, chunks, inspectors, bootstrap, rascunho, lista, opcoes, preencher, avisos, autocompletar (somente API pública)
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
  rascunho/                   módulo opcional de rascunho automático (localStorage/sessionStorage)
  opcoes/                     módulo opcional de selects dependentes (opções da API, cadeias UF → cidade)
  preencher/                  módulo opcional de autopreenchimento (CEP → endereço, CNPJ → empresa)
  avisos/                     módulo opcional de avisos (toasts) e confirmação
  completo/                   pacote único: núcleo + todos os módulos (alpine-form-completo)
  autocompletar/              módulo opcional de autocompletar (combobox acessível com sugestões da API)
  lista/                      módulo opcional de listagens (x-lista: paginação, filtros, ordenação, seleção)
  lib/                        utilidades (decimal exato, datas, tamanhos, caminhos, DOM, cartões, BR)
css/alpine-form.css           CSS mínimo opcional
php/alpine-form.php           helpers PHP 7.0+ (Resposta, Entrada, Validador, Consulta, Csv, Csrf) e php/tests/
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
| `npm test` | 263 testes Vitest/jsdom com Alpine real | integração; **rede simulada** por transportes registrados |
| `npm run test:php` | 34 testes do backend (chunks, concorrência com processos reais, fila, exportação em segundo plano, idempotência, validação) + 25 dos helpers PHP (carga: `npm run test:php:carga`) | backend real, sem HTTP |
| `npm run test:e2e` | 71 testes Playwright (inclui CSP estrita e Trusted Types) no Chrome instalado, servidor PHP embutido e worker real | **tudo real** (rede, navegador, backend) |
| `npm run test:all` | build + os três acima | |
| `npm run docs:check` | gera `docs/*.html` a partir de `docs-src/` e confere atributos, regras, máscaras, métodos e links de todos os exemplos contra a biblioteca | estático |
| `npm run docs:serve` | gera e serve a documentação em `http://localhost:1900` (técnica em `/tecnica`); no Windows também `docs-servidor.bat` | servidor |
| `npm run docs:browser` | carrega cada exemplo HTML da documentação no Chrome (servidor em 127.0.0.1:8099) | navegador real |

Último resultado executado (2026-10-10): unitários 263/263, PHP 34/34 + helpers 25/25 (PHP 8.4.2; helpers também em 7.1 e 8.5), E2E 71/71 (Chrome).

O Playwright usa `channel: 'chrome'` (Chrome instalado). Para usar o Chromium do Playwright: `npx playwright install chromium` e `PW_CHANNEL= npm run test:e2e`.

Tamanho (minificado / gzip): núcleo 144,9 / 45,2 KiB; máscaras 21,8 / 7,8; chunks 19,7 / 6,8; inspetores 9,1 / 3,7; Bootstrap 1,6 / 0,8; rascunho 3,5 / 1,5; listagens 37,6 / 11,4; opções 11,6 / 4,2; autopreenchimento 10,9 / 3,9; avisos 6,6 / 2,5; autocompletar 14,2 / 4,9; pacote completo (núcleo + todos) 266,2 / 80,3.

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

## Para assistentes de IA

| Arquivo | Lido por |
|---|---|
| `AGENTS.md` | Fonte única: mapa do código, comandos, invariantes, fluxo de mudança, armadilhas. Lido por Codex, Cursor, Copilot, Jules, Aider e outros |
| `CLAUDE.md` | Claude Code (importa o `AGENTS.md`) |
| `GEMINI.md` | Gemini CLI (importa o `AGENTS.md`) |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.claude/skills/alpine-form-{usar,desenvolver,documentar,seguranca}/SKILL.md` | Skills do Claude Code; Markdown comum, citado no `AGENTS.md` para as demais IAs |
| `.claude/agents/alpine-form-{integrador,revisor,testador,documentador}.md` | Subagentes do Claude Code |

## Licença

MIT.
