<?php

declare(strict_types=1);

use AlpineForm\Server\ChunkStore;
use AlpineForm\Server\JobQueue;

function expected_payload(int $size): string
{
    $out = '';
    for ($i = 0; $i < $size; $i++) {
        $out .= chr(65 + ($i % 26));
    }
    return $out;
}

/**
 * Inicia $count processos PHP executando concurrency-child.php com os argumentos dados e
 * retorna as saídas (uma linha JSON por processo).
 * @return list<array<string, mixed>>
 */
function run_children(int $count, array $args): array
{
    $procs = [];
    for ($i = 0; $i < $count; $i++) {
        $cmd = array_merge([PHP_BINARY, __DIR__ . '/concurrency-child.php'], array_map('strval', $args), [(string) $i]);
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $procs[] = [$proc, $pipes];
    }
    $results = [];
    foreach ($procs as [$proc, $pipes]) {
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        $decoded = json_decode(trim($out), true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Processo filho falhou: ' . $out . $err);
        }
        $results[] = $decoded;
    }
    return $results;
}

test('concorrência: 6 processos enviando a mesma parte geram um único registro consistente', function () {
    $root = temp_storage();
    $store = chunk_store($root);
    $session = $store->create('dono', ['name' => 'c.bin', 'size' => 64, 'chunkSize' => 16]);
    $results = run_children(6, ['put-same', $root, $session['uploadId']]);
    $duplicates = count(array_filter($results, fn ($r) => ($r['duplicate'] ?? null) === true));
    $fresh = count(array_filter($results, fn ($r) => ($r['duplicate'] ?? null) === false));
    assert_same(1, $fresh, 'exatamente uma gravação nova');
    assert_same(5, $duplicates, 'demais idempotentes');
    $status = $store->status('dono', $session['uploadId']);
    assert_same(1, count($status['receivedParts']));
});

test('concorrência: partes diferentes em paralelo e finalização concorrente montam uma única vez', function () {
    $root = temp_storage();
    $store = chunk_store($root);
    $session = $store->create('dono', ['name' => 'c.bin', 'size' => 64, 'chunkSize' => 16]);
    $results = run_children(4, ['put-index', $root, $session['uploadId']]);
    assert_same(4, count(array_filter($results, fn ($r) => isset($r['index']))));
    $completions = run_children(5, ['complete', $root, $session['uploadId']]);
    $tokens = array_unique(array_column($completions, 'token'));
    assert_same(1, count($tokens), 'todas as finalizações devem devolver o mesmo token');
    $bound = $store->bind('dono', $tokens[0], $root . '/final');
    assert_same(expected_payload(64), file_get_contents($bound['path']));
});

test('concorrência: workers disputando a fila não processam o mesmo job duas vezes', function () {
    $root = temp_storage();
    $queue = new JobQueue($root);
    for ($i = 0; $i < 6; $i++) {
        $queue->create('dono', 'noop', ['n' => $i]);
    }
    $results = run_children(4, ['claim-all', $root, 'x']);
    $claimed = array_merge(...array_map(fn ($r) => $r['claimed'], $results));
    assert_same(6, count($claimed), 'todos os jobs reivindicados');
    assert_same(6, count(array_unique($claimed)), 'nenhum job reivindicado duas vezes');
});
