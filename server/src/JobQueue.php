<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/**
 * Fila de processamento em arquivos ({root}/jobs/{id}.json), sem serviço externo.
 * Um worker real (server/bin/worker.php) precisa estar em execução para os jobs avançarem.
 *
 * Estados: queued -> processing -> succeeded | failed | canceled
 * Cancelamento: queued é cancelado imediatamente; processing recebe cancelRequested e o worker
 * interrompe no próximo ponto de verificação. Encerrar o polling no navegador NÃO cancela o job.
 */
final class JobQueue
{
    private \Closure $clock;

    public function __construct(private string $root, ?\Closure $clock = null)
    {
        $this->clock = $clock ?? static fn (): int => time();
    }

    private function now(): int
    {
        return ($this->clock)();
    }

    private function path(string $id): string
    {
        if (preg_match('/^[a-f0-9]{32}$/', $id) !== 1) {
            throw new HttpError(404, 'Processamento não encontrado.');
        }
        return $this->root . '/jobs/' . $id . '.json';
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    public function create(string $owner, string $type, array $payload): array
    {
        $id = Fs::randomId(16);
        $job = [
            'id' => $id,
            'owner' => $owner,
            'type' => $type,
            'payload' => $payload,
            'status' => 'queued',
            'progress' => null,
            'message' => 'Aguardando processamento.',
            'result' => null,
            'error' => null,
            'cancelRequested' => false,
            'createdAt' => $this->now(),
            'updatedAt' => $this->now(),
            'claimedBy' => null,
        ];
        Fs::writeJsonAtomic($this->path($id), $job);
        return $job;
    }

    /** @return array<string, mixed> */
    public function get(string $owner, string $id): array
    {
        $job = Fs::readJson($this->path($id));
        if ($job === null || !hash_equals((string) $job['owner'], $owner)) {
            throw new HttpError(404, 'Processamento não encontrado.');
        }
        return $job;
    }

    /** @param array<string, mixed> $job @return array<string, mixed> */
    public static function publicView(array $job): array
    {
        return [
            'id' => $job['id'],
            'status' => $job['status'],
            'progress' => $job['progress'],
            'message' => $job['message'],
            'result' => $job['status'] === 'succeeded' ? $job['result'] : null,
            'error' => $job['status'] === 'failed' ? ['message' => (string) ($job['error'] ?? 'Falha no processamento.')] : null,
        ];
    }

    /** @return array<string, mixed> */
    public function requestCancel(string $owner, string $id): array
    {
        return Fs::withLock($this->path($id), function () use ($owner, $id): array {
            $job = $this->get($owner, $id);
            if (in_array($job['status'], ['succeeded', 'failed', 'canceled'], true)) {
                throw new HttpError(409, 'Processamento já finalizado.');
            }
            if ($job['status'] === 'queued') {
                $job['status'] = 'canceled';
                $job['message'] = 'Cancelado antes de iniciar.';
            } else {
                $job['cancelRequested'] = true;
                $job['message'] = 'Cancelamento solicitado.';
            }
            $job['updatedAt'] = $this->now();
            Fs::writeJsonAtomic($this->path($id), $job);
            return $job;
        });
    }

    /** Reivindica o próximo job da fila de forma exclusiva entre workers concorrentes. @return array<string, mixed>|null */
    public function claimNext(string $workerId): ?array
    {
        $files = glob($this->root . '/jobs/*.json') ?: [];
        $jobs = [];
        foreach ($files as $file) {
            $job = Fs::readJson($file);
            if ($job !== null && $job['status'] === 'queued') {
                $jobs[] = $job;
            }
        }
        usort($jobs, static fn ($a, $b) => $a['createdAt'] <=> $b['createdAt']);
        foreach ($jobs as $candidate) {
            $claimed = Fs::withLock($this->path($candidate['id']), function () use ($candidate, $workerId): ?array {
                $job = Fs::readJson($this->path($candidate['id']));
                if ($job === null || $job['status'] !== 'queued') {
                    return null;
                }
                $job['status'] = 'processing';
                $job['claimedBy'] = $workerId;
                $job['startedAt'] = $this->now();
                $job['updatedAt'] = $this->now();
                $job['message'] = 'Processando.';
                Fs::writeJsonAtomic($this->path($job['id']), $job);
                return $job;
            }, true, true);
            if ($claimed !== null) {
                return $claimed;
            }
        }
        return null;
    }

    /** @param array<string, mixed> $changes @return array<string, mixed> */
    public function update(string $id, array $changes): array
    {
        return Fs::withLock($this->path($id), function () use ($id, $changes): array {
            $job = Fs::readJson($this->path($id));
            if ($job === null) {
                throw new HttpError(404, 'Processamento não encontrado.');
            }
            $job = array_merge($job, $changes, ['updatedAt' => $this->now()]);
            Fs::writeJsonAtomic($this->path($id), $job);
            return $job;
        });
    }

    public function isCancelRequested(string $id): bool
    {
        $job = Fs::readJson($this->path($id));
        return $job !== null && !empty($job['cancelRequested']);
    }

    /** Remove jobs finalizados mais antigos que $retention segundos. */
    public function cleanup(int $retention): int
    {
        $removed = 0;
        foreach (glob($this->root . '/jobs/*.json') ?: [] as $file) {
            $job = Fs::readJson($file);
            if ($job !== null && in_array($job['status'], ['succeeded', 'failed', 'canceled'], true) && $job['updatedAt'] + $retention < $this->now()) {
                @unlink($file);
                @unlink($file . '.lock');
                $removed++;
            }
        }
        return $removed;
    }
}
