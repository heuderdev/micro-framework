<?php require __DIR__ . '/_layout.php';
use AlpineForm\Server\Session;
$anexos = Session::get('perfil_anexos', [['id' => '101', 'name' => 'contrato.pdf'], ['id' => '102', 'name' => 'rg-frente.jpg']]);
Session::release();
layout_start('Edição com arquivos existentes', 'Arquivos já salvos são renderizados pelo servidor. Remover um deles gera um <strong>pedido de remoção</strong> (<code>anexos_remover[]</code>), separado do envio de arquivos novos.');
?>
<form id="edicao" x-data x-form action="/api/perfil" method="post" enctype="multipart/form-data" novalidate>
    <h2>Anexos atuais</h2>
    <ul>
        <?php foreach ($anexos as $anexo): ?>
            <li data-form-existing="anexos[]" data-form-existing-id="<?= htmlspecialchars($anexo['id']) ?>" data-form-existing-name="<?= htmlspecialchars($anexo['name']) ?>">
                <?= htmlspecialchars($anexo['name']) ?>
                <button type="button" data-form-existing-remove aria-pressed="false">Remover / desfazer</button>
            </li>
        <?php endforeach; ?>
    </ul>
    <div class="field">
        <label for="anexos">Novos anexos</label>
        <input id="anexos" name="anexos[]" type="file" multiple data-form-files-append
               data-form-existing-remove-name="anexos_remover[]"
               data-form-v="required|files_max:4|file_max:10MB|ext:pdf,jpg,jpeg,png"
               data-form-msg.required="O perfil precisa de ao menos um anexo (existente ou novo).">
    </div>
    <div data-form-file-list="anexos[]"></div>
    <div class="actions"><button type="submit">Salvar perfil</button></div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ existentes: $form.fields.anexos && $form.fields.anexos.existing, errors: $form.errors, resultado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li><code>required</code>, <code>files_min</code> e <code>files_max</code> contam os existentes mantidos + novos.</li>
<li>Os ids enviados em <code>anexos_remover[]</code> são verificados pelo servidor (pertencem ao perfil?); o cliente não decide sozinho.</li>
<li>Recarregue após salvar: a lista reflete o estado persistido na sessão de demonstração.</li>
</ul>'); ?>
