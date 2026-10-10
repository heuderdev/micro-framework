<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/bootstrap.php';

use AlpineForm\Server\Session;

Session::start();
$csrf = Session::csrf();
Session::release();

/**
 * Cabeçalho comum dos exemplos. Ordem de carregamento obrigatória:
 *   1. alpine-form(.min).js  2. módulos opcionais  3. Alpine com defer
 * @param array{masks?: bool, chunks?: bool, inspectors?: bool, bootstrap?: bool, rascunho?: bool, lista?: bool, opcoes?: bool, preencher?: bool, avisos?: bool, esm?: bool} $modules
 */
function layout_start(string $title, string $intro, array $modules = []): void
{
    global $csrf;
    $bootstrap = !empty($modules['bootstrap']);
    ?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrf, ENT_QUOTES) ?>">
    <title><?= htmlspecialchars($title) ?> · Exemplos AlpineForm</title>
    <?php if ($bootstrap): ?>
    <link rel="stylesheet" href="/vendor/bootstrap.min.css">
    <?php else: ?>
    <link rel="stylesheet" href="/examples/examples.css">
    <?php endif; ?>
    <link rel="stylesheet" href="/css/alpine-form.css">
    <?php if (!empty($modules['esm'])): ?>
    <script type="module" src="/examples/esm-boot.js"></script>
    <?php else: ?>
    <script src="/dist/alpine-form.js"></script>
    <?php if (!empty($modules['masks'])): ?><script src="/dist/alpine-form-masks.js"></script><?php endif; ?>
    <?php if (!empty($modules['chunks'])): ?><script src="/dist/alpine-form-chunks.js"></script><?php endif; ?>
    <?php if (!empty($modules['inspectors'])): ?><script src="/dist/alpine-form-inspectors.js"></script><?php endif; ?>
    <?php if ($bootstrap): ?><script src="/dist/alpine-form-bootstrap.js"></script><?php endif; ?>
    <?php if (!empty($modules['rascunho'])): ?><script src="/dist/alpine-form-rascunho.js"></script><?php endif; ?>
    <?php if (!empty($modules['lista'])): ?><script src="/dist/alpine-form-lista.js"></script><?php endif; ?>
    <?php if (!empty($modules['opcoes'])): ?><script src="/dist/alpine-form-opcoes.js"></script><?php endif; ?>
    <?php if (!empty($modules['preencher'])): ?><script src="/dist/alpine-form-preencher.js"></script><?php endif; ?>
    <?php if (!empty($modules['avisos'])): ?><script src="/dist/alpine-form-avisos.js"></script><?php endif; ?>
    <script defer src="/vendor/alpine.min.js"></script>
    <?php endif; ?>
</head>
<body class="<?= $bootstrap ? 'bg-body-tertiary' : '' ?>">
<main class="<?= $bootstrap ? 'container py-4' : 'page' ?>">
    <p><a href="/examples/">← Todos os exemplos</a></p>
    <h1><?= htmlspecialchars($title) ?></h1>
    <p class="intro"><?= $intro ?></p>
    <?php
}

function layout_end(string $notes = ''): void
{
    if ($notes !== '') {
        echo '<section class="notes"><h2>Comportamento esperado e limitações</h2>' . $notes . '</section>';
    }
    echo "</main>\n</body>\n</html>\n";
}

/** Painel de estado para inspeção manual e testes E2E (somente leitura). */
function state_panel(string $expression = '{ phase: $form.phase, dirty: $form.dirty, submitting: $form.submitting, errors: $form.errors, status: $form.status, result: $form.result }'): void
{
    echo '<details class="state" open><summary>Estado ($form)</summary><pre data-testid="state" x-text="JSON.stringify(' . htmlspecialchars($expression, ENT_QUOTES) . ', null, 2)"></pre></details>';
}
