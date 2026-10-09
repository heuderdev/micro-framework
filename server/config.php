<?php

declare(strict_types=1);

/**
 * Configuração do backend de REFERÊNCIA (demonstrativo).
 * Não é pronto para produção: autenticação, autorização, armazenamento e limites precisam ser adaptados.
 */
return [
    'storage' => getenv('ALPINEFORM_STORAGE') ?: __DIR__ . '/storage',

    'upload' => [
        'max_file_bytes' => 20 * 1024 * 1024,
        'max_files' => 10,
        'allowed' => [
            'pdf' => ['application/pdf'],
            'jpg' => ['image/jpeg'],
            'jpeg' => ['image/jpeg'],
            'png' => ['image/png'],
            'webp' => ['image/webp'],
            'csv' => ['text/csv', 'text/plain', 'application/csv'],
            'txt' => ['text/plain'],
            'json' => ['application/json', 'text/plain'],
        ],
    ],

    'chunks' => [
        'max_file_bytes' => 4 * 1024 * 1024 * 1024,
        'min_chunk_bytes' => 64 * 1024,
        'max_chunk_bytes' => 50 * 1024 * 1024,
        'max_parts' => 10000,
        'session_ttl' => 24 * 3600,
        'unbound_ttl' => 24 * 3600,
        'max_open_sessions_per_owner' => 20,
    ],

    'jobs' => [
        'retention' => 7 * 24 * 3600,
    ],

    'idempotency_ttl' => 24 * 3600,

    'demo' => [
        'taken_emails' => ['admin@exemplo.com', 'teste@exemplo.com', 'joao@exemplo.com'],
        'remote_delay_ms' => (int) (getenv('ALPINEFORM_REMOTE_DELAY_MS') ?: 300),
    ],
];
