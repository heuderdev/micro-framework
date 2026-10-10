<?php require __DIR__ . '/_layout.php';
layout_start('Listagens', 'Módulo opcional <code>alpine-form-lista</code>: paginação, ordenação, filtros com espera, URL sincronizada (o botão Voltar funciona), seleção em lote, exportação com os filtros atuais e "carregar mais". As linhas são o seu HTML (<code>x-for</code>); o módulo cuida dos dados e dos estados.', ['lista' => true]);
?>
<form id="novo-cliente" x-data x-form action="/api/demo/clientes-novo" method="post"
      data-form-lista="clientes cards" data-form-reset-on-success novalidate>
    <h2>Novo cliente</h2>
    <p class="hint">Ao salvar com sucesso, a tabela e os cards abaixo buscam os dados de novo na API (<code>data-form-lista="clientes cards"</code>); na tabela, o registro novo fica destacado.</p>
    <div class="row">
        <div class="field">
            <label for="n-nome">Nome</label>
            <input id="n-nome" name="nome" data-form-v="required|min:3|max:80">
        </div>
        <div class="field">
            <label for="n-email">E-mail</label>
            <input id="n-email" name="email" type="email" data-form-v="required|email">
        </div>
        <div class="field">
            <label for="n-uf">UF</label>
            <select id="n-uf" name="uf" data-form-v="required">
                <option value="">--</option><option>SP</option><option>RJ</option><option>MG</option><option>RS</option><option>BA</option><option>PR</option>
            </select>
        </div>
    </div>
    <div class="actions"><button type="submit" x-bind:disabled="$form.submitting">Cadastrar</button></div>
    <p data-form-status class="hint"></p>
</form>

<section id="clientes" class="card" x-data x-lista
         data-lista-destacar
         data-lista-url="/api/demo/clientes"
         data-lista-por-pagina="10"
         data-lista-ordem="nome"
         data-lista-url-sincronizar
         data-lista-exportar-url="/api/demo/clientes-csv"
         data-lista-exportar-completo-url="/api/demo/clientes-csv-completo">
    <h2>Clientes</h2>

    <form class="row" data-lista-filtros role="search" aria-label="Filtrar clientes">
        <div class="field">
            <label for="f-busca">Buscar (nome ou e-mail)</label>
            <input id="f-busca" name="busca" type="search" data-lista-minimo="2" autocomplete="off">
        </div>
        <div class="field">
            <label for="f-uf">UF</label>
            <select id="f-uf" name="uf">
                <option value="">Todas</option>
                <option>SP</option><option>RJ</option><option>MG</option><option>RS</option><option>BA</option><option>PR</option>
            </select>
        </div>
        <fieldset>
            <legend>Status</legend>
            <label class="inline"><input type="checkbox" name="status[]" value="ativo"> Ativo</label>
            <label class="inline"><input type="checkbox" name="status[]" value="inativo"> Inativo</label>
            <label class="inline"><input type="checkbox" name="status[]" value="pendente"> Pendente</label>
        </fieldset>
        <div class="field">
            <label for="f-tamanho">Por página</label>
            <select id="f-tamanho" data-lista-tamanho data-lista-ignorar>
                <option>10</option><option>25</option><option>50</option>
            </select>
        </div>
        <div class="actions">
            <button type="button" data-lista-limpar>Limpar filtros</button>
            <button type="button" data-lista-recarregar>Recarregar</button>
            <button type="button" data-lista-exportar="filtro" title="Todas as linhas que atendem aos filtros atuais, sem paginação">Filtro CSV</button>
            <button type="button" data-lista-exportar="completo" title="Todas as linhas, sem filtro nem paginação">CSV completo</button>
        </div>
    </form>

    <p data-lista-status class="hint"></p>
    <p class="hint" x-show="$lista.exportando" role="status">Gerando o arquivo…</p>
    <p class="erro-exportacao" x-show="$lista.erroExportacao" role="alert" x-text="$lista.erroExportacao && $lista.erroExportacao.message"></p>
    <p class="hint" x-show="$lista.quantidadeSelecionada > 0">
        <strong x-text="$lista.quantidadeSelecionada"></strong> selecionado(s)
        <button type="button" @click="alert('Ids: ' + $lista.selecionados.join(', '))">Ação em lote</button>
        <button type="button" @click="$lista.limparSelecao()">Limpar seleção</button>
    </p>

    <div class="tabela-rolagem">
        <table class="tabela-lista" :class="{ 'carregando': $lista.carregando }">
            <thead>
                <tr>
                    <th scope="col"><input type="checkbox" data-lista-selecionar-todos aria-label="Selecionar todos desta página"></th>
                    <th scope="col"><button type="button" data-lista-ordenar="nome">Nome</button></th>
                    <th scope="col">E-mail</th>
                    <th scope="col"><button type="button" data-lista-ordenar="uf">UF</button></th>
                    <th scope="col"><button type="button" data-lista-ordenar="status">Status</button></th>
                    <th scope="col"><button type="button" data-lista-ordenar="saldo">Saldo</button></th>
                    <th scope="col"><button type="button" data-lista-ordenar="criado_em">Cadastro</button></th>
                </tr>
            </thead>
            <tbody>
                <template x-for="item in $lista.itens" :key="item.id">
                    <tr :class="{ 'linha-nova': $lista.destaque === String(item.id) }">
                        <td><input type="checkbox" :data-lista-selecionar="item.id" :aria-label="'Selecionar ' + item.nome"></td>
                        <td x-text="item.nome"></td>
                        <td x-text="item.email"></td>
                        <td x-text="item.uf"></td>
                        <td x-text="item.status"></td>
                        <td class="numero" x-text="Number(item.saldo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })"></td>
                        <td x-text="item.criado_em.split('-').reverse().join('/')"></td>
                    </tr>
                </template>
                <tr x-show="$lista.vazio"><td colspan="7">Nenhum cliente encontrado com esses filtros.</td></tr>
                <tr x-show="$lista.erro"><td colspan="7" role="alert"><span x-text="$lista.erro && $lista.erro.message"></span> <button type="button" data-lista-recarregar>Tentar de novo</button></td></tr>
            </tbody>
        </table>
    </div>

    <nav data-lista-paginacao></nav>
</section>

<h2>Cards com "carregar mais" e rolagem infinita</h2>
<section id="cards" class="card" x-data x-lista data-lista-url="/api/demo/clientes?ms=300" data-lista-modo="acumular" data-lista-por-pagina="12" data-lista-ordem="criado_em" data-lista-direcao="desc">
    <div class="grade-cards">
        <template x-for="item in $lista.itens" :key="item.id">
            <article class="mini-card">
                <strong x-text="item.nome"></strong>
                <small x-text="item.uf + ' · ' + item.status"></small>
            </article>
        </template>
    </div>
    <p data-lista-status class="hint"></p>
    <button type="button" data-lista-mais>Carregar mais</button>
    <div data-lista-sentinela aria-hidden="true"></div>
</section>
<?php layout_end('<ul>
<li>O formulário "Novo cliente" usa <code>data-form-lista="clientes cards"</code>: depois do sucesso, as duas listas recarregam (a tabela mantém página e filtros; os cards recomeçam). <code>data-lista-destacar</code> deixa o registro salvo em <code>$lista.destaque</code> por alguns segundos.</li>
<li>Digite na busca: a requisição sai 300 ms depois que você para de digitar (mínimo de 2 letras), cancelando a anterior. Respostas antigas nunca sobrescrevem as novas.</li>
<li>Filtros, página, ordenação e tamanho ficam na URL (<code>data-lista-url-sincronizar</code>): recarregar ou compartilhar o link reabre a mesma visão; Voltar/Avançar navegam entre páginas e ordenações.</li>
<li>A seleção é mantida ao trocar de página; o checkbox do cabeçalho seleciona a página atual.</li>
<li><strong>Filtro CSV</strong> chama <code>data-lista-exportar-url</code> com os filtros e a ordenação atuais (sem paginação); <strong>CSV completo</strong> chama <code>data-lista-exportar-completo-url</code> sem parâmetros (todas as linhas). O servidor gera o arquivo com <code>Csv::enviar()</code> dos helpers PHP.</li>
<li>O endpoint de demonstração responde no formato do Laravel (<code>data</code> + <code>meta</code>); outros formatos são reconhecidos automaticamente (veja a documentação).</li>
<li>Os cards usam <code>data-lista-modo="acumular"</code>: "Carregar mais" e o sentinela (rolagem infinita) acrescentam a próxima página.</li>
</ul>'); ?>
