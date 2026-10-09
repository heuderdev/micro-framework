<?php require __DIR__ . '/_layout.php';
layout_start('CSV por amostragem', 'O módulo opcional de inspetores lê apenas os primeiros 64 KB do arquivo, interpreta com um parser RFC 4180 e verifica cabeçalho e consistência de colunas <strong>na amostra</strong>.', ['inspectors' => true]);
?>
<form id="csv" x-data x-form action="/api/upload" method="post" enctype="multipart/form-data" novalidate>
    <div class="field">
        <label for="planilha">Planilha CSV (colunas obrigatórias: nome, email, valor)</label>
        <input id="planilha" name="planilha" type="file" accept=".csv,text/csv"
               data-form-v="required|ext:csv|file_max:20MB|csv|csv_headers:nome,email,valor"
               data-form-csv-delimiter="auto"
               data-form-csv-sample="64KB">
    </div>
    <div data-form-file-list="planilha"></div>
    <div class="actions">
        <button type="submit">Enviar</button>
        <a href="data:text/csv;charset=utf-8,nome%3Bemail%3Bvalor%0AAna%3Bana%40ex.com%3B10%2C50%0ABruno%3Bbruno%40ex.com%3B20" download="exemplo-valido.csv">Baixar CSV válido</a>
        <a href="data:text/csv;charset=utf-8,nome%2Ctelefone%0AAna%2C1199" download="exemplo-invalido.csv">Baixar CSV sem colunas</a>
    </div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ errors: $form.errors, phase: $form.phase }'); ?>
</form>
<?php layout_end('<ul>
<li>As mensagens dizem "verificado em amostra": linhas além dos 64 KB iniciais não foram lidas no navegador.</li>
<li>Quando o arquivo é maior que a amostra, o último registro (possivelmente cortado) é descartado da análise.</li>
<li>Codificação padrão UTF-8 (<code>data-form-csv-encoding</code> aceita rótulos do TextDecoder, como windows-1252).</li>
<li>O processamento completo e a validação definitiva acontecem no servidor (veja o exemplo de processamento).</li>
</ul>'); ?>
