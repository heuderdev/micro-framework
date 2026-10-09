<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/**
 * Idempotência por cabeçalho Idempotency-Key, com escopo dono + rota.
 *  - mesma chave + mesmos dados após conclusão: devolve a resposta armazenada (replay);
 *  - mesma chave + dados diferentes: 422;
 *  - mesma chave enquanto a primeira requisição ainda processa: 409.
 * O cliente sozinho não garante idempotência; este armazenamento é a parte do servidor.
 */
final class Idempotency
{
    private \Closure $clock;

    public function __construct(private string $root, private int $ttl, ?\Closure $clock = null)
    {
        $this->clock = $clock ?? static fn (): int => time();
    }

    private function path(string $owner, string $scope, string $key): string
    {
        if (preg_match('/^[A-Za-z0-9_-]{8,128}$/', $key) !== 1) {
            throw new HttpError(422, 'Idempotency-Key inválida.');
        }
        return $this->root . '/idempotency/' . hash('sha256', $owner . '|' . $scope . '|' . $key) . '.json';
    }

    /** @return array{replay: bool, response?: array<string, mixed>} */
    public function begin(string $owner, string $scope, string $key, string $fingerprint): array
    {
        $path = $this->path($owner, $scope, $key);
        return Fs::withLock($path, function () use ($path, $fingerprint): array {
            $record = Fs::readJson($path);
            if ($record !== null && $record['createdAt'] + $this->ttl >= ($this->clock)()) {
                if (!hash_equals($record['fingerprint'], $fingerprint)) {
                    throw new HttpError(422, 'Idempotency-Key reutilizada com dados diferentes.');
                }
                if ($record['state'] === 'done') {
                    return ['replay' => true, 'response' => $record['response']];
                }
                throw new HttpError(409, 'Uma requisição com esta Idempotency-Key ainda está em processamento.');
            }
            Fs::writeJsonAtomic($path, ['state' => 'processing', 'fingerprint' => $fingerprint, 'createdAt' => ($this->clock)(), 'response' => null]);
            return ['replay' => false];
        });
    }

    /** @param array<string, mixed> $response */
    public function complete(string $owner, string $scope, string $key, array $response): void
    {
        $path = $this->path($owner, $scope, $key);
        Fs::withLock($path, function () use ($path, $response): void {
            $record = Fs::readJson($path) ?? ['fingerprint' => '', 'createdAt' => ($this->clock)()];
            $record['state'] = 'done';
            $record['response'] = $response;
            Fs::writeJsonAtomic($path, $record);
        });
    }

    public function abort(string $owner, string $scope, string $key): void
    {
        $path = $this->path($owner, $scope, $key);
        @unlink($path);
    }

    public function cleanup(): int
    {
        $removed = 0;
        foreach (glob($this->root . '/idempotency/*.json') ?: [] as $file) {
            $record = Fs::readJson($file);
            if ($record === null || $record['createdAt'] + $this->ttl < ($this->clock)()) {
                @unlink($file);
                @unlink($file . '.lock');
                $removed++;
            }
        }
        return $removed;
    }
}
