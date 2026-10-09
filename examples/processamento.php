<?php require __DIR__ . '/_layout.php';
layout_start('Processamento após upload', 'O servidor responde <code>202</code> com <code>{ job: { id, status_url, cancel_url } }</code>. A biblioteca consulta o status sem sobrepor requisições até <code>succeeded</code>, <code>failed</code> ou <code>canceled</code>.');
?>
<p class="hint"><strong>Pré-requisito:</strong> o worker precisa estar rodando em outro terminal: <code>php server/bin/worker.php</code>. Sem ele, o job fica em <em>queued</em> (não há fila invisível).</p>
<form id="processamento" x-data x-form action="/api/importacoes" method="post" enctype="multipart/form-data"
      data-form-job-interval="800ms" data-form-job-max-interval="5s" data-form-job-timeout="5min" data-form-job-persist novalidate>
    <input type="hidden" name="atraso_ms" value="400">
    <div class="field">
        <label for="planilha">Planilha CSV</label>
        <input id="planilha" name="planilha" type="file" accept=".csv" data-form-v="required|ext:csv">
        <button type="button" @click="$form.addFiles('planilha', [new File([['nome;valor', ...Array.from({ length: 5000 }, (_, i) => 'item ' + i + ';' + (i % 100) + ',50')].join('\n')], 'vendas.csv', { type: 'text/csv' })])">Gerar CSV de 5.000 linhas</button>
    </div>
    <div class="actions">
        <button type="submit" :disabled="$form.submitting">Enviar e processar</button>
        <button type="button" data-form-cancel>Parar de acompanhar</button>
        <button type="button" x-show="$form.processing" @click="$form.cancelJob().catch(e => alert(e.message))">Cancelar processamento no servidor</button>
    </div>
    <div data-form-progress class="progress-box">
        <div class="bar-track"><div class="bar-fill" data-form-progress-bar></div></div>
        <p data-form-status></p>
        <p class="hint" x-show="$form.job" x-text="$form.job && ('Job ' + $form.job.id.slice(0, 8) + '… · ' + $form.job.status + ($form.job.progress != null ? ' · ' + $form.job.progress + '%' : ' · progresso não informado'))"></p>
    </div>
    <template x-if="$form.success && $form.result && $form.result.data">
        <dl class="metrics">
            <dt>Linhas</dt><dd x-text="$form.result.data.linhas"></dd>
            <dt>Soma de "valor"</dt><dd x-text="$form.result.data.soma_valor"></dd>
            <dt>SHA-256</dt><dd x-text="$form.result.data.sha256"></dd>
        </dl>
    </template>
    <?php state_panel('{ phase: $form.phase, job: $form.job, error: $form.error }'); ?>
</form>
<?php layout_end('<ul>
<li>Fases: enviando bytes → aguardando resposta → processando no servidor → concluído. 100% enviado não é concluído.</li>
<li>O percentual de processamento só aparece porque o worker o informa (fração de bytes lidos). Sem essa informação, a barra fica indeterminada.</li>
<li>"Parar de acompanhar" encerra apenas o polling; o processamento continua no servidor. "Cancelar processamento" pede o cancelamento ao backend (DELETE), quando suportado.</li>
<li>Com <code>data-form-job-persist</code>, o id do job fica no sessionStorage: recarregue a página durante o processamento e o acompanhamento é retomado.</li>
</ul>'); ?>
