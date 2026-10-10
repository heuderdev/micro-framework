<?php

declare(strict_types=1);

/**
 * Servidor da documentação (somente arquivos estáticos).
 *
 *   php -S 0.0.0.0:1900 scripts/docs-server.php      (ou: npm run docs:serve)
 *
 *   /            -> guia com exemplos (docs/index.html)
 *   /*.html      -> páginas de docs/
 *   /assets/*    -> CSS/JS da documentação
 *   /tecnica     -> documentação técnica interna (doc.html)
 *
 * Nada fora de docs/ é servido (exceto doc.html); caminhos com ".." são recusados.
 */

$root = dirname(__DIR__);
$docs = realpath($root . '/docs');
$path = rawurldecode(parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');

if ($path === '/tecnica' || $path === '/doc.html') {
    $file = $root . '/doc.html';
} else {
    if ($path === '/' || $path === '') {
        $path = '/index.html';
    }
    $file = realpath($docs . $path);
    if ($file === false || !str_starts_with($file, $docs . DIRECTORY_SEPARATOR) || !is_file($file)) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><title>Não encontrado</title><p>Página não encontrada. <a href="/">Voltar ao início da documentação</a>.</p>';
        return true;
    }
}

$types = [
    'html' => 'text/html; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'js' => 'text/javascript; charset=utf-8',
    'md' => 'text/markdown; charset=utf-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'ico' => 'image/x-icon',
];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache');
readfile($file);
return true;
