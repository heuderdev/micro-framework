<?php

declare(strict_types=1);

use AlpineForm\Server\Idempotency;
use AlpineForm\Server\JobQueue;

test('jobs: ciclo queued -> processing -> succeeded e visão pública', function () {
    $queue = new JobQueue(temp_storage());
    $job = $queue->create('dono', 'import_csv', ['path' => 'x']);
    assert_same('queued', $queue->get('dono', $job['id'])['status']);
    $claimed = $queue->claimNext('w1');
    assert_same($job['id'], $claimed['id']);
    assert_same(null, $queue->claimNext('w2'), 'fila vazia após reivindicação');
    $queue->update($job['id'], ['status' => 'succeeded', 'progress' => 100, 'result' => ['linhas' => 3]]);
    $view = JobQueue::publicView($queue->get('dono', $job['id']));
    assert_same('succeeded', $view['status']);
    assert_same(['linhas' => 3], $view['result']);
});

test('jobs: cancelamento de job enfileirado é imediato; em processamento é solicitado', function () {
    $queue = new JobQueue(temp_storage());
    $a = $queue->create('dono', 'x', []);
    assert_same('canceled', $queue->requestCancel('dono', $a['id'])['status']);
    $b = $queue->create('dono', 'x', []);
    $queue->claimNext('w');
    $after = $queue->requestCancel('dono', $b['id']);
    assert_same('processing', $after['status']);
    assert_true($queue->isCancelRequested($b['id']));
    $queue->update($b['id'], ['status' => 'canceled']);
    assert_throws(409, fn () => $queue->requestCancel('dono', $b['id']));
});

test('jobs: worker dedicado só reivindica os tipos que atende', function () {
    $queue = new JobQueue(temp_storage());
    $importacao = $queue->create('dono', 'import_csv', []);
    $exportacao = $queue->create('dono', 'export_csv', []);
    assert_same($exportacao['id'], $queue->claimNext('w-export', ['export_csv'])['id']);
    assert_same(null, $queue->claimNext('w-export', ['export_csv']));
    assert_same($importacao['id'], $queue->claimNext('w-geral')['id']);
});

test('jobs: outro dono não enxerga o job', function () {
    $queue = new JobQueue(temp_storage());
    $job = $queue->create('dono', 'x', []);
    assert_throws(404, fn () => $queue->get('intruso', $job['id']));
    assert_throws(404, fn () => $queue->requestCancel('intruso', $job['id']));
});

test('jobs: limpeza remove apenas finalizados antigos', function () {
    $now = 1000;
    $queue = new JobQueue(temp_storage(), function () use (&$now) {
        return $now;
    });
    $done = $queue->create('dono', 'x', []);
    $queue->update($done['id'], ['status' => 'failed']);
    $queue->create('dono', 'x', []);
    $now += 100;
    assert_same(1, $queue->cleanup(50));
});

test('idempotência: replay com mesmos dados, 422 com dados diferentes, 409 em andamento', function () {
    $idem = new Idempotency(temp_storage(), 3600);
    assert_same(false, $idem->begin('dono', 'cadastro', 'chave-12345', 'fp1')['replay']);
    assert_throws(409, fn () => $idem->begin('dono', 'cadastro', 'chave-12345', 'fp1'));
    $idem->complete('dono', 'cadastro', 'chave-12345', ['success' => true, 'data' => ['id' => 'a']]);
    $replay = $idem->begin('dono', 'cadastro', 'chave-12345', 'fp1');
    assert_true($replay['replay']);
    assert_same(['success' => true, 'data' => ['id' => 'a']], $replay['response']);
    assert_throws(422, fn () => $idem->begin('dono', 'cadastro', 'chave-12345', 'fp2'));
    assert_same(false, $idem->begin('outro-dono', 'cadastro', 'chave-12345', 'fp2')['replay'], 'escopo por dono');
    assert_throws(422, fn () => $idem->begin('dono', 'cadastro', 'curta', 'fp'));
});
