<?php

declare(strict_types=1);

/**
 * Limpeza de órfãos e temporários. Agende (cron/Agendador de Tarefas), por exemplo a cada hora:
 *   php server/bin/cleanup.php
 */

use AlpineForm\Server\ChunkStore;
use AlpineForm\Server\Exportacao;
use AlpineForm\Server\Idempotency;
use AlpineForm\Server\JobQueue;

require dirname(__DIR__) . '/bootstrap.php';

$config = alpineform_config();
$chunks = (new ChunkStore($config['storage'], $config['chunks']))->cleanup();
$jobs = (new JobQueue($config['storage']))->cleanup($config['jobs']['retention']);
$idem = (new Idempotency($config['storage'], $config['idempotency_ttl']))->cleanup();
$exports = Exportacao::cleanup($config['storage'], $config['jobs']['retention']);

echo json_encode(['uploads' => $chunks, 'jobs_removidos' => $jobs, 'idempotencia_removida' => $idem, 'exportacoes_removidas' => $exports], JSON_PRETTY_PRINT) . PHP_EOL;
