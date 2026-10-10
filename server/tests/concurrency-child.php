<?php

declare(strict_types=1);

/**
 * Processo auxiliar dos testes de concorrência. Uso interno:
 *   php concurrency-child.php <ação> <storage> <uploadId|x> <índice-do-processo>
 */

use AlpineForm\Server\ChunkStore;
use AlpineForm\Server\Fs;
use AlpineForm\Server\HttpError;
use AlpineForm\Server\JobQueue;

require dirname(__DIR__) . '/bootstrap.php';

function child_payload(int $size): string
{
    $out = '';
    for ($i = 0; $i < $size; $i++) {
        $out .= chr(65 + ($i % 26));
    }
    return $out;
}

function child_stream(string $data)
{
    $stream = fopen('php://memory', 'w+b');
    fwrite($stream, $data);
    rewind($stream);
    return $stream;
}

[$script, $action, $root, $uploadId, $worker] = $argv + [null, null, null, null, '0'];
$store = new ChunkStore($root, [
    'max_file_bytes' => 10 * 1024 * 1024,
    'min_chunk_bytes' => 4,
    'max_chunk_bytes' => 1024 * 1024,
    'max_parts' => 1000,
    'session_ttl' => 3600,
    'unbound_ttl' => 3600,
    'max_open_sessions_per_owner' => 5,
]);
$data = child_payload(64);

try {
    switch ($action) {
        case 'put-same':
            $part = substr($data, 0, 16);
            echo json_encode($store->putPart('dono', $uploadId, 0, 0, 16, null, child_stream($part)));
            break;
        case 'put-index':
            $index = (int) $worker;
            $part = substr($data, $index * 16, 16);
            echo json_encode($store->putPart('dono', $uploadId, $index, $index * 16, 16, hash('sha256', $part), child_stream($part)));
            break;
        case 'complete':
            echo json_encode($store->complete('dono', $uploadId, null));
            break;
        case 'claim-all':
            $queue = new JobQueue($root);
            $claimed = [];
            while (($job = $queue->claimNext('w' . $worker)) !== null) {
                $claimed[] = $job['id'];
                usleep(20000);
            }
            echo json_encode(['claimed' => $claimed]);
            break;
        case 'rw':
            // processo 0 grava o mesmo JSON atomicamente; os demais leem em laço (como a API respondendo ao polling)
            $alvo = $root . '/corrida/job.json';
            $fim = $root . '/corrida/fim';
            if ((int) $worker === 0) {
                $falhas = 0;
                for ($i = 0; $i < 100; $i++) {
                    try {
                        Fs::writeJsonAtomic($alvo, ['i' => $i, 'x' => str_repeat('a', 400)]);
                    } catch (Throwable $e) {
                        $falhas++;
                    }
                }
                touch($fim);
                echo json_encode(['falhas' => $falhas]);
            } else {
                $leituras = 0;
                $limite = microtime(true) + 20;
                while (!is_file($fim) && microtime(true) < $limite) {
                    Fs::readJson($alvo);
                    $leituras++;
                }
                echo json_encode(['leituras' => $leituras]);
            }
            break;
        default:
            echo json_encode(['error' => 'ação desconhecida']);
    }
} catch (HttpError $error) {
    echo json_encode(['status' => $error->status, 'message' => $error->getMessage()]);
}
