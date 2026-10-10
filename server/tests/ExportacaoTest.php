<?php

declare(strict_types=1);

use AlpineForm\Server\Exportacao;
use AlpineForm\Server\JobQueue;
use AlpineForm\Server\Request;

function requisicao_export(string $acceptEncoding = ''): Request
{
    return new Request('GET', '/api/exports/x/arquivo', $acceptEncoding ? ['accept-encoding' => $acceptEncoding] : [], [], [], []);
}

test('exportação em segundo plano: payload separa filtro, completo e linhas fictícias (com limite)', function () {
    $filtro = Exportacao::payload('filtro', ['uf' => 'SP', 'sort' => 'nome', 'linhas' => '10'], [], []);
    assert_same(['uf' => 'SP', 'sort' => 'nome'], $filtro['query']);
    assert_same(10, $filtro['sinteticas']);
    $completo = Exportacao::payload('completo', ['uf' => 'SP', 'linhas' => '99999999'], [], []);
    assert_same([], $completo['query'], 'completo ignora filtros');
    assert_same(Exportacao::MAX_LINHAS_SINTETICAS, $completo['sinteticas']);
});

test('exportação em segundo plano: worker gera o CSV comprimido com progresso e o dono baixa (gzip ou não)', function () {
    $storage = temp_storage();
    $queue = new JobQueue($storage);
    $job = $queue->create('dono', Exportacao::TIPO, Exportacao::payload('filtro', ['uf' => 'SP', 'linhas' => '30000'], [], []));
    $claimed = $queue->claimNext('w1');
    Exportacao::gerar($queue, $claimed, $storage);
    $final = $queue->get('dono', $job['id']);
    assert_same('succeeded', $final['status']);
    assert_same(100, $final['progress']);
    $esperadas = count(\AlpineForm\Server\Api::clientesDemo(['uf' => 'SP'])) + 30000;
    assert_same($esperadas, $final['result']['linhas']);
    assert_same('/api/exports/' . $job['id'] . '/arquivo', $final['result']['url']);
    assert_true(str_starts_with($final['result']['arquivo'], 'clientes-filtrado-'), 'nome do arquivo');
    assert_same([], glob($storage . '/exports/*.tmp') ?: [], 'temporário removido');

    [$status, $corpo, $headers] = Exportacao::baixar($queue, $storage, 'dono', $job['id'], requisicao_export('gzip, deflate'));
    assert_same(200, $status);
    assert_same('gzip', $headers['Content-Encoding']);
    $texto = gzdecode(stream_get_contents($corpo));
    fclose($corpo);
    assert_same($esperadas + 1, substr_count($texto, "\r\n"), 'cabeçalho + linhas');
    assert_true(str_contains($texto, 'Cliente fictício 30000'), 'última linha fictícia');

    [, $corpo, $headers] = Exportacao::baixar($queue, $storage, 'dono', $job['id'], requisicao_export());
    assert_true(!isset($headers['Content-Encoding']), 'sem gzip quando o cliente não aceita');
    $plano = stream_get_contents($corpo);
    fclose($corpo);
    assert_same($texto, $plano, 'descompactado em fluxo é idêntico');

    assert_throws(404, fn () => Exportacao::baixar($queue, $storage, 'intruso', $job['id'], requisicao_export()));
    unlink(Exportacao::caminho($storage, $job['id']));
    assert_throws(410, fn () => Exportacao::baixar($queue, $storage, 'dono', $job['id'], requisicao_export()));
});

test('exportação em segundo plano: cancelamento durante a geração não deixa arquivo; job não terminado não baixa', function () {
    $storage = temp_storage();
    $queue = new JobQueue($storage);
    $job = $queue->create('dono', Exportacao::TIPO, Exportacao::payload('completo', ['linhas' => '200000'], [], []));
    assert_throws(404, fn () => Exportacao::baixar($queue, $storage, 'dono', $job['id'], requisicao_export()));
    $claimed = $queue->claimNext('w1');
    $queue->requestCancel('dono', $job['id']);
    Exportacao::gerar($queue, $claimed, $storage);
    assert_same('canceled', $queue->get('dono', $job['id'])['status']);
    assert_same([], glob($storage . '/exports/*') ?: [], 'nenhum arquivo (nem temporário) sobra');
});

test('exportação em segundo plano: limpeza remove arquivos antigos', function () {
    $storage = temp_storage();
    mkdir($storage . '/exports', 0777, true);
    file_put_contents($storage . '/exports/' . str_repeat('a', 32) . '.csv.gz', 'x');
    file_put_contents($storage . '/exports/' . str_repeat('b', 32) . '.csv.gz', 'x');
    touch($storage . '/exports/' . str_repeat('a', 32) . '.csv.gz', time() - 3600);
    assert_same(1, Exportacao::cleanup($storage, 60));
    assert_true(is_file($storage . '/exports/' . str_repeat('b', 32) . '.csv.gz'));
});
