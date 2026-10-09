<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/** Erro com status HTTP e corpo JSON. Lançado por stores e handlers; convertido em resposta pelo roteador. */
final class HttpError extends \RuntimeException
{
    /** @param array<string, mixed> $payload */
    public function __construct(public readonly int $status, string $message, public readonly array $payload = [], public readonly array $headers = [])
    {
        parent::__construct($message, $status);
    }

    /** @return array<string, mixed> */
    public function body(): array
    {
        return ['success' => false, 'message' => $this->getMessage()] + $this->payload;
    }
}
