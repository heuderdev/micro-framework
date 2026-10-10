<?php require __DIR__ . '/_layout.php';
layout_start('Exemplos', 'Exemplos executáveis do AlpineForm usando o backend PHP de referência (<code>php -S 127.0.0.1:8080 server/router.php</code>). Cada página indica pré-requisitos, comportamento esperado e limitações.');
?>
<?php if (($_GET['ok'] ?? '') === '1'): ?>
<p class="ok" role="status">Redirecionamento seguro concluído (veio do exemplo de erros/redirect).</p>
<?php endif; ?>
<ol class="example-list">
    <li><a href="cadastro.php">Cadastro com validação ao vivo, senha e confirmação, validação remota e idempotência</a></li>
    <li><a href="condicionais.php">Campos condicionais (x-show, x-if, required_if, data-form-hidden)</a></li>
    <li><a href="remoto.php">Validação remota: debounce, cancelamento, cache e resultado inconclusivo</a></li>
    <li><a href="escolhas.php">Radios, checkboxes, select múltiplo e checkbox com valor desmarcado</a></li>
    <li><a href="linhas.php">Linhas repetidas (x-for) com erros do servidor por linha</a></li>
    <li><a href="arquivo-unico.php">Arquivo único</a></li>
    <li><a href="arquivos-multiplos.php">Múltiplos arquivos com seleção incremental, arrastar-e-soltar e remoção</a></li>
    <li><a href="imagem.php">Imagem com preview e regras de dimensão</a></li>
    <li><a href="csv.php">CSV verificado por amostragem (módulo de inspetores)</a></li>
    <li><a href="edicao.php">Edição com arquivos existentes e pedido de remoção</a></li>
    <li><a href="progresso.php">Upload grande com progresso real, espera de resposta e cancelamento</a></li>
    <li><a href="chunks.php">Upload em partes com pausa, retomada e persistência</a></li>
    <li><a href="processamento.php">Processamento no servidor após upload (HTTP 202 + polling)</a></li>
    <li><a href="erros.php">Erros do backend: Laravel, Joomla, 200 com success:false, 204, HTML, 5xx (vários formulários isolados)</a></li>
    <li><a href="mascaras.php">Máscaras: CPF/CNPJ, telefone, CEP, moeda, percentual, data e padrão personalizado</a></li>
    <li><a href="bootstrap.php">Adaptador Bootstrap 5</a></li>
    <li><a href="extensao.php">Extensões: validador síncrono/assíncrono, normalizador e componente externo</a></li>
    <li><a href="esm.php">Uso por importação ESM (sem bundler)</a></li>
    <li><a href="lista.php">Listagens: paginação, ordenação, filtros, URL, seleção, carregar mais e atualização por formulário</a></li>
    <li><a href="opcoes.php">Selects dependentes e opções remotas: UF → cidade → bairro, edição, linhas repetidas</a></li>
    <li><a href="rascunho.php">Rascunho automático (módulo alpine-form-rascunho): recarregue e os campos voltam</a></li>
    <li><a href="csp.php">CSP estrita (sem unsafe-eval) com a versão CSP do Alpine</a> · <a href="csp.php?tt=1">com Trusted Types</a></li>
</ol>
<?php layout_end(); ?>
