<?php require __DIR__ . '/_layout.php';
layout_start('CRUD completo', 'Listagem, cadastro, edição e exclusão de clientes juntando os módulos — com um único script (<code>alpine-form-completo.js</code>) e sem JavaScript de aplicação além de copiar a linha para o formulário de edição.', ['completo' => true]);
?>
<div x-data="{
        editar(item) {
            const f = AlpineForm.get('cliente-form')
            f.reset()
            for (const campo of ['id', 'nome', 'email', 'uf']) f.setValue(campo, item[campo] == null ? '' : String(item[campo]))
            AlpineForm.opcoes.selecionar('cliente-form', 'cidade', item.cidade || '')
            document.getElementById('c-nome').focus()
        }
     }">

    <form id="cliente-form" class="card" x-data x-form action="/api/demo/clientes-salvar" method="post"
          data-form-avisos data-form-lista="clientes" data-form-reset-on-success novalidate>
        <h2 x-text="$form.fields.id && $form.fields.id.value ? 'Editar cliente #' + $form.fields.id.value : 'Novo cliente'">Novo cliente</h2>
        <input type="hidden" name="id">
        <div class="row">
            <div class="field">
                <label for="c-nome">Nome</label>
                <input id="c-nome" name="nome" data-form-v="required|min:3|max:80">
            </div>
            <div class="field">
                <label for="c-email">E-mail</label>
                <input id="c-email" name="email" type="email" data-form-v="required|email">
            </div>
        </div>
        <div class="row">
            <div class="field">
                <label for="c-cep">CEP (preenche UF e cidade)</label>
                <input id="c-cep" name="cep" inputmode="numeric" data-form-mask="cep" data-form-v="cep"
                       data-form-preencher="/api/demo/cep/{cep}" data-form-preencher-minimo="8"
                       data-form-preencher-campos="uf, ibge:cidade">
            </div>
            <div class="field">
                <label for="c-uf">UF</label>
                <select id="c-uf" name="uf" data-form-opcoes="/api/demo/ufs" data-form-v="required"><option value="">Selecione</option></select>
            </div>
            <div class="field">
                <label for="c-cidade">Cidade</label>
                <select id="c-cidade" name="cidade" data-form-opcoes="/api/demo/cidades?uf={uf}"><option value="">Escolha a UF</option></select>
            </div>
        </div>
        <div class="actions">
            <button type="submit" x-bind:disabled="$form.submitting" x-text="$form.fields.id && $form.fields.id.value ? 'Salvar alterações' : 'Cadastrar'">Cadastrar</button>
            <button type="button" x-show="$form.fields.id && $form.fields.id.value" @click="$form.reset()">Cancelar edição</button>
        </div>
    </form>

    <section id="clientes" class="card" x-data x-lista data-lista-url="/api/demo/clientes" data-lista-por-pagina="8"
             data-lista-ordem="criado_em" data-lista-direcao="desc" data-lista-destacar>
        <h2>Clientes</h2>
        <form class="row" data-lista-filtros role="search" aria-label="Filtrar clientes">
            <div class="field">
                <label for="f-busca">Buscar</label>
                <input id="f-busca" name="busca" type="search" data-lista-minimo="2">
            </div>
            <div class="field">
                <label for="f-uf">UF</label>
                <select id="f-uf" name="uf"><option value="">Todas</option><option>SP</option><option>RJ</option><option>MG</option><option>AC</option></select>
            </div>
        </form>
        <p data-lista-status class="hint"></p>
        <div class="tabela-rolagem">
            <table class="tabela-lista" :class="{ 'carregando': $lista.carregando }">
                <thead>
                    <tr>
                        <th scope="col"><button type="button" data-lista-ordenar="nome">Nome</button></th>
                        <th scope="col">E-mail</th>
                        <th scope="col"><button type="button" data-lista-ordenar="uf">UF</button></th>
                        <th scope="col"><button type="button" data-lista-ordenar="criado_em">Cadastro</button></th>
                        <th scope="col"><span class="af-sr-only">Ações</span></th>
                    </tr>
                </thead>
                <tbody>
                    <template x-for="item in $lista.itens" :key="item.id">
                        <tr :class="{ 'linha-nova': $lista.destaque === String(item.id) }">
                            <td x-text="item.nome"></td>
                            <td x-text="item.email"></td>
                            <td x-text="item.uf"></td>
                            <td x-text="item.criado_em.split('-').reverse().join('/')"></td>
                            <td class="acoes">
                                <button type="button" @click="editar(item)" :aria-label="'Editar ' + item.nome">Editar</button>
                                <form x-data x-form action="/api/demo/clientes-excluir" method="post" data-form-lista="clientes" data-form-avisos novalidate>
                                    <input type="hidden" name="id" :value="item.id">
                                    <button type="submit" :aria-label="'Excluir ' + item.nome"
                                            :data-form-confirmar="'O cliente ' + item.nome + ' será excluído.'"
                                            data-form-confirmar-titulo="Excluir cliente?" data-form-confirmar-ok="Excluir" data-form-confirmar-perigo>Excluir</button>
                                </form>
                            </td>
                        </tr>
                    </template>
                    <tr x-show="$lista.vazio"><td colspan="5">Nenhum cliente encontrado.</td></tr>
                </tbody>
            </table>
        </div>
        <nav data-lista-paginacao></nav>
    </section>
</div>
<?php layout_end('<ul>
<li>Um script só: <code>&lt;script src="alpine-form-completo.min.js"&gt;</code> (núcleo + todos os módulos) antes do Alpine.</li>
<li>Salvar (novo ou edição) e excluir usam <code>data-form-lista="clientes"</code>: a tabela recarrega e destaca o registro; <code>data-form-avisos</code> mostra a mensagem do servidor.</li>
<li>Excluir pergunta antes (<code>data-form-confirmar</code> no botão, foco em Cancelar).</li>
<li>CEP preenche UF e cidade (selects dependentes); "Editar" usa <code>$form.setValue</code> e <code>AlpineForm.opcoes.selecionar</code> para a cidade chegar depois da lista.</li>
<li>Backend: <code>/api/demo/clientes</code> (lista com <code>Consulta</code> dos helpers PHP), <code>clientes-salvar</code> e <code>clientes-excluir</code> (guardados na sessão).</li>
</ul>'); ?>
