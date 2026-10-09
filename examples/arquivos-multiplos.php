<?php require __DIR__ . '/_layout.php';
layout_start('Múltiplos arquivos com remoção', 'A lista interna é a fonte de verdade: remover um arquivo da lista o remove do FormData, mesmo que o navegador não permita reescrever <code>input.files</code>.');
?>
<form id="multiplos" x-data x-form action="/api/upload" method="post" enctype="multipart/form-data" novalidate>
    <div class="field">
        <label for="documentos">Documentos (até 5; PDF, JPG ou PNG; 10 MB cada; 30 MB no total)</label>
        <input id="documentos" name="documentos[]" type="file" multiple accept=".pdf,.jpg,.jpeg,.png"
               data-form-files-append
               data-form-files-duplicates="ignore"
               data-form-v="required|files_max:5|file_max:10MB|files_total_max:30MB|ext:pdf,jpg,jpeg,png"
               data-form-msg.file_max="Cada arquivo pode ter no máximo :max.">
    </div>
    <div class="dropzone" data-form-dropzone="documentos[]">
        Arraste arquivos para cá (complementa o seletor; o input continua acessível por teclado).
    </div>
    <div data-form-file-list="documentos[]" aria-live="polite"></div>

    <p class="hint" x-show="$form.fields['documentos'] && $form.fields['documentos'].files.length"
       x-text="'Selecionados: ' + ($form.fields['documentos'] ? $form.fields['documentos'].files.length : 0)"></p>

    <div class="actions">
        <button type="submit">Enviar</button>
        <button type="button" data-form-cancel>Cancelar envio</button>
    </div>
    <div data-form-progress class="progress-box">
        <div class="bar-track"><div class="bar-fill" data-form-progress-bar></div></div>
        <p><span data-form-progress-percent></span> <span data-form-status></span></p>
    </div>
    <?php state_panel('{ phase: $form.phase, errors: $form.errors, enviados: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li><code>data-form-files-append</code>: cada nova seleção é acrescentada à lista; duplicados (mesmo nome, tamanho e data) são ignorados.</li>
<li>Thumbnails usam object URLs apenas para imagens raster (SVG nunca) e são revogados ao remover, limpar, resetar ou destruir.</li>
<li>Erros por arquivo aparecem no item da lista e no campo; erros do servidor como <code>documentos.1</code> são associados ao segundo arquivo enviado.</li>
<li>Progresso de um único multipart é do corpo inteiro: não há progresso exato por arquivo (isso exige requisições separadas, veja chunks).</li>
</ul>'); ?>
