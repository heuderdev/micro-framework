<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/**
 * Armazenamento de uploads em partes.
 *
 * Layout em disco ({root}/uploads/{uploadId}/):
 *   meta.json                 estado da sessão (escrita atômica)
 *   meta.json.lock            trava exclusiva para mudanças de estado
 *   parts/{index}.part        partes confirmadas (escritas em .tmp e renomeadas)
 *   file.bin                  arquivo montado (somente após complete)
 * Índice de tokens: {root}/tokens/{token}.json -> { uploadId, owner }
 *
 * Garantias:
 *   - Cada parte é gravada em arquivo temporário e renomeada: uma parte nunca fica pela metade.
 *   - Repetir uma parte com o mesmo conteúdo é idempotente; conteúdo diferente gera 409.
 *   - complete() monta em "assembling.*.tmp" e renomeia para file.bin sob trava exclusiva:
 *     o arquivo final nunca é observado parcialmente montado e só é montado uma vez.
 *   - Sessões de outro dono respondem 404 (não revelam existência).
 *   - Upload concluído NÃO é operação de negócio concluída: bind() vincula o arquivo ao formulário.
 */
final class ChunkStore
{
    private \Closure $clock;

    /** @param array<string, int> $limits */
    public function __construct(private string $root, private array $limits, ?\Closure $clock = null)
    {
        $this->clock = $clock ?? static fn (): int => time();
    }

    private function now(): int
    {
        return ($this->clock)();
    }

    private function dir(string $id): string
    {
        if (preg_match('/^[a-f0-9]{32}$/', $id) !== 1) {
            throw new HttpError(404, 'Sessão de upload não encontrada.');
        }
        return $this->root . '/uploads/' . $id;
    }

    private function metaPath(string $id): string
    {
        return $this->dir($id) . '/meta.json';
    }

    /** @return array<string, mixed> */
    private function load(string $owner, string $id): array
    {
        $meta = Fs::readJson($this->metaPath($id));
        if ($meta === null || !hash_equals((string) $meta['owner'], $owner)) {
            throw new HttpError(404, 'Sessão de upload não encontrada.');
        }
        return $meta;
    }

    /** @param array<string, mixed> $meta */
    private function assertOpen(array $meta): void
    {
        if ($meta['status'] === 'open' && $meta['expiresAt'] < $this->now()) {
            throw new HttpError(410, 'Sessão de upload expirada.');
        }
        if ($meta['status'] !== 'open') {
            throw new HttpError(410, 'Sessão de upload não está aberta (' . $meta['status'] . ').');
        }
    }

    /** @param array<string, mixed> $meta @return array<string, mixed> */
    public function publicMeta(array $meta): array
    {
        $received = [];
        foreach ($meta['parts'] as $index => $part) {
            $received[] = ['index' => (int) $index, 'sha256' => $part['sha256']];
        }
        usort($received, static fn ($a, $b) => $a['index'] <=> $b['index']);
        return [
            'uploadId' => $meta['id'],
            'name' => $meta['name'],
            'size' => $meta['size'],
            'chunkSize' => $meta['chunkSize'],
            'totalParts' => $meta['totalParts'],
            'receivedParts' => $received,
            'status' => $meta['status'],
            'expiresAt' => $meta['expiresAt'],
            'token' => $meta['status'] === 'completed' && empty($meta['bound']) ? $meta['token'] : null,
        ];
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function create(string $owner, array $input): array
    {
        $name = Fs::displayName((string) ($input['name'] ?? ''));
        $size = $input['size'] ?? null;
        if (!is_int($size) || $size <= 0) {
            throw new HttpError(422, 'Tamanho de arquivo inválido.');
        }
        if ($size > $this->limits['max_file_bytes']) {
            throw new HttpError(413, 'Arquivo excede o limite permitido para upload em partes.');
        }
        $chunkSize = $input['chunkSize'] ?? null;
        if (!is_int($chunkSize) || $chunkSize < $this->limits['min_chunk_bytes'] || $chunkSize > $this->limits['max_chunk_bytes']) {
            $chunkSize = min(max(5 * 1024 * 1024, $this->limits['min_chunk_bytes']), $this->limits['max_chunk_bytes']);
        }
        $totalParts = (int) ceil($size / $chunkSize);
        if ($totalParts > $this->limits['max_parts']) {
            throw new HttpError(422, 'Quantidade de partes excede o limite; use partes maiores.');
        }
        if ($this->countOpenSessions($owner) >= $this->limits['max_open_sessions_per_owner']) {
            throw new HttpError(429, 'Muitas sessões de upload abertas. Conclua ou cancele as existentes.');
        }
        $id = Fs::randomId(16);
        Fs::ensureDir($this->dir($id) . '/parts');
        $meta = [
            'id' => $id,
            'owner' => $owner,
            'name' => $name,
            'size' => $size,
            'type' => substr((string) ($input['type'] ?? ''), 0, 100),
            'fingerprint' => substr((string) ($input['fingerprint'] ?? ''), 0, 128),
            'chunkSize' => $chunkSize,
            'totalParts' => $totalParts,
            'parts' => new \stdClass(),
            'status' => 'open',
            'createdAt' => $this->now(),
            'updatedAt' => $this->now(),
            'expiresAt' => $this->now() + $this->limits['session_ttl'],
            'token' => null,
            'bound' => false,
        ];
        Fs::writeJsonAtomic($this->metaPath($id), $meta);
        $meta['parts'] = [];
        return $this->publicMeta($meta);
    }

    private function countOpenSessions(string $owner): int
    {
        $count = 0;
        foreach (glob($this->root . '/uploads/*/meta.json') ?: [] as $file) {
            $meta = Fs::readJson($file);
            if ($meta && $meta['owner'] === $owner && $meta['status'] === 'open' && $meta['expiresAt'] >= $this->now()) {
                $count++;
            }
        }
        return $count;
    }

    /** @return array<string, mixed> */
    public function status(string $owner, string $id): array
    {
        $meta = $this->load($owner, $id);
        if ($meta['status'] === 'open' && $meta['expiresAt'] < $this->now()) {
            throw new HttpError(410, 'Sessão de upload expirada.');
        }
        return $this->publicMeta($meta);
    }

    /**
     * @param resource $stream corpo da requisição (bytes crus da parte)
     * @return array<string, mixed>
     */
    public function putPart(string $owner, string $id, int $index, int $offset, int $size, ?string $sha256, $stream): array
    {
        $meta = $this->load($owner, $id);
        $this->assertOpen($meta);
        if ($index < 0 || $index >= $meta['totalParts']) {
            throw new HttpError(422, 'Índice de parte fora do intervalo.');
        }
        $expectedOffset = $index * $meta['chunkSize'];
        $expectedSize = min($meta['chunkSize'], $meta['size'] - $expectedOffset);
        if ($offset !== $expectedOffset || $size !== $expectedSize) {
            throw new HttpError(422, 'Parte incompatível com a sessão (offset ou tamanho divergente).', [
                'expected' => ['offset' => $expectedOffset, 'size' => $expectedSize],
            ]);
        }
        if ($sha256 !== null && preg_match('/^[a-f0-9]{64}$/', $sha256) !== 1) {
            throw new HttpError(422, 'X-Chunk-Sha256 inválido.');
        }

        $dir = $this->dir($id);
        $tmp = $dir . '/parts/' . $index . '.' . Fs::randomId(6) . '.tmp';
        $out = fopen($tmp, 'wb');
        if ($out === false) {
            throw new HttpError(500, 'Falha ao gravar parte.');
        }
        $written = stream_copy_to_stream($stream, $out, $expectedSize + 1);
        fclose($out);
        if ($written !== $expectedSize) {
            @unlink($tmp);
            throw new HttpError(422, 'Corpo da parte com tamanho divergente.', ['received' => $written, 'expected' => $expectedSize]);
        }
        $hash = hash_file('sha256', $tmp);
        if ($sha256 !== null && !hash_equals($sha256, $hash)) {
            @unlink($tmp);
            throw new HttpError(422, 'Checksum da parte não confere.');
        }

        return Fs::withLock($this->metaPath($id), function () use ($owner, $id, $index, $tmp, $hash, $expectedSize, $dir): array {
            $meta = $this->load($owner, $id);
            try {
                $this->assertOpen($meta);
            } catch (HttpError $error) {
                @unlink($tmp);
                throw $error;
            }
            $partFile = $dir . '/parts/' . $index . '.part';
            $existing = $meta['parts'][(string) $index] ?? null;
            if ($existing !== null && is_file($partFile)) {
                @unlink($tmp);
                if (!hash_equals($existing['sha256'], $hash)) {
                    throw new HttpError(409, 'Parte já recebida com conteúdo diferente.');
                }
                return ['index' => $index, 'received' => count($meta['parts']), 'sha256' => $hash, 'duplicate' => true];
            }
            if (!rename($tmp, $partFile)) {
                @unlink($tmp);
                throw new HttpError(500, 'Falha ao confirmar parte.');
            }
            $meta['parts'][(string) $index] = ['size' => $expectedSize, 'sha256' => $hash];
            $meta['updatedAt'] = $this->now();
            Fs::writeJsonAtomic($this->metaPath($id), $meta);
            return ['index' => $index, 'received' => count($meta['parts']), 'sha256' => $hash, 'duplicate' => false];
        });
    }

    /** SHA-256 da concatenação binária dos SHA-256 das partes, em ordem (mesmo cálculo do cliente). */
    public static function manifest(array $partHashes): string
    {
        $binary = '';
        foreach ($partHashes as $hex) {
            $binary .= hex2bin($hex);
        }
        return hash('sha256', $binary);
    }

    /** @return array<string, mixed> */
    public function complete(string $owner, string $id, ?string $manifest): array
    {
        return Fs::withLock($this->metaPath($id), function () use ($owner, $id, $manifest): array {
            $meta = $this->load($owner, $id);
            if ($meta['status'] === 'completed') {
                if (!empty($meta['bound'])) {
                    throw new HttpError(409, 'Upload já vinculado a uma operação.');
                }
                return ['status' => 'completed', 'token' => $meta['token'], 'size' => $meta['size'], 'manifest' => $meta['manifest'] ?? null];
            }
            $this->assertOpen($meta);
            $dir = $this->dir($id);
            $hashes = [];
            for ($i = 0; $i < $meta['totalParts']; $i++) {
                $part = $meta['parts'][(string) $i] ?? null;
                $file = $dir . '/parts/' . $i . '.part';
                if ($part === null || !is_file($file) || filesize($file) !== $part['size']) {
                    throw new HttpError(409, 'Upload incompleto: faltam partes.', ['missing' => $i]);
                }
                $hashes[] = $part['sha256'];
            }
            $computed = self::manifest($hashes);
            if ($manifest !== null && $manifest !== '' && !hash_equals($computed, strtolower($manifest))) {
                throw new HttpError(422, 'Manifesto de integridade não confere.');
            }
            $tmp = $dir . '/assembling.' . Fs::randomId(6) . '.tmp';
            $out = fopen($tmp, 'wb');
            if ($out === false) {
                throw new HttpError(500, 'Falha ao montar arquivo.');
            }
            try {
                for ($i = 0; $i < $meta['totalParts']; $i++) {
                    $in = fopen($dir . '/parts/' . $i . '.part', 'rb');
                    stream_copy_to_stream($in, $out);
                    fclose($in);
                }
                fflush($out);
            } finally {
                fclose($out);
            }
            clearstatcache(true, $tmp);
            if (filesize($tmp) !== $meta['size']) {
                @unlink($tmp);
                throw new HttpError(500, 'Arquivo montado com tamanho divergente.');
            }
            if (!rename($tmp, $dir . '/file.bin')) {
                @unlink($tmp);
                throw new HttpError(500, 'Falha ao finalizar arquivo.');
            }
            $token = Fs::randomId(16);
            $meta['status'] = 'completed';
            $meta['token'] = $token;
            $meta['manifest'] = $computed;
            $meta['completedAt'] = $this->now();
            $meta['updatedAt'] = $this->now();
            Fs::writeJsonAtomic($this->metaPath($id), $meta);
            Fs::writeJsonAtomic($this->root . '/tokens/' . $token . '.json', ['uploadId' => $id, 'owner' => $owner, 'createdAt' => $this->now()]);
            foreach (glob($dir . '/parts/*.part') ?: [] as $file) {
                @unlink($file);
            }
            return ['status' => 'completed', 'token' => $token, 'size' => $meta['size'], 'manifest' => $computed];
        });
    }

    public function cancel(string $owner, string $id): void
    {
        Fs::withLock($this->metaPath($id), function () use ($owner, $id): void {
            $meta = $this->load($owner, $id);
            if (!empty($meta['bound'])) {
                throw new HttpError(409, 'Upload já vinculado; não pode ser cancelado por aqui.');
            }
            if (!empty($meta['token'])) {
                @unlink($this->root . '/tokens/' . $meta['token'] . '.json');
            }
            $meta['status'] = 'canceled';
            Fs::writeJsonAtomic($this->metaPath($id), $meta);
        });
        Fs::removeTree($this->dir($id));
    }

    /**
     * Vincula (consome) um token ao formulário: move o arquivo para $destDir com nome aleatório.
     * Uso único. Deve ser chamado pelo endpoint do formulário APÓS a validação de negócio.
     * @return array<string, mixed>
     */
    public function bind(string $owner, string $token, string $destDir): array
    {
        if (preg_match('/^[a-f0-9]{32}$/', $token) !== 1) {
            throw new HttpError(422, 'Token de arquivo inválido.');
        }
        $index = Fs::readJson($this->root . '/tokens/' . $token . '.json');
        if ($index === null || !hash_equals((string) $index['owner'], $owner)) {
            throw new HttpError(422, 'Token de arquivo inválido ou expirado.');
        }
        $id = (string) $index['uploadId'];
        return Fs::withLock($this->metaPath($id), function () use ($owner, $id, $token, $destDir): array {
            $meta = $this->load($owner, $id);
            if ($meta['status'] !== 'completed' || !empty($meta['bound']) || $meta['token'] !== $token) {
                throw new HttpError(422, 'Token de arquivo já utilizado ou inválido.');
            }
            Fs::ensureDir($destDir);
            $ext = Fs::extension($meta['name']);
            $stored = Fs::randomId(16) . ($ext !== '' ? '.' . $ext : '');
            if (!rename($this->dir($id) . '/file.bin', $destDir . '/' . $stored)) {
                throw new HttpError(500, 'Falha ao mover arquivo vinculado.');
            }
            $meta['bound'] = true;
            $meta['boundAt'] = $this->now();
            Fs::writeJsonAtomic($this->metaPath($id), $meta);
            @unlink($this->root . '/tokens/' . $token . '.json');
            return ['stored' => $stored, 'path' => $destDir . '/' . $stored, 'name' => $meta['name'], 'size' => $meta['size'], 'type' => $meta['type']];
        });
    }

    /**
     * Limpeza de órfãos: sessões abertas expiradas, uploads concluídos não vinculados após unbound_ttl,
     * sessões vinculadas/canceladas antigas e temporários com mais de 1 hora.
     * @return array<string, int>
     */
    public function cleanup(): array
    {
        $stats = ['expired' => 0, 'unbound' => 0, 'finished' => 0, 'tmp' => 0, 'tokens' => 0];
        $now = $this->now();
        foreach (glob($this->root . '/uploads/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $id = basename($dir);
            $metaFile = $dir . '/meta.json';
            $removed = Fs::withLock($metaFile, function () use ($dir, $metaFile, $now, &$stats): bool {
                $meta = Fs::readJson($metaFile);
                if ($meta === null) {
                    $age = $now - (int) @filemtime($dir);
                    if ($age > 3600) {
                        $stats['expired']++;
                        return true;
                    }
                    return false;
                }
                $remove = false;
                if ($meta['status'] === 'open' && $meta['expiresAt'] < $now) {
                    $stats['expired']++;
                    $remove = true;
                } elseif ($meta['status'] === 'completed' && empty($meta['bound']) && ($meta['completedAt'] ?? 0) + $this->limits['unbound_ttl'] < $now) {
                    $stats['unbound']++;
                    if (!empty($meta['token'])) {
                        @unlink($this->root . '/tokens/' . $meta['token'] . '.json');
                    }
                    $remove = true;
                } elseif (!empty($meta['bound']) && ($meta['boundAt'] ?? 0) + 3600 < $now) {
                    $stats['finished']++;
                    $remove = true;
                }
                if ($remove) {
                    return true;
                }
                foreach (array_merge(glob($dir . '/*.tmp') ?: [], glob($dir . '/parts/*.tmp') ?: []) as $tmp) {
                    if ($now - (int) filemtime($tmp) > 3600) {
                        @unlink($tmp);
                        $stats['tmp']++;
                    }
                }
                return false;
            }, true, true);
            if ($removed) {
                Fs::removeTree($dir);
            }
            unset($id);
        }
        foreach (glob($this->root . '/tokens/*.json') ?: [] as $file) {
            $index = Fs::readJson($file);
            if ($index === null || !is_dir($this->root . '/uploads/' . ($index['uploadId'] ?? '-'))) {
                @unlink($file);
                $stats['tokens']++;
            }
        }
        return $stats;
    }
}
