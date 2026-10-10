# Limitações e decisões

| Área | Limitação / decisão | Consequência | Alternativa |
|---|---|---|---|
| Segurança | Validação no navegador é conveniência, não proteção | O backend precisa revalidar tudo | Backend de referência refaz todas as verificações |
| Inicialização | `x-form` só funciona dentro de um componente Alpine | Form sem `x-data` (próprio ou ancestral) não inicializa | `AlpineForm.diagnose()` lista e avisa no console |
| HTML | Formulários aninhados não são suportados | `ConfigError` | `form="id"` nos controles ou formulários separados |
| Configuração | Atributo/regra desconhecidos são erro, nunca ignorados | Erros de digitação bloqueiam o campo e o envio | Carregar o módulo correspondente ou corrigir a grafia |
| Progresso | Só o transporte XHR tem progresso real de upload | `fetch` mostra progresso indeterminado | Use `xhr` (padrão) para uploads |
| Progresso | Em multipart, `loaded/total` são bytes do corpo HTTP (inclui boundaries) | Diferença pequena em relação ao tamanho dos arquivos | Chunks medem bytes úteis |
| Progresso | Não existe progresso por arquivo num único multipart | — | Upload em partes (uma sessão por arquivo) |
| Progresso | Velocidade (janela de 3 s) e ETA são estimativas | Oscilam em redes instáveis | — |
| CORS | Listeners de upload tornam a requisição "não simples" | Preflight `OPTIONS` obrigatório em outra origem | Servidor deve responder ao preflight |
| Resultado | Timeout ou queda após o upload completo = resultado desconhecido | Sem reenvio automático | `data-form-idempotency` + backend idempotente |
| Chunks | Após recarregar, o navegador não mantém acesso ao arquivo | Usuário precisa selecionar o mesmo arquivo de novo | Somente metadados ficam no `localStorage` |
| Chunks | Identificação do arquivo usa nome, tamanho, data e hash de amostras | Identificação rápida, não prova de integridade | SHA-256 por parte + manifesto verificados no servidor |
| Chunks | `crypto.subtle` exige contexto seguro | Sem HTTPS/localhost, sem hash por parte | Servir por HTTPS |
| Chunks | Sessão expirada é recriada uma vez | Envio recomeça do zero | Ajustar validade no servidor |
| Jobs | "Parar de acompanhar" não cancela o trabalho | Processamento segue no servidor | `$form.cancelJob()` (DELETE), se o backend suportar |
| Jobs | Percentual só quando o backend informa (0–100) | Sem informação, barra indeterminada | — |
| Máscaras | Desfazer (Ctrl+Z) usa a pilha do navegador | Pode pular estados intermediários | — |
| Máscaras | Máscara não substitui validação | Valor formatado pode ser inválido (ex.: CPF com dígito errado) | Combinar `data-form-mask` com `data-form-v` |
| Máscaras | `type=number` não aceita máscara | `ConfigError` | `type=text` com `inputmode` (a máscara define) |
| Máscaras | Agrupamento de milhar fixo em grupos de 3 | Locales como `en-IN` não são reproduzidos | — |
| Máscaras | Casas além da escala são descartadas, não arredondadas | `1,239` com escala 2 vira `1,23` | — |
| Datas | Formatos ambíguos são rejeitados; `today` usa o relógio local | Fuso do usuário define "hoje" | `configure({ clock })` |
| Brasil | CEP e telefone validam formato, não existência | — | Validação remota |
| Arquivos | O navegador não permite reescrever `input.files` em todos os casos | A lista interna é a fonte de verdade do envio | — |
| Arquivos | Preview apenas para imagens raster (SVG nunca) até 20 MB | — | `data-form-preview` |
| Inspetores | CSV é inspecionado por amostragem (início do arquivo) | Erros no fim do arquivo não são detectados no cliente | Validação completa no servidor |
| Serialização | JSON com arquivo é erro, salvo `data-form-json-files="metadata"` | Conteúdo do arquivo não vai em JSON | multipart ou chunks |
| Tamanho | Núcleo: 143,8 KiB minificado / 44,9 KiB gzip | Maior que micro-bibliotecas de validação | Módulos opcionais carregados só quando necessários |
| Backend de referência | Servidor embutido do PHP é single-thread | Requisições longas bloqueiam as demais | Usar PHP-FPM/Apache/Nginx em produção |
| Backend de referência | Armazenamento em arquivos com `flock` | Adequado a um servidor; não a vários nós sem disco compartilhado | Trocar `ChunkStore`/`JobQueue` por banco/objeto |
| Testes | Testes unitários usam jsdom e transporte simulado | Layout, cursor real e rede real não são cobertos ali | Cobertos pela suíte E2E em Chrome real |
| Navegadores | Alvo de build: Chrome/Edge 92+, Firefox 90+, Safari 15+ | Navegadores antigos não são suportados | — |
| Navegadores | E2E executado apenas no Chrome | Firefox/Safari não verificados automaticamente | Rodar Playwright com outros projetos |
| CSP | O Alpine padrão exige `'unsafe-eval'`; a biblioteca funciona com a versão CSP do Alpine (testado, inclusive com Trusted Types), mas nela as expressões do HTML só aceitam caminhos de propriedade e `x-model` não funciona | Lógica em `Alpine.data()`; ver `examples/csp.php` e `docs/seguranca.html` |
| Validação remota | "Valor já cadastrado" permite descobrir quem é cliente (enumeração) | Limite de tentativas no servidor ou não usar em telas públicas |
| Avisos de ordem de carregamento | Os avisos de `cdn.js` (módulo carregado fora de ordem) são emitidos antes de qualquer `configure()` e não respeitam `log: 'none'`; não contêm dados | Carregar os scripts na ordem documentada |
