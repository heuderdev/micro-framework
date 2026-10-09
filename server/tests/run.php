<?php

declare(strict_types=1);

/**
 * Testes do backend de referência (sem dependências):
 *   php server/tests/run.php
 * Usa um diretório de armazenamento temporário isolado. Testes de concorrência iniciam
 * processos PHP reais (proc_open) que disputam a mesma sessão de upload / fila.
 */

require dirname(__DIR__) . '/bootstrap.php';

$tests = [];
$failures = 0;

function test(string $name, callable $fn): void
{
    $GLOBALS['tests'][] = [$name, $fn];
}

function assert_true(bool $condition, string $message = 'condição falsa'): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assert_same(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(($message ? $message . ': ' : '') . 'esperado ' . var_export($expected, true) . ', obtido ' . var_export($actual, true));
    }
}

function assert_throws(int $status, callable $fn): \AlpineForm\Server\HttpError
{
    try {
        $fn();
    } catch (\AlpineForm\Server\HttpError $error) {
        assert_same($status, $error->status, 'status HTTP');
        return $error;
    }
    throw new RuntimeException("Esperava HttpError {$status}");
}

function temp_storage(): string
{
    $dir = sys_get_temp_dir() . '/alpineform-tests-' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    $GLOBALS['temp_dirs'][] = $dir;
    return $dir;
}

/** @return resource */
function stream_of(string $data)
{
    $stream = fopen('php://memory', 'w+b');
    fwrite($stream, $data);
    rewind($stream);
    return $stream;
}

foreach (glob(__DIR__ . '/*Test.php') as $file) {
    require $file;
}

$start = microtime(true);
foreach ($tests as [$name, $fn]) {
    try {
        $fn();
        echo "  ✓ {$name}\n";
    } catch (\Throwable $error) {
        $failures++;
        echo "  ✗ {$name}\n      " . get_class($error) . ': ' . $error->getMessage() . "\n";
    }
}
$elapsed = round(microtime(true) - $start, 2);
foreach ($GLOBALS['temp_dirs'] ?? [] as $dir) {
    \AlpineForm\Server\Fs::removeTree($dir);
}
$total = count($tests);
echo "\n" . ($total - $failures) . "/{$total} testes passaram em {$elapsed}s (PHP " . PHP_VERSION . ")\n";
exit($failures > 0 ? 1 : 0);
