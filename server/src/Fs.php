<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/** Utilitários de sistema de arquivos com escrita atômica (arquivo temporário + rename) e travas flock. */
final class Fs
{
    public static function ensureDir(string $dir): void
    {
        if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw new \RuntimeException("Não foi possível criar o diretório {$dir}.");
        }
    }

    public static function randomId(int $bytes = 16): string
    {
        return bin2hex(random_bytes($bytes));
    }

    /** @param array<string, mixed> $data */
    public static function writeJsonAtomic(string $path, array $data): void
    {
        self::ensureDir(dirname($path));
        $tmp = $path . '.' . self::randomId(6) . '.tmp';
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            throw new \RuntimeException("Falha ao gravar {$tmp}.");
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new \RuntimeException("Falha ao substituir {$path}.");
        }
    }

    /** @return array<string, mixed>|null */
    public static function readJson(string $path): ?array
    {
        if (!is_file($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    /**
     * Executa $fn com trava exclusiva (ou compartilhada) em "$path.lock".
     * Com $nonBlocking=true, retorna null se a trava estiver ocupada.
     * @template T
     * @param callable(): T $fn
     * @return T|null
     */
    public static function withLock(string $path, callable $fn, bool $exclusive = true, bool $nonBlocking = false): mixed
    {
        self::ensureDir(dirname($path));
        $handle = fopen($path . '.lock', 'c');
        if ($handle === false) {
            throw new \RuntimeException("Não foi possível abrir a trava {$path}.lock.");
        }
        try {
            $mode = ($exclusive ? LOCK_EX : LOCK_SH) | ($nonBlocking ? LOCK_NB : 0);
            if (!flock($handle, $mode)) {
                if ($nonBlocking) {
                    return null;
                }
                throw new \RuntimeException("Não foi possível obter a trava {$path}.lock.");
            }
            try {
                return $fn();
            } finally {
                flock($handle, LOCK_UN);
            }
        } finally {
            fclose($handle);
        }
    }

    public static function removeTree(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($items as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($dir);
    }

    /** Nome exibível: sem caminho, sem caracteres de controle, até 180 caracteres. Nunca usado como nome em disco. */
    public static function displayName(string $original): string
    {
        $name = basename(str_replace('\\', '/', $original));
        $name = preg_replace('/[\x00-\x1F\x7F]+/u', '', $name) ?? '';
        $name = trim($name);
        if ($name === '' || $name === '.' || $name === '..') {
            $name = 'arquivo';
        }
        return function_exists('mb_substr') ? mb_substr($name, 0, 180, 'UTF-8') : implode('', array_slice(preg_split('//u', $name, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, 180));
    }

    public static function extension(string $name): string
    {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        return preg_match('/^[a-z0-9]{1,10}$/', $ext) === 1 ? $ext : '';
    }
}
