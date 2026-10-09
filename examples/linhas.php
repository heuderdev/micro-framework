<?php require __DIR__ . '/_layout.php';
layout_start('Linhas repetidas', 'Linhas criadas com <code>x-for</code>. Campos novos são descobertos automaticamente (MutationObserver no form) e removidos com limpeza. Erros do servidor como <code>itens.1.quantidade</code> são associados à linha certa e acompanham o controle quando linhas são removidas e reindexadas.');
?>
<form id="linhas" x-data="{ itens: [{ id: 1 }, { id: 2 }], seq: 2 }" x-form action="/api/pedido" method="post" novalidate>
    <template x-for="(item, index) in itens" :key="item.id">
        <div class="card" data-testid="linha">
            <div class="row">
                <div class="field">
                    <label :for="'produto-' + item.id">Produto</label>
                    <input :id="'produto-' + item.id" :name="`itens[${index}][produto]`" data-form-label="Produto"
                           data-form-v="required|min:2">
                </div>
                <div class="field">
                    <label :for="'qtd-' + item.id">Quantidade</label>
                    <input :id="'qtd-' + item.id" :name="`itens[${index}][quantidade]`" inputmode="numeric" data-form-label="Quantidade"
                           data-form-v="required|integer|min_value:1|max_value:999">
                </div>
            </div>
            <button type="button" @click="itens.splice(index, 1)" :disabled="itens.length === 1" :aria-label="'Remover linha ' + (index + 1)">Remover linha</button>
        </div>
    </template>
    <div class="actions">
        <button type="button" @click="itens.push({ id: ++seq })">Adicionar item</button>
        <button type="submit">Registrar pedido</button>
    </div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ campos: Object.keys($form.fields), errors: $form.errors, phase: $form.phase }'); ?>
</form>
<?php layout_end('<ul>
<li>Digite um produto contendo <em>esgotado</em> para receber erro do servidor naquela linha (<code>itens.N.produto</code>).</li>
<li>Remova uma linha acima de outra com erro do servidor: a mensagem continua na linha correta, agora com o novo índice.</li>
<li>Nomes são reindexados pelo <code>x-for</code> (<code>:name</code> com o índice); a chave do campo acompanha o atributo name.</li>
</ul>'); ?>
