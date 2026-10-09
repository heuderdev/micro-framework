<?php

declare(strict_types=1);

use AlpineForm\Server\ChunkStore;

function chunk_store(string $root, ?Closure $clock = null): ChunkStore
{
    return new ChunkStore($root, [
        'max_file_bytes' => 10 * 1024 * 1024,
        'min_chunk_bytes' => 4,
        'max_chunk_bytes' => 1024 * 1024,
        'max_parts' => 1000,
        'session_ttl' => 3600,
        'unbound_ttl' => 3600,
        'max_open_sessions_per_owner' => 5,
    ], $clock);
}

/** Cria sessão para $data com partes de $chunk bytes e envia as partes indicadas. */
function upload_parts(ChunkStore $store, string $owner, string $data, int $chunk, ?array $only = null): array
{
    $session = $store->create($owner, ['name' => 'a.txt', 'size' => strlen($data), 'chunkSize' => $chunk]);
    $parts = str_split($data, $chunk);
    foreach ($parts as $i => $part) {
        if ($only !== null && !in_array($i, $only, true)) {
            continue;
        }
        $store->putPart($owner, $session['uploadId'], $i, $i * $chunk, strlen($part), hash('sha256', $part), stream_of($part));
    }
    return [$session, $parts];
}

test('chunks: cria sessão, envia partes, finaliza e monta arquivo idêntico', function () {
    $root = temp_storage();
    $store = chunk_store($root);
    $data = str_repeat('abcdefghij', 10) . 'xyz';
    [$session, $parts] = upload_parts($store, 'dono', $data, 16);
    assert_same(7, $session['totalParts']);
    $manifest = ChunkStore::manifest(array_map(fn ($p) => hash('sha256', $p), $parts));
    $result = $store->complete('dono', $session['uploadId'], $manifest);
    assert_same('completed', $result['status']);
    $bound = $store->bind('dono', $result['token'], $root . '/final');
    assert_same($data, file_get_contents($bound['path']));
});

test('chunks: repetir parte com mesmo conteúdo é idempotente', function () {
    $store = chunk_store(temp_storage());
    [$session, $parts] = upload_parts($store, 'dono', str_repeat('x', 40), 10, [0]);
    $again = $store->putPart('dono', $session['uploadId'], 0, 0, 10, null, stream_of($parts[0]));
    assert_true($again['duplicate'] === true, 'deveria marcar duplicada');
    assert_same(1, $again['received']);
});

test('chunks: parte repetida com conteúdo diferente gera 409', function () {
    $store = chunk_store(temp_storage());
    [$session] = upload_parts($store, 'dono', str_repeat('x', 40), 10, [0]);
    assert_throws(409, fn () => $store->putPart('dono', $session['uploadId'], 0, 0, 10, null, stream_of(str_repeat('y', 10))));
});

test('chunks: offset/tamanho incompatíveis e checksum errado são rejeitados', function () {
    $store = chunk_store(temp_storage());
    $session = $store->create('dono', ['name' => 'a', 'size' => 25, 'chunkSize' => 10]);
    assert_throws(422, fn () => $store->putPart('dono', $session['uploadId'], 1, 5, 10, null, stream_of(str_repeat('a', 10))));
    assert_throws(422, fn () => $store->putPart('dono', $session['uploadId'], 2, 20, 10, null, stream_of(str_repeat('a', 10))));
    assert_throws(422, fn () => $store->putPart('dono', $session['uploadId'], 0, 0, 10, str_repeat('0', 64), stream_of(str_repeat('a', 10))));
    assert_throws(422, fn () => $store->putPart('dono', $session['uploadId'], 0, 0, 10, null, stream_of(str_repeat('a', 7))));
    assert_throws(422, fn () => $store->putPart('dono', $session['uploadId'], 9, 90, 10, null, stream_of(str_repeat('a', 10))));
});

test('chunks: finalizar com partes faltando gera 409 e não cria arquivo', function () {
    $root = temp_storage();
    $store = chunk_store($root);
    [$session] = upload_parts($store, 'dono', str_repeat('z', 30), 10, [0, 2]);
    assert_throws(409, fn () => $store->complete('dono', $session['uploadId'], null));
    assert_true(!is_file($root . '/uploads/' . $session['uploadId'] . '/file.bin'), 'arquivo final não deve existir');
});

test('chunks: manifesto divergente gera 422', function () {
    $store = chunk_store(temp_storage());
    [$session] = upload_parts($store, 'dono', str_repeat('q', 30), 10);
    assert_throws(422, fn () => $store->complete('dono', $session['uploadId'], str_repeat('a', 64)));
});

test('chunks: finalizar duas vezes devolve o mesmo token', function () {
    $store = chunk_store(temp_storage());
    [$session] = upload_parts($store, 'dono', str_repeat('w', 30), 10);
    $first = $store->complete('dono', $session['uploadId'], null);
    $second = $store->complete('dono', $session['uploadId'], null);
    assert_same($first['token'], $second['token']);
});

test('chunks: outro dono recebe 404 (autorização sem revelar existência)', function () {
    $store = chunk_store(temp_storage());
    [$session] = upload_parts($store, 'dono', str_repeat('w', 30), 10, [0]);
    assert_throws(404, fn () => $store->status('intruso', $session['uploadId']));
    assert_throws(404, fn () => $store->putPart('intruso', $session['uploadId'], 1, 10, 10, null, stream_of(str_repeat('w', 10))));
    assert_throws(404, fn () => $store->cancel('intruso', $session['uploadId']));
});

test('chunks: token de outro dono ou já usado é recusado no bind', function () {
    $root = temp_storage();
    $store = chunk_store($root);
    [$session] = upload_parts($store, 'dono', str_repeat('w', 30), 10);
    $token = $store->complete('dono', $session['uploadId'], null)['token'];
    assert_throws(422, fn () => $store->bind('intruso', $token, $root . '/final'));
    $store->bind('dono', $token, $root . '/final');
    assert_throws(422, fn () => $store->bind('dono', $token, $root . '/final'));
});

test('chunks: sessão expirada responde 410 e é removida na limpeza', function () {
    $root = temp_storage();
    $now = 1000;
    $store = chunk_store($root, function () use (&$now) {
        return $now;
    });
    [$session] = upload_parts($store, 'dono', str_repeat('e', 30), 10, [0]);
    $now += 4000;
    assert_throws(410, fn () => $store->status('dono', $session['uploadId']));
    assert_throws(410, fn () => $store->putPart('dono', $session['uploadId'], 1, 10, 10, null, stream_of(str_repeat('e', 10))));
    $stats = $store->cleanup();
    assert_same(1, $stats['expired']);
    assert_true(!is_dir($root . '/uploads/' . $session['uploadId']), 'diretório deveria ter sido removido');
});

test('chunks: limpeza remove upload concluído não vinculado após o prazo', function () {
    $root = temp_storage();
    $now = 1000;
    $store = chunk_store($root, function () use (&$now) {
        return $now;
    });
    [$session] = upload_parts($store, 'dono', str_repeat('u', 30), 10);
    $token = $store->complete('dono', $session['uploadId'], null)['token'];
    $now += 3601;
    $stats = $store->cleanup();
    assert_same(1, $stats['unbound']);
    assert_true(!is_file($root . '/tokens/' . $token . '.json'), 'token órfão removido');
});

test('chunks: cancelar remove a sessão', function () {
    $root = temp_storage();
    $store = chunk_store($root);
    [$session] = upload_parts($store, 'dono', str_repeat('c', 30), 10, [0]);
    $store->cancel('dono', $session['uploadId']);
    assert_throws(404, fn () => $store->status('dono', $session['uploadId']));
});

test('chunks: limites de tamanho e de sessões abertas', function () {
    $store = chunk_store(temp_storage());
    assert_throws(413, fn () => $store->create('dono', ['name' => 'big', 'size' => 11 * 1024 * 1024, 'chunkSize' => 1024]));
    assert_throws(422, fn () => $store->create('dono', ['name' => 'x', 'size' => 0]));
    for ($i = 0; $i < 5; $i++) {
        $store->create('limitado', ['name' => 'x', 'size' => 10, 'chunkSize' => 10]);
    }
    assert_throws(429, fn () => $store->create('limitado', ['name' => 'x', 'size' => 10, 'chunkSize' => 10]));
});

test('chunks: identificador malformado nunca acessa o disco', function () {
    $store = chunk_store(temp_storage());
    assert_throws(404, fn () => $store->status('dono', '../../etc/passwd'));
});
