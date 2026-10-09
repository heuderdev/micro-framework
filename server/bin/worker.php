<?php

declare(strict_types=1);

/**
 * Worker da fila de processamento (backend de referência).
 *
 *   php server/bin/worker.php            # processa continuamente (Ctrl+C para sair)
 *   php server/bin/worker.php --once     # processa o que houver na fila e sai
 *   php server/bin/worker.php --idle=500 # intervalo de espera sem jobs, em ms
 *
 * Tarefa de exemplo "import_csv": lê o CSV em fluxo (sem carregar inteiro), conta linhas, soma a
 * coluna "valor" (se existir) com aritmética decimal em string e calcula SHA-256 incremental.
 * O progresso é a fração de BYTES lidos, informada pelo próprio processamento (não estimada).
 * "delayMs" no payload desacelera a tarefa apenas para tornar o progresso visível na demonstração.
 */

use AlpineForm\Server\JobQueue;
use AlpineForm\Server\Validator;

require dirname(__DIR__) . '/bootstrap.php';

$options = getopt('', ['once', 'idle::']);
$once = isset($options['once']);
$idleMs = isset($options['idle']) ? max(50, (int) $options['idle']) : 500;
$workerId = gethostname() . ':' . getmypid();
$queue = new JobQueue(alpineform_config()['storage']);

function decimal_add(string $a, string $b): string
{
    if (function_exists('bcadd')) {
        return bcadd($a, $b, 2);
    }
    $toCents = static function (string $v): int {
        $neg = str_starts_with($v, '-');
        [$i, $f] = array_pad(explode('.', ltrim($v, '-+')), 2, '');
        $cents = (int) $i * 100 + (int) str_pad(substr($f, 0, 2), 2, '0');
        return $neg ? -$cents : $cents;
    };
    $sum = $toCents($a) + $toCents($b);
    $sign = $sum < 0 ? '-' : '';
    $sum = abs($sum);
    return $sign . intdiv($sum, 100) . '.' . str_pad((string) ($sum % 100), 2, '0', STR_PAD_LEFT);
}

/** @param array<string, mixed> $job */
function process_import(JobQueue $queue, array $job): void
{
    $path = (string) $job['payload']['path'];
    $delay = (int) ($job['payload']['delayMs'] ?? 0);
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        $queue->update($job['id'], ['status' => 'failed', 'error' => 'Arquivo do processamento não encontrado.', 'message' => 'Falhou.']);
        return;
    }
    $size = max(1, (int) filesize($path));
    $hash = hash_init('sha256');
    $header = null;
    $valueIndex = null;
    $lines = 0;
    $sum = '0.00';
    $invalid = 0;
    $lastReported = -1;
    try {
        while (($line = fgets($handle)) !== false) {
            hash_update($hash, $line);
            $row = str_getcsv(rtrim($line, "\r\n"), str_contains($line, ';') ? ';' : ',');
            if ($header === null) {
                $header = array_map(static fn ($h) => strtolower(trim((string) $h, " \t\n\r\0\x0B\xEF\xBB\xBF")), $row);
                $found = array_search('valor', $header, true);
                $valueIndex = $found === false ? null : $found;
                continue;
            }
            if ($row === [null] || $row === ['']) {
                continue;
            }
            $lines++;
            if ($valueIndex !== null) {
                $raw = trim((string) ($row[$valueIndex] ?? ''));
                $normalized = str_contains($raw, ',') ? str_replace(['.', ','], ['', '.'], $raw) : $raw;
                if (preg_match('/^-?\d+(\.\d+)?$/', $normalized) === 1) {
                    $sum = decimal_add($sum, $normalized);
                } else {
                    $invalid++;
                }
            }
            $progress = (int) floor(ftell($handle) / $size * 100);
            if ($progress >= $lastReported + 10 || $progress === 100) {
                $lastReported = $progress;
                if ($queue->isCancelRequested($job['id'])) {
                    $queue->update($job['id'], ['status' => 'canceled', 'message' => 'Processamento cancelado a pedido do usuário.']);
                    return;
                }
                $queue->update($job['id'], ['progress' => min(99, $progress), 'message' => "{$lines} linha(s) processada(s)."]);
                if ($delay > 0) {
                    usleep($delay * 1000);
                }
            }
        }
    } finally {
        fclose($handle);
    }
    if ($header === null) {
        $queue->update($job['id'], ['status' => 'failed', 'error' => 'CSV vazio.', 'message' => 'Falhou.']);
        return;
    }
    $queue->update($job['id'], [
        'status' => 'succeeded',
        'progress' => 100,
        'message' => 'Processamento concluído.',
        'result' => [
            'linhas' => $lines,
            'colunas' => $header,
            'soma_valor' => $valueIndex === null ? null : $sum,
            'valores_invalidos' => $invalid,
            'sha256' => hash_final($hash),
            'validador' => Validator::class,
        ],
    ]);
}

$running = true;
if (function_exists('pcntl_signal')) {
    pcntl_async_signals(true);
    pcntl_signal(SIGTERM, static function () use (&$running): void {
        $running = false;
    });
}

fwrite(STDOUT, "[worker {$workerId}] iniciado" . ($once ? ' (--once)' : '') . PHP_EOL);
while ($running) {
    $job = $queue->claimNext($workerId);
    if ($job === null) {
        if ($once) {
            break;
        }
        usleep($idleMs * 1000);
        continue;
    }
    fwrite(STDOUT, "[worker] job {$job['id']} ({$job['type']})" . PHP_EOL);
    try {
        if ($job['type'] === 'import_csv') {
            process_import($queue, $job);
        } else {
            $queue->update($job['id'], ['status' => 'failed', 'error' => 'Tipo de job desconhecido.']);
        }
    } catch (\Throwable $error) {
        $queue->update($job['id'], ['status' => 'failed', 'error' => 'Falha interna no processamento.', 'message' => 'Falhou.']);
        fwrite(STDERR, '[worker] erro: ' . $error->getMessage() . PHP_EOL);
    }
}
