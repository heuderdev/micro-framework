<?php

declare(strict_types=1);

/**
 * Roteador para o servidor embutido do PHP:
 *   php -S 127.0.0.1:8080 server/router.php
 * (executado a partir da raiz do projeto, que é a docroot).
 *
 * Serve somente: /api/*, /examples/*, /dist/*, /css/*, /doc.html, /docs/* e /vendor/* (mapeado de node_modules).
 * Tudo o mais (server/, storage/, node_modules/, arquivos de configuração) responde 404.
 */

use AlpineForm\Server\Api;
use AlpineForm\Server\HttpError;
use AlpineForm\Server\Request;

require __DIR__ . '/bootstrap.php';

$root = dirname(__DIR__);
$path = rawurldecode(parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');

if ($path === '/' || $path === '/examples') {
    header('Location: /examples/', true, 302);
    return true;
}

if (str_starts_with($path, '/api/')) {
    $api = new Api(alpineform_config());
    try {
        [$status, $body, $headers] = $api->handle(Request::fromGlobals());
    } catch (HttpError $error) {
        [$status, $body, $headers] = [$error->status, $error->body() + ['request_id' => $api->requestId()], $error->headers];
    } catch (\Throwable $error) {
        error_log('[alpineform] ' . $error);
        [$status, $body, $headers] = [500, ['success' => false, 'message' => 'Erro interno.', 'request_id' => $api->requestId()], []];
    }
    http_response_code($status);
    header('X-Request-Id: ' . $api->requestId());
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    if ($body === null) {
        return true;
    }
    if (is_string($body)) {
        if (!isset($headers['Content-Type'])) {
            header('Content-Type: text/plain; charset=utf-8');
        }
        echo $body;
        return true;
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return true;
}

$vendor = [
    '/vendor/alpine.min.js' => $root . '/node_modules/alpinejs/dist/cdn.min.js',
    '/vendor/alpine.esm.js' => $root . '/node_modules/alpinejs/dist/module.esm.js',
    '/vendor/bootstrap.min.css' => $root . '/node_modules/bootstrap/dist/css/bootstrap.min.css',
];
if (isset($vendor[$path])) {
    if (!is_file($vendor[$path])) {
        http_response_code(404);
        echo 'Dependência não instalada. Execute npm install.';
        return true;
    }
    header('Content-Type: ' . (str_ends_with($path, '.css') ? 'text/css' : 'text/javascript') . '; charset=utf-8');
    readfile($vendor[$path]);
    return true;
}

$allowed = ['/examples/', '/dist/', '/css/', '/docs/'];
$isAllowed = $path === '/doc.html';
foreach ($allowed as $prefix) {
    if (str_starts_with($path, $prefix)) {
        $isAllowed = true;
    }
}
$real = realpath($root . $path);
if (!$isAllowed || str_contains($path, '..') || ($real !== false && !str_starts_with($real, $root))) {
    http_response_code(404);
    echo 'Não encontrado.';
    return true;
}
if (is_dir($root . $path) && is_file($root . rtrim($path, '/') . '/index.php')) {
    $_SERVER['SCRIPT_NAME'] = rtrim($path, '/') . '/index.php';
    require $root . rtrim($path, '/') . '/index.php';
    return true;
}
if (str_starts_with(basename($path), '_')) {
    http_response_code(404);
    echo 'Não encontrado.';
    return true;
}
return false;
