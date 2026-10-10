<?php require __DIR__ . '/_layout.php';
layout_start('Selects dependentes', 'Módulo opcional <code>alpine-form-opcoes</code>: as opções vêm da API e dependem de outros campos (<code>data-form-opcoes="/api/cidades?uf={uf}"</code>). Sem JavaScript próprio.', ['opcoes' => true]);
?>
<form id="endereco" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Cadastro: UF → cidade → bairro</h2>
    <div class="row">
        <div class="field">
            <label for="e-uf">UF</label>
            <select id="e-uf" name="uf" data-form-opcoes="/api/demo/ufs" data-form-v="required">
                <option value="">Selecione</option>
            </select>
        </div>
        <div class="field">
            <label for="e-cidade">Cidade</label>
            <select id="e-cidade" name="cidade" data-form-v="required"
                    data-form-opcoes="/api/demo/cidades?uf={uf}&ms=400"
                    data-form-opcoes-grupo="regiao"
                    data-form-opcoes-vazio="Nenhuma cidade para esta UF">
                <option value="">Escolha a UF primeiro</option>
            </select>
        </div>
        <div class="field">
            <label for="e-bairro">Bairro</label>
            <select id="e-bairro" name="bairro" data-form-opcoes="/api/demo/bairros?cidade={cidade}" data-form-opcoes-vazio="Sem bairros cadastrados">
                <option value="">Escolha a cidade primeiro</option>
            </select>
        </div>
    </div>
    <div class="actions"><button type="submit" x-bind:disabled="$form.submitting">Salvar</button></div>
    <p data-form-status class="hint"></p>
    <pre class="hint" x-show="$form.result" x-text="JSON.stringify($form.result && $form.result.data, null, 2)"></pre>
</form>

<form id="edicao" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Edição: valores já salvos</h2>
    <p class="hint">O servidor renderiza a UF selecionada e informa cidade e bairro em <code>data-form-opcoes-selecionado</code>; o módulo carrega as listas em cadeia e seleciona cada valor.</p>
    <div class="row">
        <div class="field">
            <label for="d-uf">UF</label>
            <select id="d-uf" name="uf" data-form-opcoes="/api/demo/ufs" data-form-v="required">
                <option value="">Selecione</option>
                <option value="RJ" selected>Rio de Janeiro</option>
            </select>
        </div>
        <div class="field">
            <label for="d-cidade">Cidade</label>
            <select id="d-cidade" name="cidade" data-form-opcoes="/api/demo/cidades?uf={uf}" data-form-opcoes-selecionado="3303302" data-form-v="required">
                <option value="">Escolha a UF primeiro</option>
            </select>
        </div>
        <div class="field">
            <label for="d-bairro">Bairro</label>
            <select id="d-bairro" name="bairro" data-form-opcoes="/api/demo/bairros?cidade={cidade}" data-form-opcoes-selecionado="Icaraí">
                <option value="">Escolha a cidade primeiro</option>
            </select>
        </div>
    </div>
</form>

<form id="entregas" x-data="{ linhas: [1] }" x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Linhas repetidas</h2>
    <template x-for="(n, i) in linhas" :key="n">
        <div class="row">
            <div class="field">
                <label :for="'r-uf-' + n">UF da entrega <span x-text="i + 1"></span></label>
                <select :id="'r-uf-' + n" :name="'entregas[' + i + '][uf]'" data-form-opcoes="/api/demo/ufs" data-form-v="required">
                    <option value="">Selecione</option>
                </select>
            </div>
            <div class="field">
                <label :for="'r-cidade-' + n">Cidade</label>
                <select :id="'r-cidade-' + n" :name="'entregas[' + i + '][cidade]'" :data-form-opcoes="'/api/demo/cidades?uf={entregas[' + i + '][uf]}'" data-form-v="required">
                    <option value="">Escolha a UF primeiro</option>
                </select>
            </div>
        </div>
    </template>
    <div class="actions">
        <button type="button" @click="linhas.push(linhas.length + 1)">Adicionar entrega</button>
        <button type="submit">Enviar</button>
    </div>
    <p data-form-status class="hint"></p>
</form>
<?php layout_end('<ul>
<li>Enquanto a UF está vazia, cidade e bairro ficam sem opções e desabilitados (desabilitado não valida nem é enviado).</li>
<li>Trocar a UF limpa a cidade, o que limpa o bairro: a cadeia se propaga sozinha. A requisição anterior é cancelada; resposta antiga nunca sobrescreve a nova.</li>
<li>As listas ficam em cache na memória da página: voltar para uma UF já vista não repete a requisição.</li>
<li>O select recebe <code>data-form-opcoes-estado</code> (aguardando, carregando, pronto, erro) e <code>aria-busy</code> durante a carga — use no CSS.</li>
<li>Formatos aceitos: lista, <code>{ data: [...] }</code>, <code>{ success, data }</code> e mapa <code>{ "SP": "São Paulo" }</code>. Texto do servidor nunca vira HTML.</li>
</ul>'); ?>
