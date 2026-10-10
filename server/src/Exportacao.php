<?php

declare(strict_types=1);

namespace AlpineForm\Server;

use AlpineForm\Helpers\Csv;

/**
 * Exportação CSV em segundo plano (backend de REFERÊNCIA para data-lista-exportar-modo="job").
 *
 * 1. POST no endpoint de exportação cria um job "export_csv" com os filtros recebidos (ou nenhum, no completo).
 * 2. O worker (server/bin/worker.php) gera o arquivo em fluxo, comprimido (gzip), informando progresso e
 *    respeitando cancelamento; grava num temporário e renomeia no fim (nunca expõe arquivo pela metade).
 * 3. O resultado aponta para /api/exports/{id}/arquivo, que só entrega o arquivo ao dono do job.
 *
 * Em produção: troque a fonte de dados (Api::clientesDemo) pela consulta real com Csv::linhasDoBanco(),
 * registre quem exportou e defina a retenção dos arquivos (cleanup()).
 */
final class Exportacao
{
    public const TIPO = 'export_csv';
    public const COLUNAS = ['id' => 'Código', 'nome' => 'Nome', 'email' => 'E-mail', 'uf' => 'UF', 'status' => 'Situação', 'saldo' => 'Saldo', 'criado_em' => 'Cadastro'];
    public const MAX_LINHAS_SINTETICAS = 3000000;

    public static function caminho(string $storage, string $id): string
    {
        if (preg_match('/^[a-f0-9]{32}$/', $id) !== 1) {
            throw new HttpError(404, 'Arquivo não encontrado.');
        }
        return $storage . '/exports/' . $id . '.csv.gz';
    }

    /**
     * Payload do job a partir da requisição: filtros só no "filtro"; "linhas" acrescenta clientes fictícios
     * (para demonstrar volume), limitado a MAX_LINHAS_SINTETICAS.
     *
     * @param array<string, mixed> $query
     * @return array<string, mixed>
     */
    public static function payload(string $tipo, array $query, array $extras, array $ajustes): array
    {
        $sinteticas = max(0, min(self::MAX_LINHAS_SINTETICAS, (int) ($query['linhas'] ?? 0)));
        unset($query['linhas']);
        return [
            'tipo' => $tipo === 'completo' ? 'completo' : 'filtro',
            'query' => $tipo === 'completo' ? [] : $query,
            'extras' => $extras,
            'ajustes' => $ajustes,
            'sinteticas' => $sinteticas,
            'delayMs' => max(0, min(200, (int) ($query['ms'] ?? 0))),
        ];
    }

    /** Gera o arquivo do job (chamado pelo worker). @param array<string, mixed> $job */
    public static function gerar(JobQueue $queue, array $job, string $storage): void
    {
        $p = $job['payload'];
        $clientes = Api::clientesDemo((array) $p['query'], (array) $p['extras'], (array) $p['ajustes']);
        $sinteticas = (int) $p['sinteticas'];
        $total = count($clientes) + $sinteticas;
        $delay = (int) ($p['delayMs'] ?? 0);
        $destino = self::caminho($storage, $job['id']);
        Fs::ensureDir(dirname($destino));
        $temporario = $destino . '.' . bin2hex(random_bytes(4)) . '.tmp';

        $cancelado = false;
        $linhas = (static function () use ($clientes, $sinteticas, $total, $queue, $job, $delay, &$cancelado) {
            $escritas = 0;
            $ultimo = -1;
            $proximaVerificacao = microtime(true);
            $ufs = ['SP', 'RJ', 'MG', 'RS', 'BA', 'PR'];
            $fontes = [$clientes, (static function () use ($sinteticas, $ufs) {
                for ($i = 1; $i <= $sinteticas; $i++) {
                    yield ['id' => 100000 + $i, 'nome' => "Cliente fictício {$i}", 'email' => "ficticio{$i}@exemplo.com", 'uf' => $ufs[$i % 6], 'status' => 'ativo', 'saldo' => number_format(($i * 7919 % 100000) / 100, 2, '.', ''), 'criado_em' => '2024-01-01'];
                }
            })()];
            foreach ($fontes as $fonte) {
                foreach ($fonte as $linha) {
                    yield $linha;
                    $escritas++;
                    // progresso real (linhas escritas / total) e cancelamento, no máximo a cada 0,5 s ou 5%
                    $progresso = (int) floor($escritas / max(1, $total) * 100);
                    if ($progresso >= $ultimo + 5 || microtime(true) >= $proximaVerificacao) {
                        if ($queue->isCancelRequested($job['id'])) {
                            $cancelado = true;
                            return;
                        }
                        $ultimo = $progresso;
                        $proximaVerificacao = microtime(true) + 0.5;
                        $queue->update($job['id'], ['progress' => min(99, $progresso), 'message' => number_format($escritas, 0, ',', '.') . ' de ' . number_format($total, 0, ',', '.') . ' linhas']);
                        if ($delay > 0) {
                            usleep($delay * 1000);
                        }
                    }
                }
            }
        })();

        $arquivo = fopen($temporario, 'wb');
        $filtro = Csv::comprimir($arquivo);
        try {
            $escritas = Csv::escrever($arquivo, self::COLUNAS, $linhas);
        } finally {
            stream_filter_remove($filtro);
            fclose($arquivo);
        }
        if ($cancelado) {
            @unlink($temporario);
            $queue->update($job['id'], ['status' => 'canceled', 'message' => 'Exportação cancelada a pedido do usuário.']);
            return;
        }
        if (!Fs::renameWithRetry($temporario, $destino)) {
            @unlink($temporario);
            throw new \RuntimeException("Falha ao publicar o arquivo da exportação {$job['id']}.");
        }
        $nome = Csv::nomeSeguro('clientes-' . ($p['tipo'] === 'completo' ? 'completo' : 'filtrado') . '-' . date('Y-m-d') . '.csv');
        $queue->update($job['id'], [
            'status' => 'succeeded',
            'progress' => 100,
            'message' => number_format($escritas, 0, ',', '.') . ' linhas exportadas.',
            'result' => ['url' => '/api/exports/' . $job['id'] . '/arquivo', 'arquivo' => $nome, 'linhas' => $escritas, 'bytes' => filesize($destino)],
        ]);
    }

    /**
     * Entrega o arquivo ao dono do job: comprimido (Content-Encoding: gzip) quando o navegador aceita,
     * senão descompactando em fluxo. Nunca carrega o arquivo inteiro na memória.
     *
     * @return array{0: int, 1: resource, 2: array<string, string>}
     */
    public static function baixar(JobQueue $queue, string $storage, string $owner, string $id, Request $request): array
    {
        $job = $queue->get($owner, $id);            // 404 para quem não é o dono
        if ($job['type'] !== self::TIPO || $job['status'] !== 'succeeded') {
            throw new HttpError(404, 'Arquivo não encontrado.');
        }
        $caminho = self::caminho($storage, $id);
        if (!is_file($caminho)) {
            throw new HttpError(410, 'O arquivo expirou. Gere a exportação de novo.');
        }
        $nome = Csv::nomeSeguro((string) ($job['result']['arquivo'] ?? 'exportacao.csv'));
        $headers = [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="' . $nome . '"',
            'Vary' => 'Accept-Encoding',
        ];
        if (preg_match('/\bgzip\b/i', (string) $request->header('Accept-Encoding')) === 1) {
            $headers['Content-Encoding'] = 'gzip';
            $headers['Content-Length'] = (string) filesize($caminho);
            return [200, fopen($caminho, 'rb'), $headers];
        }
        return [200, fopen('compress.zlib://' . $caminho, 'rb'), $headers];
    }

    /** Remove arquivos de exportação mais antigos que $retencao segundos. */
    public static function cleanup(string $storage, int $retencao): int
    {
        $removidos = 0;
        foreach (glob($storage . '/exports/*') ?: [] as $arquivo) {
            if (is_file($arquivo) && filemtime($arquivo) < time() - $retencao && @unlink($arquivo)) {
                $removidos++;
            }
        }
        return $removidos;
    }
}
