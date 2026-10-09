<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/**
 * Sessão PHP de DEMONSTRAÇÃO: cada navegador recebe um "dono" aleatório e um token CSRF.
 * Em produção, substitua owner() pelo usuário autenticado da sua aplicação.
 * session_write_close() é chamado cedo para não serializar requisições concorrentes (trava de sessão).
 */
final class Session
{
    private static bool $started = false;
    private static ?string $owner = null;
    private static ?string $csrf = null;

    public static function start(): void
    {
        if (self::$started) {
            return;
        }
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        session_name('AFSESSID');
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $secure]);
        session_start();
        if (empty($_SESSION['owner'])) {
            $_SESSION['owner'] = Fs::randomId(16);
        }
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = Fs::randomId(32);
        }
        self::$owner = $_SESSION['owner'];
        self::$csrf = $_SESSION['csrf'];
        self::$started = true;
    }

    public static function owner(): string
    {
        self::start();
        return (string) self::$owner;
    }

    public static function csrf(): string
    {
        self::start();
        return (string) self::$csrf;
    }

    /** @return mixed */
    public static function get(string $key, mixed $default = null): mixed
    {
        self::start();
        return $_SESSION[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $_SESSION[$key] = $value;
    }

    public static function release(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
    }

    /** Aceita o cabeçalho X-CSRF-TOKEN (padrão do cliente) ou o campo _token (formulários Laravel-like). */
    public static function verifyCsrf(Request $request): void
    {
        $sent = $request->header('x-csrf-token') ?? (is_string($request->post['_token'] ?? null) ? $request->post['_token'] : null);
        if ($sent === null || !hash_equals(self::csrf(), $sent)) {
            throw new HttpError(419, 'Token CSRF ausente ou expirado. Recarregue a página.');
        }
    }
}
