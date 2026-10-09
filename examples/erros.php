<?php require __DIR__ . '/_layout.php';
layout_start('Erros do backend', 'Quatro formulários independentes na mesma página (estado isolado). Cada um usa um contrato de resposta diferente.');
?>
<form id="erros-padrao" x-data="{ cenario: 'erro-logico' }" x-form :action="'/api/demo/' + cenario" method="post" novalidate>
    <h2>Contrato padrão</h2>
    <div class="field">
        <label for="cenario">Cenário</label>
        <select id="cenario" x-model="cenario" data-form-ignore>
            <option value="erro-logico">HTTP 200 com success:false + erro sem campo</option>
            <option value="sem-conteudo">HTTP 204 (sem conteúdo)</option>
            <option value="html">HTML de login com HTTP 200</option>
            <option value="texto">Texto puro inesperado</option>
            <option value="erro-servidor">HTTP 500</option>
            <option value="nao-autorizado">HTTP 401</option>
            <option value="proibido">HTTP 403</option>
            <option value="csrf">HTTP 419 (CSRF)</option>
            <option value="muito-grande">HTTP 413 (HTML de proxy)</option>
            <option value="limite">HTTP 429 com Retry-After</option>
            <option value="sucesso">Sucesso</option>
        </select>
    </div>
    <div class="field">
        <label for="nome-erros">Nome</label>
        <input id="nome-erros" name="nome" value="Maria">
    </div>
    <button type="submit">Enviar</button>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ phase: $form.phase, error: $form.error, result: $form.result, generalErrors: $form.generalErrors, errors: $form.errors }'); ?>
</form>

<form id="erros-laravel" x-data x-form action="/api/demo/laravel" method="post" data-form-response-adapter="laravel" novalidate>
    <h2>Laravel (422 com errors)</h2>
    <div class="field">
        <label for="email-laravel">E-mail</label>
        <input id="email-laravel" name="email" value="ana@exemplo.com">
    </div>
    <div class="field">
        <label for="item-laravel">Item</label>
        <input id="item-laravel" name="itens[0][nome]" value="">
    </div>
    <button type="submit">Enviar</button>
    <p data-form-status class="hint"></p>
</form>

<form id="erros-joomla" x-data x-form action="/api/demo/joomla" method="post" data-form-response-adapter="joomla" novalidate>
    <h2>Joomla (JResponseJson)</h2>
    <div class="field">
        <label for="jform_title">Título</label>
        <input id="jform_title" name="jform[title]" value="">
    </div>
    <button type="submit">Enviar</button>
    <p data-form-status class="hint"></p>
</form>

<form id="erros-redirect" x-data="{ destino: 'redirect' }" x-form :action="'/api/demo/' + destino" method="post" data-form-redirect="response" novalidate>
    <h2>Redirecionamento seguro</h2>
    <label class="inline"><input type="radio" x-model="destino" value="redirect" data-form-ignore> Mesma origem (permitido)</label>
    <label class="inline"><input type="radio" x-model="destino" value="redirect-externo" data-form-ignore> Outra origem (bloqueado)</label>
    <div class="actions"><button type="submit">Enviar</button></div>
    <p data-form-status class="hint"></p>
</form>
<?php layout_end('<ul>
<li>HTTP 200 com <code>success:false</code> não é sucesso. Erros sem campo correspondente (<code>campo_inexistente</code>) vão para o resumo.</li>
<li>Resposta HTML (página de login, proxy) gera diagnóstico específico em vez de "JSON inválido". Detalhes ficam no console e em <code>$form.error.diagnostic</code>.</li>
<li><code>message</code> e <code>mensagem</code> são aceitos; erros podem ser string ou lista; chaves com colchetes (<code>jform[title]</code>) e com ponto (<code>itens.0.nome</code>) são associadas ao campo.</li>
<li>Erros do servidor são limpos quando o campo muda (<code>data-form-server-errors="clear-on-change"</code>, padrão).</li>
<li>Redirecionamentos só seguem URLs http(s) da mesma origem ou de origens listadas em <code>data-form-redirect-origins</code>.</li>
<li><code>request_id</code> da resposta é registrado no console para diagnóstico.</li>
</ul>'); ?>
