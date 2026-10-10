<?php require __DIR__ . '/_layout.php';
layout_start('Autocompletar', 'Módulo opcional <code>alpine-form-autocompletar</code>: campo de busca com sugestões da API, acessível por teclado e leitor de tela. O valor enviado é o id do item escolhido.', ['autocompletar' => true]);
?>
<form id="pedido" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Novo pedido</h2>
    <p class="hint">Digite 2 letras de um nome (ex.: "ana", "lu"). ↓ ↑ navegam, Enter escolhe, Esc fecha/limpa. Ao escolher, o e-mail é copiado (se você não digitou outro).</p>
    <div class="row">
        <div class="field">
            <label for="p-cliente">Cliente</label>
            <div data-form-component="autocompletar" data-form-name="cliente_id" data-form-label="Cliente" data-form-v="required"
                 data-form-autocompletar="/api/demo/clientes?per_page=8&busca={termo}"
                 data-form-autocompletar-texto="nome" data-form-autocompletar-descricao="email"
                 data-form-autocompletar-campos="email, uf">
                <input type="text" id="p-cliente" placeholder="Nome do cliente">
            </div>
        </div>
        <div class="field">
            <label for="p-email">E-mail para a nota</label>
            <input id="p-email" name="email" type="email" data-form-v="email">
        </div>
        <div class="field">
            <label for="p-uf">UF</label>
            <input id="p-uf" name="uf" maxlength="2">
        </div>
    </div>
    <div class="actions"><button type="submit" x-bind:disabled="$form.submitting">Criar pedido</button></div>
    <p data-form-status class="hint"></p>
    <pre class="hint" x-show="$form.result" x-text="JSON.stringify($form.result && $form.result.data, null, 2)"></pre>
</form>

<form id="edicao" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <h2>Edição</h2>
    <p class="hint">Valor salvo: <code>data-form-autocompletar-inicial="17"</code> e o texto no <code>value</code> do input. "Desfazer" (reset) volta ao salvo.</p>
    <div class="row">
        <div class="field">
            <label for="e-cliente">Responsável</label>
            <div data-form-component="autocompletar" data-form-name="responsavel_id" data-form-label="Responsável" data-form-v="required"
                 data-form-autocompletar="/api/demo/clientes?per_page=8&busca={termo}" data-form-autocompletar-texto="nome"
                 data-form-autocompletar-inicial="17">
                <input type="text" id="e-cliente" value="Ana Almeida">
            </div>
        </div>
    </div>
    <div class="actions">
        <button type="button" @click="$form.reset()">Desfazer</button>
        <span class="hint">Valor atual: <strong id="e-valor" x-text="($form.fields.responsavel_id && $form.fields.responsavel_id.value) || '—'"></strong></span>
    </div>
</form>
<?php layout_end('<ul>
<li>O texto digitado não é enviado: vai o id do item escolhido (<code>data-form-name</code>). Digitar de novo depois de escolher limpa a escolha, e o <code>required</code> avisa.</li>
<li>Busca com espera (250 ms), a partir de 2 caracteres, cancelando a anterior; respostas ficam em cache na memória.</li>
<li>Padrão WAI-ARIA de combobox: <code>role="combobox"</code>, <code>aria-expanded</code>, <code>aria-activedescendant</code> e quantidade de resultados anunciada.</li>
</ul>'); ?>
