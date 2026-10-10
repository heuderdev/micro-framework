<?php

declare(strict_types=1);

/**
 * Exemplo com Content Security Policy estrita: sem 'unsafe-eval', sem 'unsafe-inline',
 * sem scripts inline. Usa a versão CSP do Alpine (@alpinejs/csp).
 * Com ?tt=1, exige também Trusted Types (require-trusted-types-for 'script').
 */

require_once dirname(__DIR__) . '/server/bootstrap.php';

use AlpineForm\Server\Session;

Session::start();
$csrf = Session::csrf();
Session::release();

$policy = implode('; ', [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
]);
if (($_GET['tt'] ?? '') === '1') {
    $policy .= "; require-trusted-types-for 'script'";
}
header('Content-Security-Policy: ' . $policy);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrf, ENT_QUOTES) ?>">
    <title>CSP estrita · Exemplos AlpineForm</title>
    <link rel="stylesheet" href="/examples/examples.css">
    <link rel="stylesheet" href="/css/alpine-form.css">
    <script src="/dist/alpine-form.min.js"></script>
    <script src="/dist/alpine-form-masks.min.js"></script>
    <script src="/examples/csp-app.js"></script>
    <script defer src="/vendor/alpine-csp.min.js"></script>
</head>
<body>
<main class="page">
    <p><a href="/examples/">← Todos os exemplos</a></p>
    <h1>CSP estrita (sem unsafe-eval)</h1>
    <p class="intro">Página servida com <code>script-src 'self'</code>, sem <code>'unsafe-eval'</code> e sem <code>'unsafe-inline'</code>, usando a versão CSP do Alpine. Nas expressões só valem caminhos de propriedade (<code>$form.submitting</code>); a lógica fica em <code>Alpine.data()</code> no arquivo <code>/examples/csp-app.js</code>.</p>

    <form id="csp-cadastro" x-data="cadastro" x-form action="/api/cadastro" method="post" data-form-idempotency novalidate>
        <div class="field">
            <label for="nome">Nome</label>
            <input id="nome" name="nome" data-form-v="required|min:3|max:120">
        </div>
        <div class="field">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" data-form-v="required|email"
                   data-form-remote="/api/validar-email" data-form-msg.remote="Este e-mail já está cadastrado.">
        </div>
        <div class="field">
            <label for="cpf">CPF</label>
            <input id="cpf" name="cpf" data-form-mask="cpf" data-form-v="required|cpf" data-form-submit-value="raw">
        </div>
        <div class="row">
            <div class="field">
                <label for="senha">Senha</label>
                <input id="senha" name="senha" type="password" autocomplete="new-password" data-form-v="required|min:8">
            </div>
            <div class="field">
                <label for="senha_confirmacao">Confirme a senha</label>
                <input id="senha_confirmacao" name="senha_confirmacao" type="password" autocomplete="new-password"
                       data-form-v="required|same:senha" data-form-msg.same="As senhas não conferem.">
            </div>
        </div>
        <fieldset>
            <legend>Tipo de pessoa</legend>
            <label class="inline"><input type="radio" name="tipo" value="pf" data-form-v="required"> Física</label>
            <label class="inline"><input type="radio" name="tipo" value="pj"> Jurídica</label>
        </fieldset>
        <div class="field" x-show="ehPj" data-form-hidden="skip">
            <label for="cnpj">CNPJ</label>
            <input id="cnpj" name="cnpj" data-form-mask="cnpj" data-form-v="required_if:tipo,pj|cnpj" data-form-submit-value="raw">
        </div>
        <label class="inline">
            <input type="checkbox" name="termos" value="1" data-form-v="accepted" data-form-label="os termos de uso"> Aceito os termos
        </label>
        <div class="actions">
            <button type="submit" x-bind:disabled="$form.submitting">Cadastrar</button>
            <button type="reset">Limpar</button>
        </div>
        <p data-form-status class="hint"></p>
        <p class="ok" x-show="$form.success" x-text="mensagemSucesso"></p>
    </form>

    <h2>Arquivo com preview, progresso e opções via Alpine.data</h2>
    <form id="csp-arquivo" x-data="envioArquivo" x-form="opcoes" action="/api/upload" method="post" enctype="multipart/form-data" novalidate>
        <div class="field">
            <label for="foto">Foto (PNG/JPG até 5 MB)</label>
            <input id="foto" name="foto" type="file" accept="image/png,image/jpeg"
                   data-form-v="required|image|file_max:5MB">
        </div>
        <div data-form-file-list="foto"></div>
        <div class="actions">
            <button type="submit" x-bind:disabled="$form.submitting">Enviar</button>
            <button type="button" data-form-cancel>Cancelar</button>
        </div>
        <div data-form-progress class="progress-box">
            <div class="bar-track"><div class="bar-fill" data-form-progress-bar aria-label="Enviado"></div></div>
            <p data-form-status></p>
        </div>
        <p class="hint" x-text="ultimoEvento"></p>
    </form>
</main>
</body>
</html>
