<?php

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('O backend de referência do AlpineForm exige PHP 8.1 ou superior. Para Joomla 3/PHP 7.0, veja docs/joomla3-php70.md.');
}

spl_autoload_register(static function (string $class): void {
    $prefix = 'AlpineForm\\Server\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

/** @return array<string, mixed> */
function alpineform_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}
