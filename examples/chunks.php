<?php require __DIR__ . '/_layout.php';
layout_start('Upload em partes com pausa e retomada', 'Módulo opcional <code>alpine-form-chunks</code>: o arquivo é dividido com <code>Blob.slice</code>, enviado em partes com concorrência limitada e retry com backoff, verificado por SHA-256 por parte e montado no servidor. O formulário recebe um <strong>token</strong>, não o arquivo.', ['chunks' => true]);
?>
<form id="chunks" x-data x-form action="/api/documentos" method="post" novalidate>
    <div class="field">
        <label for="titulo">Título</label>
        <input id="titulo" name="titulo" value="Documento grande" data-form-v="required">
    </div>
    <div class="field">
        <label for="arquivo">Arquivo</label>
        <input id="arquivo" name="arquivo" type="file"
               data-form-chunked
               data-form-chunk-endpoint="/api/uploads"
               data-form-chunk-size="1MiB"
               data-form-chunk-concurrency="3"
               data-form-chunk-retries="5"
               data-form-chunk-persist
               data-form-v="required|file_max:2GB">
        <button type="button" @click="$form.addFiles('arquivo', [new File([new Uint8Array(24 * 1024 * 1024).map((_, i) => i % 251)], 'grande-24MB.bin', { type: 'application/octet-stream', lastModified: 1700000000000 })])">Gerar arquivo de 24 MB</button>
    </div>
    <div data-form-file-list="arquivo"></div>

    <div class="actions">
        <button type="submit" :disabled="$form.submitting">Enviar</button>
        <button type="button" data-form-pause>Pausar</button>
        <button type="button" data-form-resume>Retomar</button>
        <button type="button" data-form-cancel>Cancelar</button>
    </div>

    <div data-form-progress class="progress-box">
        <div class="bar-track"><div class="bar-fill" data-form-progress-bar aria-label="Bytes confirmados"></div></div>
        <dl class="metrics">
            <dt>Enviado</dt><dd><span data-form-progress-percent></span> (<span data-form-progress-loaded></span> de <span data-form-progress-total></span>)</dd>
            <dt>Velocidade (estimada)</dt><dd data-form-progress-speed></dd>
            <dt>Restante (estimado)</dt><dd data-form-progress-eta></dd>
        </dl>
        <p data-form-status></p>
    </div>

    <template x-if="$form.uploads.arquivo && $form.uploads.arquivo.resumable && $form.uploads.arquivo.resumable.length">
        <p class="hint">Há envio(s) incompleto(s) salvo(s) neste navegador. Selecione o MESMO arquivo e envie para retomar de onde parou.</p>
    </template>
    <p class="ok" x-show="$form.success" x-text="$form.result && $form.result.message"></p>
    <?php state_panel('{ phase: $form.phase, uploads: $form.uploads, progress: $form.progress, errors: $form.errors, resultado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li>Pausar aborta as partes em voo (seus bytes deixam de contar) e não agenda novas; retomar consulta o servidor para saber quais partes já foram confirmadas.</li>
<li>Progresso = bytes de partes confirmadas + bytes em voo. Uma parte repetida volta a zero antes de contar de novo: não há dupla contagem.</li>
<li>Com <code>data-form-chunk-persist</code>, somente metadados (uploadId, nome, tamanho, data) vão para o localStorage. Após recarregar, o navegador NÃO mantém acesso ao arquivo: é preciso selecioná-lo de novo. A identificação usa nome, tamanho, data e hash de amostras do início e do fim (identificação rápida, não verificação de integridade).</li>
<li>Integridade: SHA-256 por parte (cabeçalho <code>X-Chunk-Sha256</code>) e manifesto final; requer contexto seguro (HTTPS ou localhost) para <code>crypto.subtle</code>.</li>
<li>Sessão expirada (404/410) é recriada uma vez automaticamente; o envio recomeça do zero.</li>
<li>Upload concluído ≠ operação concluída: o endpoint do formulário vincula o token e só então grava o registro.</li>
</ul>'); ?>
