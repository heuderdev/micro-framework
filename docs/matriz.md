# Matriz requisito → módulo → teste

Legenda: **U** = `tests/unit/*.test.js` (Vitest + jsdom + Alpine real, rede simulada por transporte registrado) · **P** = `server/tests/*` (PHP, backend real) · **E** = `tests/e2e/*.spec.js` (Chrome real + backend PHP real).

| Requisito | Módulo(s) | Testes |
|---|---|---|
| Parser de regras, escapes, erros de configuração | `core/rule-parser.js`, `core/config.js` | U `parser.test.js` (16); U `validation.test.js` › regra desconhecida, atributo malformado, configuração inválida no form |
| Mensagens e precedência; texto puro | `core/messages.js`, `ui/default-adapter.js` | U `validation.test.js` › precedência, label, mensagem do servidor é texto puro |
| Tipos de campo, zero/false/arrays | `core/field.js`, `validators/presence.js` | U `validation.test.js` › zero e "0", min/max por tipo, checkbox/radio, desabilitados, hidden |
| Datas estritas | `lib/date.js`, `validators/dates.js` | U `lib.test.js` › datas; U `validation.test.js` › datas estritas |
| Decimal exato | `lib/decimal.js`, `validators/numbers.js` | U `lib.test.js`; U `validation.test.js` › decimal com precisão exata |
| Dependências e ciclos | `core/controller.js` (dependências) | U `validation.test.js` › revalida dependente, required_if, ciclos; E `cadastro.spec.js` (confirmação de senha) |
| Validação ao vivo, debounce, IME | `core/controller.js` | U `validation.test.js`; E `cadastro.spec.js` |
| Async fora de ordem / remota | `core/remote.js` | U `validation.test.js` › resposta obsoleta, inconclusivo, cache, GET sensível; E `cadastro.spec.js` (e-mail) |
| DOM dinâmico, condicionais, linhas repetidas | `core/controller.js` (MutationObserver) | U `dynamic.test.js` (x-for, x-if, regras dinâmicas, ocultos, reindexação) |
| Estabilidade do DOM (sem ciclo de re-renderização) | `core/controller.js`, `ui/progress-ui.js` | U `dynamic.test.js` › UI gerada não dispara refresh em ciclo; E `erros-e-paginas.spec.js` (19 páginas, 0 mutações em repouso) |
| Múltiplos formulários isolados | `core/controller.js` | U `dynamic.test.js`; E `uploads.spec.js` (3 forms em progresso), `erros-e-paginas.spec.js` (Laravel/padrão) |
| Nomes repetidos, submitter, `form="id"` | `core/serializer.js` | U `submit.test.js` › ordem do HTML, formaction, controles fora da árvore |
| JSON aninhado e prototype pollution | `core/serializer.js`, `lib/paths.js` | U `submit.test.js`; U `lib.test.js` › bloqueia prototype pollution |
| CSRF e cabeçalhos | `core/controller.js` | U `submit.test.js` › CSRF só mesma origem; E (todas as requisições dos exemplos passam pela verificação de CSRF do backend) |
| 200 com success:false; 204; HTML; erro sem campo | `transport/response.js` | U `submit.test.js`; E `erros-e-paginas.spec.js` |
| 422 por caminho, arrays, arquivo individual; Laravel/Joomla | `transport/response.js`, `lib/paths.js` | U `submit.test.js`; E `erros-e-paginas.spec.js` |
| Redirecionamento seguro | `core/controller.js` | U `submit.test.js`; E `erros-e-paginas.spec.js` |
| Submit duplicado | `core/controller.js` | U `submit.test.js` › mesma Promise |
| Progresso real; 100% ≠ concluído; indeterminado | `transport/xhr.js`, `transport/fetch.js`, `transport/progress.js` | U `submit.test.js` › fases; E `uploads.spec.js` (8 MB real, fetch indeterminado) |
| Cancelamento e timeout (resultado desconhecido) | `transport/*`, `core/controller.js` | U `submit.test.js`; E `uploads.spec.js` |
| Idempotência | `core/controller.js`, `server/src/Idempotency.php` | U `submit.test.js`; P `QueueAndIdempotencyTest.php`; E `cadastro.spec.js` (cabeçalho) |
| Arquivos: remoção, duplicados, regras por arquivo | `files/file-manager.js`, `validators/files.js` | U `files.test.js`; E `uploads.spec.js` › arquivo removido não é enviado |
| Cleanup de object URLs | `files/file-manager.js` | U `files.test.js` › previews revogados; E `uploads.spec.js` |
| Arquivos existentes (edição) | `files/file-manager.js` | U `files.test.js` › existentes |
| Imagem (dimensões, decodificação) | `files/image-inspector.js` | U `files.test.js` |
| CSV por amostragem, JSON, PDF/XLSX | `inspectors/*` | U `files.test.js` |
| Chunks: concorrência, retry sem dupla contagem, 409 | `chunks/chunk-upload.js`, `server/src/ChunkStore.php` | U `chunks.test.js`; P `ChunkStoreTest.php`, `ConcurrencyTest.php` |
| Chunks: pausa/retomada, persistência, sessão expirada, finalização falha | `chunks/*` | U `chunks.test.js`; E `uploads.spec.js` (pausa/retomada e DELETE no backend real) |
| Polling de processamento | `jobs/poller.js`, `server/src/JobQueue.php`, `server/bin/worker.php` | P `QueueAndIdempotencyTest.php`; E `uploads.spec.js` (worker real) |
| Reset e destroy | `core/controller.js` | U `submit.test.js` › reset, reset nativo, destroy, remoção do form; U `masks-integration.test.js` › destroy |
| Segurança de mensagens e eventos | `core/messages.js`, `core/events.js` | U `validation.test.js`; U `submit.test.js` › eventos não expõem senha |
| Acessibilidade (ARIA, foco, resumo) | `ui/default-adapter.js` | U `validation.test.js` › aria-describedby, resumo role=alert e foco; E `cadastro.spec.js` (aria-invalid, foco) |
| Máscaras: motor, cursor, colagem, seleção, IME, moeda | `masks/*` | U `masks-engine.test.js` (27); U `masks-integration.test.js` (11); E `mascaras.spec.js` (cursor e colagem em navegador real) |
| Máscaras: representações na validação/envio; remota | `masks/runtime.js`, `core/field.js` | U `masks-integration.test.js`; E `mascaras.spec.js` (corpo JSON), `cadastro.spec.js` (CPF raw no multipart) |
| Backend: validação, inspeção de upload, nomes | `server/src/Validator.php`, `UploadInspector.php` | P `ValidationTest.php` |
| Exemplos carregam sem erros | `examples/*` | E `erros-e-paginas.spec.js` (19 páginas) |
