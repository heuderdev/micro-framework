<?php require __DIR__ . '/_layout.php';
layout_start('Upload grande com progresso real', 'O transporte XMLHttpRequest expõe eventos reais de <code>upload.onprogress</code>. Depois de 100% enviado, o estado passa a "aguardando resposta" — não "concluído". Nenhum timer simula avanço.');
?>
<form id="progresso" x-data x-form action="/api/demo/lento?ms=2500" method="post" enctype="multipart/form-data" novalidate>
    <div class="field">
        <label for="grande">Arquivo grande</label>
        <input id="grande" name="arquivo" type="file" data-form-v="required">
        <small class="hint">Sem arquivo grande à mão? Gere um no navegador:</small>
        <button type="button" @click="$form.addFiles('arquivo', [new File([new Uint8Array(80 * 1024 * 1024)], 'teste-80MB.bin', { type: 'application/octet-stream' })])">Gerar arquivo de 80 MB</button>
    </div>
    <div data-form-file-list="arquivo"></div>

    <div class="actions">
        <button type="submit" :disabled="$form.submitting">Enviar</button>
        <button type="button" data-form-cancel>Cancelar</button>
    </div>

    <div data-form-progress class="progress-box" aria-label="Progresso do envio">
        <div class="bar-track"><div class="bar-fill" data-form-progress-bar aria-label="Enviado"></div></div>
        <dl class="metrics">
            <dt>Enviado</dt><dd><span data-form-progress-percent></span> (<span data-form-progress-loaded></span> de <span data-form-progress-total></span>)</dd>
            <dt>Velocidade (estimada)</dt><dd data-form-progress-speed></dd>
            <dt>Tempo restante (estimado)</dt><dd data-form-progress-eta></dd>
            <dt>Tempo decorrido</dt><dd data-form-progress-elapsed></dd>
        </dl>
        <p data-form-status></p>
    </div>
    <p class="ok" x-show="$form.success" x-text="$form.result && $form.result.message"></p>
    <p role="alert" x-show="$form.failed" x-text="$form.error && $form.error.message"></p>
    <?php state_panel('{ phase: $form.phase, uploading: $form.uploading, awaitingResponse: $form.awaitingResponse, progress: $form.progress }'); ?>
</form>

<h2>Progresso indeterminado (transporte fetch)</h2>
<form id="indeterminado" x-data x-form action="/api/demo/lento?ms=1500" method="post" enctype="multipart/form-data" data-form-transport="fetch" novalidate>
    <input type="text" name="nota" value="sem arquivo" aria-label="Nota">
    <button type="submit">Enviar via fetch</button>
    <div data-form-progress class="progress-box">
        <progress data-form-progress-bar max="100" aria-label="Progresso indeterminado"></progress>
        <p data-form-status></p>
    </div>
    <?php state_panel('{ phase: $form.phase, indeterminate: $form.progress.indeterminate }'); ?>
</form>

<h2>Timeout depois do upload (resultado desconhecido)</h2>
<form id="timeout" x-data x-form action="/api/demo/lento?ms=4000" method="post" data-form-timeout="1s" novalidate>
    <input type="text" name="nota" value="vai expirar" aria-label="Nota">
    <button type="submit">Enviar com timeout de 1 s</button>
    <p data-form-status></p>
    <p role="alert" x-show="$form.failed" x-text="$form.error && $form.error.kind + ': ' + $form.error.message"></p>
</form>
<?php layout_end('<ul>
<li>No modo multipart, <code>loaded</code>/<code>total</code> são bytes do corpo HTTP (inclui boundaries e cabeçalhos das partes), não só bytes úteis do arquivo.</li>
<li>Velocidade usa janela deslizante de 3 s; o ETA só aparece após 1 s e com total conhecido. Ambos são estimativas.</li>
<li>Em localhost o envio é quase instantâneo: use o DevTools (Network → throttling) para observar o progresso.</li>
<li>Cross-origin: registrar listeners de upload força preflight CORS; o servidor precisa responder ao OPTIONS.</li>
<li>Se a conexão cair ou o tempo esgotar depois do upload completo, o resultado é desconhecido: a biblioteca não reenvia automaticamente.</li>
</ul>'); ?>
