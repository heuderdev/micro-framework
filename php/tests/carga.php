<?php
/**
 * Teste de carga da exportação CSV (memória constante com milhões de linhas).
 *
 *   php php/tests/carga.php                 # cenários padrão (2 milhões de linhas geradas + MySQL, se houver)
 *   php php/tests/carga.php --linhas=500000 # outro volume
 *   AF_MYSQL_DSN="mysql:host=127.0.0.1;port=3306" AF_MYSQL_USUARIO=root AF_MYSQL_SENHA= php php/tests/carga.php
 *
 * Cada cenário roda num processo PHP separado, para o pico de memória medido ser só dele.
 * Os cenários "em fluxo" precisam ficar abaixo de LIMITE_MB, não importa o número de linhas.
 * O cenário "MySQL com buffer" (jeito comum, sem Csv::linhasDoBanco) é só medido, para comparação.
 */

require dirname(__DIR__) . '/alpine-form.php';

use AlpineForm\Helpers\Csv;
use AlpineForm\Helpers\Resposta;

const LIMITE_MB = 16;

$opcoes = getopt('', ['linhas::', 'cenario::', 'saida::', 'mysql-linhas::']);
$linhas = isset($opcoes['linhas']) ? max(1, (int) $opcoes['linhas']) : 2000000;
$linhasMysql = isset($opcoes['mysql-linhas']) ? max(1, (int) $opcoes['mysql-linhas']) : 1000000;
$colunas = ['id' => 'Código', 'nome' => 'Nome', 'email' => 'E-mail', 'uf' => 'UF', 'saldo' => 'Saldo', 'criado_em' => 'Cadastro'];

function gerador($total)
{
    $ufs = ['SP', 'RJ', 'MG', 'RS', 'BA', 'PR'];
    for ($i = 1; $i <= $total; $i++) {
        yield ['id' => $i, 'nome' => "Cliente {$i}", 'email' => "cliente{$i}@exemplo.com", 'uf' => $ufs[$i % 6], 'saldo' => number_format(($i * 7919 % 100000) / 100, 2, '.', ''), 'criado_em' => '2024-01-01'];
    }
}

function conectarMysql()
{
    $dsn = getenv('AF_MYSQL_DSN') ?: 'mysql:host=127.0.0.1;port=3306';
    try {
        $pdo = new PDO($dsn, getenv('AF_MYSQL_USUARIO') ?: 'root', getenv('AF_MYSQL_SENHA') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    } catch (Throwable $e) {
        return null;
    }
    $pdo->exec('CREATE DATABASE IF NOT EXISTS alpineform_carga CHARACTER SET utf8mb4');
    $pdo->exec('USE alpineform_carga');
    return $pdo;
}

function prepararMysql(PDO $pdo, $total)
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS clientes (id INT PRIMARY KEY, nome VARCHAR(80), email VARCHAR(120), uf CHAR(2), saldo DECIMAL(12,2), criado_em DATE)');
    $atual = (int) $pdo->query('SELECT COUNT(*) FROM clientes')->fetchColumn();
    if ($atual === $total) {
        return;
    }
    $pdo->exec('TRUNCATE clientes');
    $pdo->exec('SET SESSION cte_max_recursion_depth = ' . ($total + 1));
    $pdo->exec("INSERT INTO clientes (id, nome, email, uf, saldo, criado_em)
        WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < {$total})
        SELECT n, CONCAT('Cliente ', n), CONCAT('cliente', n, '@exemplo.com'), ELT(1 + n % 6, 'SP', 'RJ', 'MG', 'RS', 'BA', 'PR'),
               (n * 7919 % 100000) / 100, DATE_ADD('2020-01-01', INTERVAL n % 2000 DAY) FROM seq");
}

/** Executa um cenário (processo filho) e imprime o resultado em JSON. */
function executarCenario($cenario, $linhas, $colunas, $saida)
{
    $base = memory_get_usage();
    $inicio = microtime(true);
    $arquivo = fopen($saida, 'wb');
    $filtro = null;
    switch ($cenario) {
        case 'gerador':
            $total = Csv::escrever($arquivo, $colunas, gerador($linhas));
            break;
        case 'gerador-gzip':
            $filtro = Csv::comprimir($arquivo);
            $total = Csv::escrever($arquivo, $colunas, gerador($linhas));
            break;
        case 'mysql-sem-buffer':
            $pdo = conectarMysql();
            $total = Csv::escrever($arquivo, $colunas, Csv::linhasDoBanco($pdo, 'SELECT id, nome, email, uf, saldo, criado_em FROM clientes ORDER BY id'));
            break;
        case 'mysql-por-lote':
            $pdo = conectarMysql();
            $total = Csv::escrever($arquivo, $colunas, Csv::linhasPorLote(function ($ultima, $tamanho) use ($pdo) {
                $st = $pdo->prepare('SELECT id, nome, email, uf, saldo, criado_em FROM clientes WHERE id > ? ORDER BY id LIMIT ' . (int) $tamanho);
                $st->execute([$ultima ? $ultima['id'] : 0]);
                return $st->fetchAll(PDO::FETCH_ASSOC);
            }, 5000));
            break;
        case 'mysql-com-buffer':
            // jeito comum (e problemático): o PDO do MySQL traz o resultado inteiro antes do primeiro fetch
            $pdo = conectarMysql();
            $total = Csv::escrever($arquivo, $colunas, $pdo->query('SELECT id, nome, email, uf, saldo, criado_em FROM clientes ORDER BY id', PDO::FETCH_ASSOC));
            break;
        default:
            throw new InvalidArgumentException("Cenário desconhecido: {$cenario}");
    }
    if ($filtro) {
        stream_filter_remove($filtro);
    }
    fclose($arquivo);
    echo json_encode([
        'linhas' => $total,
        'bytes' => filesize($saida),
        'segundos' => round(microtime(true) - $inicio, 2),
        'memoriaMB' => round((memory_get_peak_usage() - $base) / 1048576, 2),
    ]);
}

if (isset($opcoes['cenario'])) {
    executarCenario($opcoes['cenario'], $linhas, $colunas, $opcoes['saida']);
    exit(0);
}

// ---------------- orquestração ----------------

$tmp = sys_get_temp_dir() . '/alpineform-carga-' . getmypid();
@mkdir($tmp);
$falhas = 0;
$resultados = [];

function rodar($cenario, $linhas, $tmp, $extras = [])
{
    $saida = "{$tmp}/{$cenario}.csv";
    $cmd = escapeshellarg(PHP_BINARY) . ' -d memory_limit=-1 ' . escapeshellarg(__FILE__) . ' --cenario=' . $cenario . ' --linhas=' . $linhas . ' --saida=' . escapeshellarg($saida);
    $json = shell_exec($cmd);
    $dados = json_decode((string) $json, true);
    if (!is_array($dados)) {
        throw new RuntimeException("Cenário {$cenario} falhou: " . trim((string) $json));
    }
    $dados['arquivo'] = $saida;
    return $dados;
}

function linhaDoRelatorio($nome, $r)
{
    printf("  %-34s %9s linhas  %8.1f MB arquivo  %6.2f s  pico de memória %7.2f MB\n", $nome, number_format($r['linhas'], 0, ',', '.'), $r['bytes'] / 1048576, $r['segundos'], $r['memoriaMB']);
}

function conferir($condicao, $mensagem)
{
    global $falhas;
    if (!$condicao) {
        $falhas++;
        echo "  ✗ {$mensagem}\n";
    } else {
        echo "  ✓ {$mensagem}\n";
    }
}

echo "Exportação CSV — teste de carga (PHP " . PHP_VERSION . ")\n\n";

$r = rodar('gerador', $linhas, $tmp);
linhaDoRelatorio('gerador (yield) → arquivo', $r);
conferir($r['linhas'] === $linhas, "escreveu {$linhas} linhas");
conferir($r['memoriaMB'] < LIMITE_MB, 'memória constante (< ' . LIMITE_MB . ' MB) com ' . number_format($linhas, 0, ',', '.') . ' linhas');
$contagem = 0;
$h = fopen($r['arquivo'], 'rb');
while (fgets($h) !== false) {
    $contagem++;
}
fclose($h);
conferir($contagem === $linhas + 1, 'arquivo tem cabeçalho + todas as linhas');

$g = rodar('gerador-gzip', $linhas, $tmp);
linhaDoRelatorio('gerador → gzip', $g);
conferir($g['memoriaMB'] < LIMITE_MB, 'gzip em fluxo também com memória constante');
conferir($g['bytes'] * 3 < $r['bytes'], sprintf('gzip %.1fx menor', $r['bytes'] / max(1, $g['bytes'])));

$pdo = conectarMysql();
if (!$pdo) {
    echo "\n  (MySQL indisponível: cenários de banco pulados. Configure AF_MYSQL_DSN/AF_MYSQL_USUARIO/AF_MYSQL_SENHA.)\n";
} else {
    echo "\n  Preparando " . number_format($linhasMysql, 0, ',', '.') . " linhas no MySQL (" . $pdo->getAttribute(PDO::ATTR_SERVER_VERSION) . ")...\n";
    prepararMysql($pdo, $linhasMysql);
    $semBuffer = rodar('mysql-sem-buffer', $linhasMysql, $tmp);
    linhaDoRelatorio('MySQL Csv::linhasDoBanco (sem buffer)', $semBuffer);
    conferir($semBuffer['linhas'] === $linhasMysql && $semBuffer['memoriaMB'] < LIMITE_MB, 'MySQL sem buffer: todas as linhas, memória constante');
    $lote = rodar('mysql-por-lote', $linhasMysql, $tmp);
    linhaDoRelatorio('MySQL Csv::linhasPorLote (chave)', $lote);
    conferir($lote['linhas'] === $linhasMysql && $lote['memoriaMB'] < LIMITE_MB, 'MySQL por lote: todas as linhas, memória constante');
    conferir(md5_file($semBuffer['arquivo']) === md5_file($lote['arquivo']), 'os dois jeitos geram exatamente o mesmo arquivo');
    $comBuffer = rodar('mysql-com-buffer', $linhasMysql, $tmp);
    linhaDoRelatorio('MySQL query() comum (COM buffer)', $comBuffer);
    echo sprintf("    → comparação: o jeito comum usou %.0fx mais memória (cresce com o número de linhas)\n", $comBuffer['memoriaMB'] / max(0.01, $semBuffer['memoriaMB']));
}

// HTTP de verdade: servidor PHP embutido, download em fluxo com gzip, memória do servidor medida no fim
echo "\n";
$porta = 18000 + random_int(0, 999);
$router = "{$tmp}/router.php";
$memoria = "{$tmp}/memoria-servidor.txt";
file_put_contents($router, '<?php require ' . var_export(dirname(__DIR__) . '/alpine-form.php', true) . ";\n"
    . 'register_shutdown_function(function () { file_put_contents(' . var_export($memoria, true) . ', (string) memory_get_peak_usage()); });' . "\n"
    . 'function g($n) { for ($i = 1; $i <= $n; $i++) { yield ["id" => $i, "nome" => "Cliente " . $i]; } }' . "\n"
    . 'AlpineForm\\Helpers\\Csv::enviar("grande.csv", ["id" => "Código", "nome" => "Nome"], g((int) $_GET["linhas"]), ["gzip" => !empty($_GET["gzip"])]);');
$servidor = proc_open([PHP_BINARY, '-S', "127.0.0.1:{$porta}", $router], [1 => ['file', "{$tmp}/servidor.log", 'a'], 2 => ['file', "{$tmp}/servidor.log", 'a']], $pipes);
usleep(400000);
foreach ([false, true] as $comGzip) {
    $inicio = microtime(true);
    $contexto = stream_context_create(['http' => ['header' => $comGzip ? "Accept-Encoding: gzip\r\n" : '', 'timeout' => 300]]);
    $fluxo = fopen("http://127.0.0.1:{$porta}/?linhas={$linhas}" . ($comGzip ? '&gzip=1' : ''), 'rb', false, $contexto);
    $bytes = 0;
    $cabecalhos = isset($http_response_header) ? implode("\n", $http_response_header) : '';
    $temp = fopen('php://temp', 'w+b');
    while (!feof($fluxo)) {
        $pedaco = fread($fluxo, 65536);
        $bytes += strlen($pedaco);
        fwrite($temp, $pedaco);
    }
    fclose($fluxo);
    rewind($temp);
    $conteudo = stream_get_contents($temp);
    $texto = $comGzip ? gzdecode($conteudo) : $conteudo;
    $memServidor = round((int) @file_get_contents($memoria) / 1048576, 2);
    printf("  %-34s %9s linhas  %8.1f MB trafegados  %6.2f s  pico do servidor %5.2f MB\n", 'HTTP ' . ($comGzip ? 'com gzip' : 'sem gzip'), number_format(substr_count((string) $texto, "\r\n") - 1, 0, ',', '.'), $bytes / 1048576, microtime(true) - $inicio, $memServidor);
    conferir(is_string($texto) && substr_count($texto, "\r\n") === $linhas + 1, 'HTTP ' . ($comGzip ? 'gzip' : 'normal') . ': download completo e íntegro');
    conferir($memServidor > 0 && $memServidor < LIMITE_MB, 'HTTP ' . ($comGzip ? 'gzip' : 'normal') . ': memória do servidor constante');
    if ($comGzip) {
        conferir(stripos($cabecalhos, 'Content-Encoding: gzip') !== false, 'resposta com Content-Encoding: gzip');
    }
    unset($conteudo, $texto);
    fclose($temp);
}
proc_terminate($servidor);
proc_close($servidor);

foreach (glob("{$tmp}/*") as $arquivo) {
    @unlink($arquivo);
}
@rmdir($tmp);
echo "\n" . ($falhas ? "{$falhas} verificação(ões) falharam.\n" : "Todas as verificações passaram.\n");
exit($falhas ? 1 : 0);
