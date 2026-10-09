<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/**
 * Validação de SERVIDOR (autoridade final). Espelha parte das regras do cliente com a mesma semântica:
 * CPF/CNPJ validam dígitos verificadores, não existência; comprimentos contam code points.
 */
final class Validator
{
    /** @var array<string, list<string>> */
    private array $errors = [];

    /** @param array<string, mixed> $data */
    public function __construct(private array $data)
    {
    }

    public function value(string $field): mixed
    {
        return $this->data[$field] ?? null;
    }

    public function filled(string $field): bool
    {
        $value = $this->value($field);
        if (is_array($value)) {
            return count($value) > 0;
        }
        return $value !== null && trim((string) $value) !== '';
    }

    public function add(string $field, string $message): void
    {
        $this->errors[$field][] = $message;
    }

    public function required(string $field, string $message): bool
    {
        if (!$this->filled($field)) {
            $this->add($field, $message);
            return false;
        }
        return true;
    }

    public function length(string $field, int $min, int $max, string $message): void
    {
        if (!$this->filled($field)) {
            return;
        }
        $len = self::codePoints((string) $this->value($field));
        if ($len < $min || $len > $max) {
            $this->add($field, $message);
        }
    }

    public function email(string $field, string $message): void
    {
        if ($this->filled($field) && filter_var((string) $this->value($field), FILTER_VALIDATE_EMAIL) === false) {
            $this->add($field, $message);
        }
    }

    public function cpf(string $field, string $message): void
    {
        if ($this->filled($field) && !self::isCpf((string) $this->value($field))) {
            $this->add($field, $message);
        }
    }

    public function cnpj(string $field, string $message): void
    {
        if ($this->filled($field) && !self::isCnpj((string) $this->value($field))) {
            $this->add($field, $message);
        }
    }

    public function same(string $field, string $other, string $message): void
    {
        if ($this->filled($field) && (string) $this->value($field) !== (string) $this->value($other)) {
            $this->add($field, $message);
        }
    }

    /** @param list<string> $allowed */
    public function in(string $field, array $allowed, string $message): void
    {
        if (!$this->filled($field)) {
            return;
        }
        $values = (array) $this->value($field);
        foreach ($values as $value) {
            if (!in_array((string) $value, $allowed, true)) {
                $this->add($field, $message);
                return;
            }
        }
    }

    public function decimal(string $field, string $min, string $message): void
    {
        if (!$this->filled($field)) {
            return;
        }
        $value = trim((string) $this->value($field));
        if (preg_match('/^-?\d+(\.\d+)?$/', $value) !== 1 || self::compareDecimal($value, $min) < 0) {
            $this->add($field, $message);
        }
    }

    /** @return array<string, list<string>> */
    public function errors(): array
    {
        return $this->errors;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    public static function codePoints(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : count(preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: []);
    }

    public static function isCpf(string $value): bool
    {
        if (preg_match('/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/', trim($value)) !== 1) {
            return false;
        }
        $d = preg_replace('/\D/', '', $value);
        if (preg_match('/^(\d)\1{10}$/', $d) === 1) {
            return false;
        }
        for ($t = 9; $t < 11; $t++) {
            $sum = 0;
            for ($i = 0; $i < $t; $i++) {
                $sum += (int) $d[$i] * (($t + 1) - $i);
            }
            $digit = ($sum * 10) % 11 % 10;
            if ((int) $d[$t] !== $digit) {
                return false;
            }
        }
        return true;
    }

    /** CNPJ numérico ou alfanumérico (valor do caractere = ASCII - 48). */
    public static function isCnpj(string $value): bool
    {
        $text = strtoupper(trim($value));
        if (preg_match('/^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}$/', $text) !== 1) {
            return false;
        }
        $clean = preg_replace('/[.\/\-]/', '', $text);
        if (preg_match('/^(.)\1{13}$/', $clean) === 1) {
            return false;
        }
        $values = array_map(static fn (string $c): int => ord($c) - 48, str_split(substr($clean, 0, 12)));
        $calc = static function (array $values, array $weights): int {
            $sum = 0;
            foreach ($weights as $i => $w) {
                $sum += $values[$i] * $w;
            }
            $rest = $sum % 11;
            return $rest < 2 ? 0 : 11 - $rest;
        };
        $d1 = $calc($values, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        $values[] = $d1;
        $d2 = $calc($values, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        return substr($clean, 12) === $d1 . $d2;
    }

    public static function compareDecimal(string $a, string $b): int
    {
        if (function_exists('bccomp')) {
            return bccomp($a, $b, 20);
        }
        [$ai, $af] = array_pad(explode('.', ltrim($a, '+')), 2, '');
        [$bi, $bf] = array_pad(explode('.', ltrim($b, '+')), 2, '');
        $scale = max(strlen($af), strlen($bf));
        $x = $ai . str_pad($af, $scale, '0');
        $y = $bi . str_pad($bf, $scale, '0');
        $negX = str_starts_with($x, '-');
        $negY = str_starts_with($y, '-');
        if ($negX !== $negY) {
            return $negX ? -1 : 1;
        }
        $x = ltrim(ltrim($x, '-'), '0');
        $y = ltrim(ltrim($y, '-'), '0');
        $cmp = strlen($x) <=> strlen($y) ?: strcmp($x, $y) <=> 0;
        return $negX ? -$cmp : $cmp;
    }
}
