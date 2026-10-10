<?php require __DIR__ . '/_layout.php';
layout_start('Autopreenchimento', 'Módulo opcional <code>alpine-form-preencher</code>: quando o CEP (ou CNPJ) fica completo e válido, busca os dados e preenche os outros campos — sem apagar o que a pessoa digitou. Funciona junto com os selects dependentes.', ['masks' => true, 'opcoes' => true, 'preencher' => true]);
?>
<form id="endereco" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Endereço pelo CEP</h2>
    <p class="hint">CEPs de demonstração: 01001-000, 13010-111, 20040-020, 24020-000, 30130-010. Qualquer outro responde "não encontrado".</p>
    <div class="row">
        <div class="field">
            <label for="e-cep">CEP</label>
            <input id="e-cep" name="cep" inputmode="numeric" data-form-mask="cep" data-form-v="required|cep"
                   data-form-preencher="/api/demo/cep/{cep}?ms=300"
                   data-form-preencher-minimo="8"
                   data-form-preencher-campos="logradouro, bairro, uf, ibge:cidade"
                   data-form-preencher-nao-encontrado="CEP não encontrado. Confira ou preencha o endereço manualmente.">
        </div>
        <div class="field" style="align-self: end">
            <button type="button" @click="AlpineForm.preencher.buscar('endereco', 'cep')">Buscar de novo</button>
        </div>
    </div>
    <div class="row">
        <div class="field">
            <label for="e-logradouro">Logradouro</label>
            <input id="e-logradouro" name="logradouro" data-form-v="required">
        </div>
        <div class="field">
            <label for="e-numero">Número</label>
            <input id="e-numero" name="numero" data-form-v="required">
        </div>
        <div class="field">
            <label for="e-bairro">Bairro</label>
            <input id="e-bairro" name="bairro" data-form-v="required">
        </div>
    </div>
    <div class="row">
        <div class="field">
            <label for="e-uf">UF</label>
            <select id="e-uf" name="uf" data-form-opcoes="/api/demo/ufs" data-form-v="required"><option value="">Selecione</option></select>
        </div>
        <div class="field">
            <label for="e-cidade">Cidade</label>
            <select id="e-cidade" name="cidade" data-form-opcoes="/api/demo/cidades?uf={uf}" data-form-v="required"><option value="">Escolha a UF primeiro</option></select>
        </div>
    </div>
    <div class="actions"><button type="submit" x-bind:disabled="$form.submitting">Salvar</button></div>
    <p data-form-status class="hint"></p>
    <pre class="hint" x-show="$form.result" x-text="JSON.stringify($form.result && $form.result.data, null, 2)"></pre>
</form>

<form id="empresa" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Empresa pelo CNPJ</h2>
    <p class="hint">CNPJ de demonstração: 11.222.333/0001-81. Chaves aninhadas com ponto: <code>endereco.cep:cep</code>.</p>
    <div class="row">
        <div class="field">
            <label for="c-cnpj">CNPJ</label>
            <input id="c-cnpj" name="cnpj" inputmode="numeric" data-form-mask="cnpj" data-form-v="required|cnpj"
                   data-form-preencher="/api/demo/cnpj/{cnpj}" data-form-preencher-minimo="14"
                   data-form-preencher-campos="razao_social, nome_fantasia, endereco.cep:cep, endereco.numero:numero">
        </div>
        <div class="field">
            <label for="c-razao">Razão social</label>
            <input id="c-razao" name="razao_social" data-form-v="required">
        </div>
        <div class="field">
            <label for="c-fantasia">Nome fantasia</label>
            <input id="c-fantasia" name="nome_fantasia">
        </div>
    </div>
    <div class="row">
        <div class="field">
            <label for="c-cep">CEP</label>
            <input id="c-cep" name="cep" data-form-mask="cep">
        </div>
        <div class="field">
            <label for="c-numero">Número</label>
            <input id="c-numero" name="numero">
        </div>
    </div>
</form>
<?php layout_end('<ul>
<li>A busca só sai com o CEP completo <em>e válido</em>, depois que a digitação para; digitar outro CEP cancela a busca anterior.</li>
<li>Campos que você digitou não são trocados; os que o módulo preencheu são atualizados se o CEP mudar.</li>
<li>UF e cidade são selects dependentes: a UF é escolhida, a lista de cidades carrega e a cidade (código IBGE) é selecionada quando a lista chega.</li>
<li>CEP inexistente: o erro aparece no próprio campo (resposta 404 ou <code>success: false</code>).</li>
<li>Serviços prontos: <code>data-form-preencher="viacep"</code>, <code>brasilapi-cep</code>, <code>brasilapi-cnpj</code> (consulta direta, sem cookies). Em ambiente regulado, prefira um endpoint do próprio sistema.</li>
</ul>'); ?>
