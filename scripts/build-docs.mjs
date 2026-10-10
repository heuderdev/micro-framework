/**
 * Gera docs/*.html a partir dos fragmentos em docs-src/pages/.
 *
 *   node scripts/build-docs.mjs      (ou: npm run docs)
 *
 * Formato de um fragmento:
 *   titulo: Título da página
 *   lead: Frase de abertura (HTML permitido)
 *   ---
 *   <h2 id="...">...</h2> ... HTML livre ...
 *
 * Blocos de código são escritos sem escapar, entre marcadores:
 *   @@@html Título opcional
 *   <form x-data x-form>...</form>
 *   @@@
 * Linguagens: html, js, php, sql, txt.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const PAGES = [
    { grupo: 'Começando' },
    { arquivo: 'index', menu: 'Início', busca: 'visão geral introdução o que é' },
    { arquivo: 'instalacao', menu: 'Instalação', busca: 'dist scripts ordem carregamento alpine esm vite joomla laravel cdn' },
    { arquivo: 'primeiros-passos', menu: 'Primeiros passos', busca: 'primeiro formulário passo a passo começar' },
    { arquivo: 'conceitos', menu: 'Conceitos', busca: 'campo chave fase estado precedência configuração representação raw canonical' },
    { grupo: 'Formulários' },
    { arquivo: 'validacao', menu: 'Validação', busca: 'live blur submit debounce mensagens label errors first all show valid' },
    { arquivo: 'regras', menu: 'Regras', busca: 'required min max email cpf cnpj data same between numeric decimal arquivo' },
    { arquivo: 'tipos-de-campo', menu: 'Tipos de campo', busca: 'text select radio checkbox multiple hidden textarea date number disabled readonly sensitive senha componente' },
    { arquivo: 'condicionais', menu: 'Condicionais e dependências', busca: 'required_if x-show x-if hidden skip dependente confirmação senha same' },
    { arquivo: 'validacao-remota', menu: 'Validação remota', busca: 'remote servidor e-mail disponível cache inconclusivo debounce' },
    { arquivo: 'mascaras', menu: 'Máscaras', busca: 'cpf cnpj telefone cep moeda dinheiro percentual data hora cartão padrão raw formatted canonical' },
    { arquivo: 'listas-dinamicas', menu: 'Listas e DOM dinâmico', busca: 'x-for linhas itens repetidos múltiplos formulários data-form-for form= refresh' },
    { grupo: 'Envio' },
    { arquivo: 'envio', menu: 'Envio', busca: 'submit json multipart urlencoded get csrf headers idempotência redirect reset native fetch' },
    { arquivo: 'respostas-e-erros', menu: 'Respostas e erros', busca: 'success errors 422 204 html laravel joomla resumo request_id seterrors' },
    { arquivo: 'progresso', menu: 'Progresso e cancelamento', busca: 'barra percentual velocidade eta status cancelar timeout aguardando' },
    { grupo: 'Arquivos' },
    { arquivo: 'arquivos', menu: 'Arquivos', busca: 'upload file múltiplos remover duplicados dropzone arrastar preview imagem existentes edição addfiles' },
    { arquivo: 'inspetores', menu: 'Inspetores de arquivo', busca: 'csv json pdf xlsx mídia duração cabeçalho amostra' },
    { arquivo: 'chunks', menu: 'Upload em partes', busca: 'chunks grande pausar retomar token sha256 sessão' },
    { arquivo: 'processamento', menu: 'Processamento (jobs)', busca: '202 job polling worker fila importação status' },
    { grupo: 'Integração' },
    { arquivo: 'interface', menu: 'Interface e Bootstrap', busca: 'css classes bootstrap resumo erro posição aria acessibilidade' },
    { arquivo: 'api', menu: 'API $form', busca: 'métodos setvalue getvalue validate submit reset destroy alpineform get' },
    { arquivo: 'eventos', menu: 'Eventos e hooks', busca: 'form:success form:error form:change before-submit hooks reveal' },
    { arquivo: 'extensoes', menu: 'Extensões', busca: 'validador próprio normalizador componente transporte adaptador plugin' },
    { arquivo: 'backend', menu: 'Backend (PHP, Joomla, Laravel)', busca: 'controller php joomla jresponsejson laravel resposta contrato csrf token servidor' },
    { grupo: 'Consulta' },
    { arquivo: 'receitas', menu: 'Receitas', busca: 'exemplos prontos completos cadastro login endereço pedido importação' },
    { arquivo: 'referencia-rapida', menu: 'Referência rápida', busca: 'todos atributos regras métodos lista cheat sheet' },
    { arquivo: 'erros-e-solucoes', menu: 'Erros e soluções', busca: 'erro mensagem configuração problema faq não funciona' },
]

const ROOT = new URL('../', import.meta.url)
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function parseFragment(name) {
    const path = new URL(`docs-src/pages/${name}.html`, ROOT)
    if (!existsSync(path)) throw new Error(`Fragmento ausente: docs-src/pages/${name}.html`)
    const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    const split = text.indexOf('\n---\n')
    if (split < 0) throw new Error(`${name}: cabeçalho sem "---"`)
    const meta = {}
    for (const line of text.slice(0, split).split('\n')) {
        const m = /^(\w+):\s*(.*)$/.exec(line)
        if (m) meta[m[1]] = m[2]
    }
    let body = text.slice(split + 5)
    body = body.replace(/^@@@(\w+)(?:[ \t]+(.+))?\n([\s\S]*?)\n@@@$/gm, (_, lang, title, code) => {
        const head = title ? `<div class="titulo-codigo">${escape(title.trim())}</div>` : ''
        return `<div class="codigo">${head}<pre><code data-lang="${lang}">${escape(code)}</code></pre></div>`
    })
    if (/^@@@/m.test(body)) throw new Error(`${name}: bloco @@@ não fechado`)
    return { meta, body }
}

// páginas ainda não escritas são omitidas do menu e da navegação
for (let i = PAGES.length - 1; i >= 0; i--) if (PAGES[i].arquivo && !existsSync(new URL(`docs-src/pages/${PAGES[i].arquivo}.html`, ROOT))) PAGES.splice(i, 1)
const pages = PAGES.filter(p => p.arquivo)

function navHtml(current) {
    let html = '<nav class="nav" aria-label="Páginas da documentação"><input id="filtro-menu" type="search" placeholder="Filtrar páginas…" aria-label="Filtrar páginas">'
    for (const item of PAGES) {
        if (item.grupo) {
            html += `<div class="grupo">${item.grupo}</div>`
            continue
        }
        const active = item.arquivo === current ? ' class="ativo" aria-current="page"' : ''
        html += `<a href="${item.arquivo}.html"${active} data-busca="${escape(item.busca)}">${item.menu}</a>`
    }
    return html + '<div class="vazio">Nenhuma página encontrada.</div></nav>'
}

function groupOf(name) {
    let group = ''
    for (const item of PAGES) {
        if (item.grupo) group = item.grupo
        else if (item.arquivo === name) return group
    }
    return ''
}

for (const [index, page] of pages.entries()) {
    const { meta, body } = parseFragment(page.arquivo)
    const prev = pages[index - 1]
    const next = pages[index + 1]
    const plainLead = (meta.lead || '').replace(/<[^>]+>/g, '')
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${meta.titulo === 'AlpineForm' ? 'AlpineForm · documentação' : `${escape(meta.titulo)} · AlpineForm`}</title>
<meta name="description" content="${escape(plainLead)}">
<link rel="stylesheet" href="assets/docs.css">
<script>try{var t=localStorage.getItem('alpineform-docs-tema');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}</script>
<script src="assets/docs.js" defer></script>
</head>
<body>
<header class="topo">
<button type="button" class="botao-menu" id="alternar-menu" aria-label="Abrir menu">☰ Menu</button>
<a class="marca" href="index.html">AlpineForm <span>· documentação</span></a>
<span class="trilha"><a href="index.html">Documentação</a> › ${groupOf(page.arquivo)} › ${page.menu}</span>
<span class="acoes"><button type="button" id="alternar-tema" aria-label="Alternar tema claro/escuro">◐ Tema</button></span>
</header>
<div class="layout">
${navHtml(page.arquivo)}
<main class="conteudo">
<h1>${meta.titulo}</h1>
<p class="lead">${meta.lead || ''}</p>
<div id="nesta-pagina"></div>
${body.trim()}
<nav class="navegacao-paginas" aria-label="Navegação entre páginas">${prev ? `<a href="${prev.arquivo}.html"><small>← Anterior</small>${prev.menu}</a>` : ''}${next ? `<a class="proxima" href="${next.arquivo}.html"><small>Próxima →</small>${next.menu}</a>` : ''}</nav>
<p class="rodape">Documentação do AlpineForm 1.0.0. Exemplos executáveis em <code>examples/</code> (<code>npm run serve</code>).</p>
</main>
</div>
</body>
</html>
`
    writeFileSync(new URL(`docs/${page.arquivo}.html`, ROOT), html)
}
console.log(`${pages.length} páginas geradas em docs/`)
