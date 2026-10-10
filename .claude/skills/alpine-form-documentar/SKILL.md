---
name: alpine-form-documentar
description: Use ao criar ou corrigir documentação do AlpineForm — o guia com exemplos (docs-src/pages → docs/*.html), os guias Markdown (docs/*.md, README.md) ou a documentação técnica interna (doc.html). Explica o formato dos fragmentos, o gerador, os verificadores e as regras de escrita.
---

# Documentar o AlpineForm

## Onde fica cada coisa

| Documento | Fonte (edite aqui) | Saída |
|---|---|---|
| Guia com exemplos (27 páginas) | `docs-src/pages/<pagina>.html` | `docs/<pagina>.html` — **gerado**, nunca editar |
| Menu, ordem e grupos do guia | lista `PAGES` em `scripts/build-docs.mjs` | — |
| Visual do guia | `docs/assets/docs.css`, `docs/assets/docs.js` | — |
| Contrato, integração, extensão, limitações, matriz | `docs/*.md` | — |
| Documentação técnica interna | `doc.html` (arquivo único, autocontido) | — |
| Visão geral e comandos | `README.md` | — |

## Formato de um fragmento (`docs-src/pages/x.html`)

```text
titulo: Título da página
lead: Frase de abertura (HTML permitido)
---
<h2 id="secao" data-titulo="Título no índice">Título</h2>
<p>Texto…</p>
@@@html Título opcional do bloco
<form x-data x-form action="/api/x" method="post" novalidate>
    <input name="nome" data-form-v="required">
</form>
@@@
```

- Blocos `@@@<lang> [título]` … `@@@` aceitam `html`, `js`, `php`, `sql`, `txt` e **não precisam de escape** (o gerador escapa).
- Fora dos blocos é HTML normal: escape `<` como `&lt;` em `<code>`.
- Componentes visuais disponíveis: `<div class="nota">`, `nota dica`, `nota aviso`, `nota perigo` (com `<strong class="rotulo">`), `<div class="tabela"><table>…`, `<div class="metodo"><h3 id>…`, `<p class="assinatura">`, `<p class="retorno">`, `<ol class="passos">`, `<div class="fluxo">` com `.etapa`/`.seta`, `<div class="grade">` com `<a class="card">`.
- Todo `<h2>` precisa de `id` e `data-titulo` (alimenta "Nesta página"). Links internos: `pagina.html#ancora` — o verificador acusa âncoras inexistentes.
- Página nova: crie o fragmento **e** adicione-a em `PAGES` (`scripts/build-docs.mjs`) com `menu` e `busca` (palavras para o filtro do menu).

## Regras de conteúdo

1. **Só documente o que existe.** Confira no código (`src/`) antes de afirmar comportamento, atributo, valor padrão ou mensagem. Mensagens padrão: copie de `src/core/messages.js`.
2. **Exemplos têm de funcionar como estão.** Use só atributos, regras, máscaras e métodos reais; formulários completos quando possível (`<form x-data x-form ... novalidate>`).
3. Em expressões Alpine que leem campos (`x-text="$form.getValue(...)"`), proteja com `$form.ready` ou `$form.has()`; use `?.` ao ler `$form.result`/`$form.error`.
4. Marque limitações reais com `nota aviso`/`nota perigo`; nunca prometa o que não foi testado.
5. Português do Brasil, frases diretas, um assunto por seção, exemplo antes do detalhe.
6. Ao mudar comportamento da biblioteca, atualize: página do assunto, `referencia-rapida.html`, `erros-e-solucoes.html` (se houver mensagem nova), `docs/contrato.md` e, se for interno, `doc.html`.

## Gerar e verificar (obrigatório)

```bash
npm run docs:check      # gera docs/*.html e confere: atributos, data-form-v (parser real), máscaras,
                        # métodos $form.x(), AlpineForm.x e links/âncoras internos
npm run docs:browser    # carrega cada exemplo HTML no Chrome real com todos os módulos (servidor em 127.0.0.1:8099:
                        # rode antes `php -S 127.0.0.1:8099 server/router.php` ou deixe a E2E subir)
```

- Contraexemplos intencionais: comece o bloco com `<!-- Errado -->` para o verificador ignorá-lo.
- Blocos com `<?php`, `{{ }}` (Blade) ou reticências (`...`) não são carregados no navegador — prefira exemplos completos.
- Exemplos que dependem de uma extensão registrada num bloco `js` da mesma página são carregados junto com esse JS.

## Servir e publicar

- Local: `npm run docs:serve` → `http://localhost:1900` (técnica em `/tecnica`); Windows: `docs-servidor.bat`.
- Docker: `docker compose up -d --build` (nginx, porta 1900; regenera as páginas no build).
- Os arquivos em `docs-src/` são fragmentos: abri-los direto no navegador mostra texto cru — abra `docs/*.html`.
