<?php require __DIR__ . '/_layout.php';
layout_start('Arquivo único', 'Regras de arquivo declaradas no input. O navegador informa extensão e MIME a partir do nome: o servidor inspeciona o conteúdo real (finfo).');
?>
<form id="arquivo-unico" x-data x-form action="/api/upload" method="post" enctype="multipart/form-data" novalidate>
    <div class="field">
        <label for="titulo">Título</label>
        <input id="titulo" name="titulo" data-form-v="required|max:80">
    </div>
    <div class="field">
        <label for="contrato">Contrato (PDF até 5 MB)</label>
        <input id="contrato" name="contrato" type="file" accept=".pdf,application/pdf"
               data-form-v="required|file_max:5MB|ext:pdf|mime:application/pdf|non_empty_file"
               data-form-msg.required="Selecione o contrato em PDF.">
    </div>
    <div class="actions">
        <button type="submit">Enviar</button>
        <button type="button" data-form-cancel>Cancelar</button>
    </div>
    <div data-form-progress class="progress-box">
        <div class="bar-track"><div class="bar-fill" data-form-progress-bar></div></div>
        <p data-form-status></p>
    </div>
    <p class="ok" x-show="$form.success">Arquivo recebido e inspecionado pelo servidor.</p>
    <?php state_panel('{ phase: $form.phase, arquivo: $form.fields.contrato && $form.fields.contrato.value, errors: $form.errors, resultado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li><code>file_max:5MB</code> usa megabytes decimais (5.000.000 bytes); use <code>5MiB</code> para 5.242.880 bytes.</li>
<li>Renomeie um arquivo de texto para <code>.pdf</code>: o navegador aceita (MIME pelo nome), o servidor recusa pelo conteúdo e o erro aparece no campo (<code>contrato.0</code>).</li>
<li>Limites do PHP (<code>upload_max_filesize</code>, <code>post_max_size</code>) podem recusar o envio antes do código da aplicação: veja docs/backend.md.</li>
</ul>'); ?>
