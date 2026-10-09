<?php

declare(strict_types=1);

namespace AlpineForm\Server;

/**
 * Inspeção de uploads multipart no SERVIDOR: código de erro do PHP, tamanho, extensão permitida,
 * MIME detectado pelo conteúdo (finfo) compatível com a extensão e decodificação de imagens.
 * Não substitui antivírus nem sanitização de documentos; conteúdo ativo (HTML/SVG/XML) não é aceito.
 */
final class UploadInspector
{
    private const PHP_ERRORS = [
        UPLOAD_ERR_INI_SIZE => 'O arquivo excede o limite upload_max_filesize do servidor.',
        UPLOAD_ERR_FORM_SIZE => 'O arquivo excede o limite MAX_FILE_SIZE do formulário.',
        UPLOAD_ERR_PARTIAL => 'O upload foi interrompido antes de terminar.',
        UPLOAD_ERR_NO_FILE => 'Nenhum arquivo foi enviado.',
        UPLOAD_ERR_NO_TMP_DIR => 'Servidor sem diretório temporário configurado.',
        UPLOAD_ERR_CANT_WRITE => 'O servidor não conseguiu gravar o arquivo.',
        UPLOAD_ERR_EXTENSION => 'Uma extensão do PHP interrompeu o upload.',
    ];

    /** @param array<string, list<string>> $allowed extensão => MIMEs aceitos */
    public function __construct(private array $allowed, private int $maxBytes)
    {
    }

    /**
     * Normaliza $_FILES[campo] (único ou múltiplo) em lista de arquivos.
     * @param array<string, mixed> $entry
     * @return list<array{name: string, type: string, tmp_name: string, error: int, size: int}>
     */
    public static function normalize(array $entry): array
    {
        if (!is_array($entry['name'] ?? null)) {
            return [[
                'name' => (string) ($entry['name'] ?? ''),
                'type' => (string) ($entry['type'] ?? ''),
                'tmp_name' => (string) ($entry['tmp_name'] ?? ''),
                'error' => (int) ($entry['error'] ?? UPLOAD_ERR_NO_FILE),
                'size' => (int) ($entry['size'] ?? 0),
            ]];
        }
        $files = [];
        foreach ($entry['name'] as $i => $name) {
            $files[] = [
                'name' => (string) $name,
                'type' => (string) ($entry['type'][$i] ?? ''),
                'tmp_name' => (string) ($entry['tmp_name'][$i] ?? ''),
                'error' => (int) ($entry['error'][$i] ?? UPLOAD_ERR_NO_FILE),
                'size' => (int) ($entry['size'][$i] ?? 0),
            ];
        }
        return array_values(array_filter($files, static fn ($f) => $f['error'] !== UPLOAD_ERR_NO_FILE));
    }

    /** @param array{name: string, tmp_name: string, error: int, size: int} $file @return array<string, mixed> */
    public function inspect(array $file, bool $requireUploaded = true): array
    {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return ['ok' => false, 'error' => self::PHP_ERRORS[$file['error']] ?? 'Falha desconhecida no upload.'];
        }
        if ($requireUploaded && !is_uploaded_file($file['tmp_name'])) {
            return ['ok' => false, 'error' => 'Arquivo temporário inválido.'];
        }
        $size = filesize($file['tmp_name']);
        if ($size === 0) {
            return ['ok' => false, 'error' => 'O arquivo está vazio.'];
        }
        if ($size > $this->maxBytes) {
            return ['ok' => false, 'error' => 'O arquivo excede o tamanho máximo aceito.'];
        }
        $name = Fs::displayName($file['name']);
        $ext = Fs::extension($name);
        if ($ext === '' || !isset($this->allowed[$ext])) {
            return ['ok' => false, 'error' => 'Extensão não permitida.'];
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: 'application/octet-stream';
        if (!in_array($mime, $this->allowed[$ext], true)) {
            return ['ok' => false, 'error' => "O conteúdo do arquivo ({$mime}) não corresponde à extensão .{$ext}."];
        }
        $meta = ['ok' => true, 'name' => $name, 'ext' => $ext, 'mime' => $mime, 'size' => $size];
        if (str_starts_with($mime, 'image/')) {
            $info = @getimagesize($file['tmp_name']);
            if ($info === false) {
                return ['ok' => false, 'error' => 'A imagem não pôde ser decodificada.'];
            }
            $meta['width'] = $info[0];
            $meta['height'] = $info[1];
        }
        return $meta;
    }
}
