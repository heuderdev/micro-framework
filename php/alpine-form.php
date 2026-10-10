<?php
/**
 * Helpers PHP do AlpineForm — arquivo único, sem dependências, compatível com PHP 7.0+ (Joomla 3) até 8.x.
 *
 *   require __DIR__ . '/alpine-form.php';
 *   use AlpineForm\Helpers\Resposta;
 *   use AlpineForm\Helpers\Entrada;
 *   use AlpineForm\Helpers\Validador;
 *   use AlpineForm\Helpers\Consulta;
 *   use AlpineForm\Helpers\Csrf;
 *
 * Resposta  — JSON no contrato do AlpineForm (sucesso, 422 com erros por campo, erro geral, 202 com job).
 * Entrada   — lê o corpo (JSON, urlencoded ou multipart) e campos aninhados ("itens.0.nome").
 * Validador — regras comuns com mensagens em pt-BR e as mesmas chaves que o cliente usa nos erros.
 * Consulta  — parâmetros de listagem (page, per_page, sort, direction, filtros) com lista branca e limites,
 *             e a resposta no formato que o módulo x-lista lê.
 * Csrf      — token por sessão para <meta name="csrf-token"> e conferência do cabeçalho X-CSRF-TOKEN.
 *
 * Nada aqui monta SQL com texto do usuário: ordenação só por colunas da lista branca, paginação só com inteiros.
 */

namespace AlpineForm\Helpers;

/** Respostas JSON no contrato { success, message, errors, data }. */
final class Resposta
{
    /** Quando true, enviar() não chama exit (útil em testes e em frameworks que encerram a requisição). */
    public static $semExit = false;

    /** @return array [status, corpo] */
    public static function sucesso($dados = null, $mensagem = null, $status = 200)
    {
        return [(int) $status, ['success' => true, 'message' => $mensagem, 'data' => $dados]];
    }

    /**
     * Falha de validação: HTTP 422 com erros por campo. As chaves podem ser o name do HTML
     * ("itens[0][nome]") ou com ponto ("itens.0.nome"); "" ou "_" vão para o resumo geral.
     *
     * @param array $erros [campo => mensagem|mensagem[]]
     * @return array [status, corpo]
     */
    public static function invalido(array $erros, $mensagem = 'Confira os campos destacados.')
    {
        $normalizados = [];
        foreach ($erros as $campo => $mensagens) {
            $lista = is_array($mensagens) ? array_values($mensagens) : [$mensagens];
            $lista = array_values(array_filter(array_map('strval', $lista), 'strlen'));
            if ($lista) {
                $normalizados[(string) $campo] = $lista;
            }
        }
        return [422, ['success' => false, 'message' => $mensagem, 'errors' => (object) $normalizados]];
    }

    /** Erro sem campo (regra de negócio, permissão, falha interna). Nunca coloque detalhes internos na mensagem. */
    public static function erro($mensagem, $status = 400, $dados = null)
    {
        $corpo = ['success' => false, 'message' => (string) $mensagem];
        if ($dados !== null) {
            $corpo['data'] = $dados;
        }
        return [(int) $status, $corpo];
    }

    /** Processamento posterior: HTTP 202 com o job; o cliente consulta status_url até terminar. */
    public static function aceito($jobId, $statusUrl, $cancelUrl = null, $mensagem = 'Recebido. Processando…')
    {
        $job = ['id' => (string) $jobId, 'status_url' => (string) $statusUrl];
        if ($cancelUrl !== null) {
            $job['cancel_url'] = (string) $cancelUrl;
        }
        return [202, ['success' => true, 'message' => $mensagem, 'job' => $job]];
    }

    /** Codifica em JSON (UTF-8 sem escapar acentos; caracteres inválidos substituídos, nunca uma resposta vazia). */
    public static function json($corpo)
    {
        $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        $json = json_encode($corpo, $flags);
        if ($json === false) {
            $json = json_encode(['success' => false, 'message' => 'Falha ao gerar a resposta.'], $flags);
        }
        return $json;
    }

    /**
     * Envia [status, corpo] com cabeçalhos seguros e encerra.
     *   Resposta::enviar(Resposta::sucesso(['id' => 7], 'Salvo.'));
     */
    public static function enviar(array $resposta)
    {
        list($status, $corpo) = $resposta;
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        echo self::json($corpo);
        if (!self::$semExit) {
            exit;
        }
    }
}

/** Leitura do corpo da requisição independente da codificação usada pelo formulário. */
final class Entrada
{
    /** @var array */
    private $dados;

    public function __construct(array $dados)
    {
        $this->dados = $dados;
    }

    /**
     * JSON (data-form-encoding="json"), urlencoded ou multipart. Em GET, lê a query string.
     * $corpoBruto e $servidor existem para testes; normalmente não são passados.
     */
    public static function ler($corpoBruto = null, $servidor = null, $post = null, $get = null)
    {
        $servidor = $servidor === null ? $_SERVER : $servidor;
        $metodo = strtoupper(isset($servidor['REQUEST_METHOD']) ? $servidor['REQUEST_METHOD'] : 'GET');
        if ($metodo === 'GET' || $metodo === 'HEAD') {
            return new self($get === null ? $_GET : $get);
        }
        $tipo = strtolower(isset($servidor['CONTENT_TYPE']) ? $servidor['CONTENT_TYPE'] : (isset($servidor['HTTP_CONTENT_TYPE']) ? $servidor['HTTP_CONTENT_TYPE'] : ''));
        if (strpos($tipo, 'application/json') !== false) {
            $bruto = $corpoBruto === null ? file_get_contents('php://input') : $corpoBruto;
            $json = json_decode((string) $bruto, true);
            return new self(is_array($json) ? $json : []);
        }
        return new self($post === null ? $_POST : $post);
    }

    /** @return array */
    public function todos()
    {
        return $this->dados;
    }

    /** Valor por nome do HTML ou caminho com ponto: "cliente[nome]", "cliente.nome", "itens.0.nome". */
    public function get($campo, $padrao = null)
    {
        $atual = $this->dados;
        foreach (self::caminho($campo) as $parte) {
            if (!is_array($atual) || !array_key_exists($parte, $atual)) {
                return $padrao;
            }
            $atual = $atual[$parte];
        }
        return $atual;
    }

    /** Texto aparado (arrays viram ''). */
    public function texto($campo, $padrao = '')
    {
        $valor = $this->get($campo, $padrao);
        return is_scalar($valor) ? trim((string) $valor) : $padrao;
    }

    /** Somente dígitos (CPF, CNPJ, CEP, telefone enviados com ou sem máscara). */
    public function digitos($campo)
    {
        return preg_replace('/\D+/', '', $this->texto($campo));
    }

    /** Lista (checkbox[] e select múltiplo); valor único vira lista de um item. */
    public function lista($campo)
    {
        $valor = $this->get($campo, []);
        if ($valor === null || $valor === '') {
            return [];
        }
        return array_values(array_filter(is_array($valor) ? $valor : [$valor], 'is_scalar'));
    }

    public function tem($campo)
    {
        return $this->get($campo, null) !== null;
    }

    /** "a[b][0]" e "a.b.0" → ['a', 'b', '0'] */
    public static function caminho($campo)
    {
        $campo = str_replace(['[]', ']'], ['', ''], (string) $campo);
        return array_values(array_filter(preg_split('/[\[.]/', $campo), 'strlen'));
    }
}

/**
 * Validação de servidor (autoridade final) com mensagens em pt-BR.
 *
 *   $v = new Validador(Entrada::ler()->todos());
 *   $v->obrigatorio('nome')->tamanho('nome', 3, 80)
 *     ->obrigatorio('email')->email('email')
 *     ->cpf('cpf')->em('uf', ['SP', 'RJ']);
 *   if ($v->falhou()) Resposta::enviar(Resposta::invalido($v->erros()));
 *
 * Cada regra (exceto obrigatorio) ignora campo vazio; combine com obrigatorio() quando ele não for opcional.
 * Depois do primeiro erro de um campo, as regras seguintes desse campo não acrescentam mensagens.
 */
final class Validador
{
    /** Mensagens padrão; altere globalmente: Validador::$mensagens['obrigatorio'] = '...'. */
    public static $mensagens = [
        'obrigatorio' => 'Preencha este campo.',
        'tamanho_min' => 'Use pelo menos :min caracteres.',
        'tamanho_max' => 'Use no máximo :max caracteres.',
        'email' => 'Informe um e-mail válido.',
        'cpf' => 'CPF inválido.',
        'cnpj' => 'CNPJ inválido.',
        'cpf_cnpj' => 'CPF ou CNPJ inválido.',
        'cep' => 'CEP inválido.',
        'telefone' => 'Telefone inválido.',
        'inteiro' => 'Informe um número inteiro.',
        'decimal' => 'Informe um número com até :casas casas decimais.',
        'min' => 'O valor mínimo é :min.',
        'max' => 'O valor máximo é :max.',
        'em' => 'Escolha uma opção válida.',
        'data' => 'Informe uma data válida.',
        'data_min' => 'A data deve ser a partir de :data.',
        'data_max' => 'A data deve ser até :data.',
        'igual' => 'Os valores não conferem.',
        'regex' => 'Formato inválido.',
        'url' => 'Informe um endereço válido (https://…).',
    ];

    /** @var Entrada */
    private $entrada;
    /** @var array */
    private $erros = [];

    /** @param array|Entrada $dados */
    public function __construct($dados)
    {
        $this->entrada = $dados instanceof Entrada ? $dados : new Entrada((array) $dados);
    }

    public function valor($campo)
    {
        return $this->entrada->get($campo);
    }

    /** Adiciona um erro próprio (ex.: "e-mail já cadastrado"). */
    public function erro($campo, $mensagem)
    {
        $this->erros[self::chave($campo)][] = (string) $mensagem;
        return $this;
    }

    public function temErro($campo)
    {
        return !empty($this->erros[self::chave($campo)]);
    }

    public function falhou()
    {
        return count($this->erros) > 0;
    }

    /** @return array [campo => mensagens[]] com chaves no formato "itens.0.nome". */
    public function erros()
    {
        return $this->erros;
    }

    public function obrigatorio($campo, $mensagem = null)
    {
        if ($this->vazio($campo)) {
            $this->falha($campo, $mensagem, 'obrigatorio');
        }
        return $this;
    }

    /** Comprimento em caracteres (não bytes). */
    public function tamanho($campo, $min = null, $max = null, $mensagem = null)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        $n = self::comprimento($this->texto($campo));
        if ($min !== null && $n < $min) {
            $this->falha($campo, $mensagem, 'tamanho_min', [':min' => $min]);
        } elseif ($max !== null && $n > $max) {
            $this->falha($campo, $mensagem, 'tamanho_max', [':max' => $max]);
        }
        return $this;
    }

    public function email($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'email', function ($v) {
            return filter_var($v, FILTER_VALIDATE_EMAIL) !== false;
        });
    }

    public function cpf($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'cpf', [self::class, 'cpfValido']);
    }

    public function cnpj($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'cnpj', [self::class, 'cnpjValido']);
    }

    public function cpfOuCnpj($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'cpf_cnpj', function ($v) {
            $d = preg_replace('/\D+/', '', $v);
            return strlen($d) === 11 ? Validador::cpfValido($d) : Validador::cnpjValido($d);
        });
    }

    public function cep($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'cep', function ($v) {
            return (bool) preg_match('/^\d{5}-?\d{3}$/', $v);
        });
    }

    /** Fixo ou celular com DDD (10 ou 11 dígitos). */
    public function telefone($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'telefone', function ($v) {
            $d = preg_replace('/\D+/', '', $v);
            return (bool) preg_match('/^[1-9]{2}(9\d{8}|[2-8]\d{7})$/', $d);
        });
    }

    public function inteiro($campo, $min = null, $max = null, $mensagem = null)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        $v = $this->texto($campo);
        if (!preg_match('/^-?\d+$/', $v)) {
            return $this->falha($campo, $mensagem, 'inteiro');
        }
        return $this->limites($campo, $v, $min, $max, $mensagem);
    }

    /**
     * Decimal com ponto ("1234.50", como o AlpineForm envia valores de máscara moeda).
     * Comparação exata como texto — nunca float. $min/$max também como texto ("0.01").
     */
    public function decimal($campo, $casas = 2, $min = null, $max = null, $mensagem = null)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        $v = $this->texto($campo);
        if (!preg_match('/^-?\d+(\.\d{1,' . (int) $casas . '})?$/', $v)) {
            return $this->falha($campo, $mensagem, 'decimal', [':casas' => $casas]);
        }
        return $this->limites($campo, $v, $min, $max, $mensagem);
    }

    public function em($campo, array $opcoes, $mensagem = null)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        $opcoes = array_map('strval', $opcoes);
        $valores = $this->valor($campo);
        foreach (is_array($valores) ? $valores : [$valores] as $v) {
            if (!is_scalar($v) || !in_array((string) $v, $opcoes, true)) {
                return $this->falha($campo, $mensagem, 'em');
            }
        }
        return $this;
    }

    /** Data no formato informado (padrão Y-m-d, o que o input date envia); $min/$max no mesmo formato ou 'hoje'. */
    public function data($campo, $formato = 'Y-m-d', $min = null, $max = null, $mensagem = null)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        $data = self::lerData($this->texto($campo), $formato);
        if (!$data) {
            return $this->falha($campo, $mensagem, 'data');
        }
        $limiteMin = $min === null ? null : ($min === 'hoje' ? new \DateTimeImmutable('today') : self::lerData($min, $formato));
        $limiteMax = $max === null ? null : ($max === 'hoje' ? new \DateTimeImmutable('today') : self::lerData($max, $formato));
        if ($limiteMin && $data < $limiteMin) {
            $this->falha($campo, $mensagem, 'data_min', [':data' => $limiteMin->format('d/m/Y')]);
        } elseif ($limiteMax && $data > $limiteMax) {
            $this->falha($campo, $mensagem, 'data_max', [':data' => $limiteMax->format('d/m/Y')]);
        }
        return $this;
    }

    /** Confirmação: o campo deve ser igual a outro (senha_confirmacao → senha). */
    public function igual($campo, $outro, $mensagem = null)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        if ((string) $this->texto($campo) !== (string) $this->texto($outro)) {
            $this->falha($campo, $mensagem, 'igual');
        }
        return $this;
    }

    public function regex($campo, $padrao, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'regex', function ($v) use ($padrao) {
            return (bool) preg_match($padrao, $v);
        });
    }

    /** Somente http/https. */
    public function url($campo, $mensagem = null)
    {
        return $this->regra($campo, $mensagem, 'url', function ($v) {
            return filter_var($v, FILTER_VALIDATE_URL) !== false && preg_match('#^https?://#i', $v);
        });
    }

    /** Regra própria: $teste recebe o valor (texto) e devolve true quando válido. */
    public function regra($campo, $mensagem, $nome, callable $teste)
    {
        if ($this->pular($campo)) {
            return $this;
        }
        if (!$teste($this->texto($campo))) {
            $this->falha($campo, $mensagem, $nome);
        }
        return $this;
    }

    /**
     * Valida cada item de uma lista (itens[0][nome]...): $regras recebe um Validador do item e o índice;
     * os erros voltam com o caminho completo ("itens.0.nome").
     */
    public function cadaItem($campo, callable $regras)
    {
        $itens = $this->valor($campo);
        if (!is_array($itens)) {
            return $this;
        }
        foreach ($itens as $indice => $item) {
            $sub = new self(is_array($item) ? $item : []);
            $regras($sub, $indice);
            foreach ($sub->erros() as $chave => $mensagens) {
                foreach ($mensagens as $m) {
                    $this->erros[self::chave($campo) . '.' . $indice . '.' . $chave][] = $m;
                }
            }
        }
        return $this;
    }

    public static function cpfValido($valor)
    {
        $d = preg_replace('/\D+/', '', (string) $valor);
        if (strlen($d) !== 11 || preg_match('/^(\d)\1{10}$/', $d)) {
            return false;
        }
        for ($t = 9; $t < 11; $t++) {
            $soma = 0;
            for ($i = 0; $i < $t; $i++) {
                $soma += (int) $d[$i] * (($t + 1) - $i);
            }
            $digito = ((10 * $soma) % 11) % 10;
            if ((int) $d[$t] !== $digito) {
                return false;
            }
        }
        return true;
    }

    public static function cnpjValido($valor)
    {
        $d = preg_replace('/\D+/', '', (string) $valor);
        if (strlen($d) !== 14 || preg_match('/^(\d)\1{13}$/', $d)) {
            return false;
        }
        foreach ([12, 13] as $t) {
            $soma = 0;
            $peso = $t - 7;
            for ($i = 0; $i < $t; $i++) {
                $soma += (int) $d[$i] * $peso;
                $peso = $peso === 2 ? 9 : $peso - 1;
            }
            $resto = $soma % 11;
            if ((int) $d[$t] !== ($resto < 2 ? 0 : 11 - $resto)) {
                return false;
            }
        }
        return true;
    }

    /** "itens[0][nome]" → "itens.0.nome" (mesmo formato que o cliente associa ao campo). */
    public static function chave($campo)
    {
        return implode('.', Entrada::caminho($campo));
    }

    private function texto($campo)
    {
        $v = $this->valor($campo);
        return is_scalar($v) ? trim((string) $v) : '';
    }

    private function vazio($campo)
    {
        $v = $this->valor($campo);
        if (is_array($v)) {
            return count($v) === 0;
        }
        return $v === null || trim((string) $v) === '';
    }

    /** Campo vazio (regra opcional) ou que já tem erro. */
    private function pular($campo)
    {
        return $this->vazio($campo) || $this->temErro($campo);
    }

    private function falha($campo, $mensagem, $regra, array $troca = [])
    {
        if ($this->temErro($campo)) {
            return $this;
        }
        $texto = $mensagem !== null ? $mensagem : (isset(self::$mensagens[$regra]) ? self::$mensagens[$regra] : 'Valor inválido.');
        return $this->erro($campo, strtr($texto, array_map('strval', $troca)));
    }

    private function limites($campo, $v, $min, $max, $mensagem)
    {
        if ($min !== null && self::compararDecimal($v, (string) $min) < 0) {
            return $this->falha($campo, $mensagem, 'min', [':min' => $min]);
        }
        if ($max !== null && self::compararDecimal($v, (string) $max) > 0) {
            return $this->falha($campo, $mensagem, 'max', [':max' => $max]);
        }
        return $this;
    }

    /** Compara decimais em texto sem float: -1, 0 ou 1. */
    public static function compararDecimal($a, $b)
    {
        $na = self::partesDecimal($a);
        $nb = self::partesDecimal($b);
        if ($na[0] !== $nb[0]) {
            return $na[0] ? -1 : 1;
        }
        $sinal = $na[0] ? -1 : 1;
        $casas = max(strlen($na[2]), strlen($nb[2]));
        $ia = str_pad($na[1], 1, '0') . str_pad($na[2], $casas, '0');
        $ib = str_pad($nb[1], 1, '0') . str_pad($nb[2], $casas, '0');
        $ia = ltrim($ia, '0');
        $ib = ltrim($ib, '0');
        if ($ia === '' && $ib === '') {
            return 0;
        }
        if (strlen($ia) !== strlen($ib)) {
            return (strlen($ia) < strlen($ib) ? -1 : 1) * $sinal;
        }
        $c = strcmp($ia, $ib);
        return ($c < 0 ? -1 : ($c > 0 ? 1 : 0)) * $sinal;
    }

    private static function partesDecimal($v)
    {
        $v = trim((string) $v);
        $negativo = isset($v[0]) && $v[0] === '-';
        $v = ltrim($v, '-+');
        $partes = explode('.', $v, 2);
        $inteira = ltrim($partes[0], '0');
        $fracao = isset($partes[1]) ? rtrim($partes[1], '0') : '';
        if ($inteira === '' && $fracao === '') {
            $negativo = false;
        }
        return [$negativo, $inteira, $fracao];
    }

    private static function lerData($texto, $formato)
    {
        $data = \DateTimeImmutable::createFromFormat('!' . $formato, (string) $texto);
        if (!$data) {
            return null;
        }
        $erros = \DateTimeImmutable::getLastErrors();
        if ($erros && ($erros['warning_count'] > 0 || $erros['error_count'] > 0)) {
            return null;
        }
        return $data->format($formato) === (string) $texto ? $data : null;
    }

    private static function comprimento($texto)
    {
        return function_exists('mb_strlen') ? mb_strlen($texto, 'UTF-8') : strlen(utf8_decode($texto));
    }
}

/**
 * Parâmetros de listagem (x-lista) lidos com segurança.
 *
 *   $c = Consulta::ler($_GET, [
 *       'ordenaveis' => ['nome' => 'c.nome', 'cadastro' => 'c.created'],  // parâmetro => coluna SQL
 *       'ordem' => 'nome', 'direcao' => 'asc',
 *       'por_pagina' => 20, 'por_pagina_max' => 100,
 *   ]);
 *   $sql = "SELECT ... WHERE ... ORDER BY " . $c->sqlOrdem() . " LIMIT " . $c->porPagina() . " OFFSET " . $c->offset();
 *   Resposta::enviar([200, $c->resposta($itens, $total)]);
 */
final class Consulta
{
    /** @var array */
    private $query;
    /** @var array */
    private $opcoes;
    /** @var int */
    private $pagina;
    /** @var int */
    private $porPagina;
    /** @var string|null */
    private $ordem;
    /** @var string */
    private $direcao;

    const PADRAO = [
        'ordenaveis' => [],          // lista ['nome', 'uf'] ou mapa ['nome' => 'c.nome']
        'ordem' => null,             // ordenação quando o parâmetro falta ou não é permitido
        'direcao' => 'asc',
        'por_pagina' => 20,
        'por_pagina_max' => 100,
        'pagina_max' => 10000,       // evita OFFSET gigantes
        'param_pagina' => 'page',
        'param_por_pagina' => 'per_page',
        'param_ordem' => 'sort',
        'param_direcao' => 'direction',
    ];

    private function __construct(array $query, array $opcoes)
    {
        $this->query = $query;
        $this->opcoes = $opcoes;
        $this->pagina = self::inteiroEntre(self::escalar($query, $opcoes['param_pagina']), 1, (int) $opcoes['pagina_max'], 1);
        $this->porPagina = self::inteiroEntre(self::escalar($query, $opcoes['param_por_pagina']), 1, (int) $opcoes['por_pagina_max'], (int) $opcoes['por_pagina']);
        $ordenaveis = $this->ordenaveis();
        $pedida = self::escalar($query, $opcoes['param_ordem']);
        $this->ordem = ($pedida !== null && isset($ordenaveis[$pedida])) ? $pedida : $opcoes['ordem'];
        if ($this->ordem !== null && !isset($ordenaveis[$this->ordem])) {
            throw new \InvalidArgumentException('Consulta: a ordem padrão "' . $this->ordem . '" não está em "ordenaveis".');
        }
        $direcao = strtolower((string) self::escalar($query, $opcoes['param_direcao']));
        $this->direcao = in_array($direcao, ['asc', 'desc'], true) ? $direcao : (strtolower((string) $opcoes['direcao']) === 'desc' ? 'desc' : 'asc');
    }

    /** @param array $query normalmente $_GET (ou $request->query->all(), $input->getArray()). */
    public static function ler(array $query, array $opcoes = [])
    {
        $desconhecidas = array_diff(array_keys($opcoes), array_keys(self::PADRAO));
        if ($desconhecidas) {
            throw new \InvalidArgumentException('Consulta: opção desconhecida "' . implode('", "', $desconhecidas) . '".');
        }
        return new self($query, array_merge(self::PADRAO, $opcoes));
    }

    public function pagina()
    {
        return $this->pagina;
    }

    public function porPagina()
    {
        return $this->porPagina;
    }

    public function offset()
    {
        return ($this->pagina - 1) * $this->porPagina;
    }

    /** Nome público da ordenação (o que o cliente enviou e foi aceito) ou null. */
    public function ordem()
    {
        return $this->ordem;
    }

    public function direcao()
    {
        return $this->direcao;
    }

    /** Coluna SQL da lista branca (nunca o texto da URL) ou null sem ordenação. */
    public function coluna()
    {
        if ($this->ordem === null) {
            return null;
        }
        $ordenaveis = $this->ordenaveis();
        return $ordenaveis[$this->ordem];
    }

    /** "c.nome ASC" — seguro para concatenar: coluna da lista branca e direção fixa. */
    public function sqlOrdem($desempate = null)
    {
        $partes = [];
        if ($this->coluna() !== null) {
            $partes[] = $this->coluna() . ' ' . strtoupper($this->direcao);
        }
        if ($desempate !== null && $desempate !== $this->coluna()) {
            $partes[] = $desempate . ' ' . strtoupper($this->direcao);
        }
        return implode(', ', $partes);
    }

    /** "LIMIT 20 OFFSET 40" (MySQL, PostgreSQL, SQLite). */
    public function sqlLimite()
    {
        return 'LIMIT ' . $this->porPagina . ' OFFSET ' . $this->offset();
    }

    // ---------- filtros: sempre com tipo e limites ----------

    /** Texto aparado e limitado (busca). Vazio → null. */
    public function texto($nome, $maximo = 100)
    {
        $v = self::escalar($this->query, $nome);
        if ($v === null) {
            return null;
        }
        $v = trim(preg_replace('/\s+/u', ' ', (string) $v));
        if ($v === '') {
            return null;
        }
        return function_exists('mb_substr') ? mb_substr($v, 0, $maximo, 'UTF-8') : substr($v, 0, $maximo);
    }

    /** Texto pronto para LIKE com os curingas % e _ escapados: "%" . $c->like('busca') . "%" (use ESCAPE '\\'). */
    public function like($nome, $maximo = 100)
    {
        $v = $this->texto($nome, $maximo);
        return $v === null ? null : addcslashes($v, '%_\\');
    }

    public function inteiro($nome, $min = null, $max = null)
    {
        $v = self::escalar($this->query, $nome);
        if ($v === null || !preg_match('/^-?\d{1,18}$/', trim((string) $v))) {
            return null;
        }
        $n = (int) $v;
        if (($min !== null && $n < $min) || ($max !== null && $n > $max)) {
            return null;
        }
        return $n;
    }

    /** Um valor entre as opções permitidas, ou null. */
    public function opcao($nome, array $permitidas)
    {
        $v = self::escalar($this->query, $nome);
        return ($v !== null && in_array((string) $v, array_map('strval', $permitidas), true)) ? (string) $v : null;
    }

    /** Vários valores (status[]=a&status[]=b) filtrados pelas opções permitidas; [] quando nenhum. */
    public function opcoes($nome, array $permitidas)
    {
        $v = isset($this->query[$nome]) ? $this->query[$nome] : [];
        $permitidas = array_map('strval', $permitidas);
        $lista = [];
        foreach (is_array($v) ? $v : [$v] as $item) {
            if (is_scalar($item) && in_array((string) $item, $permitidas, true) && !in_array((string) $item, $lista, true)) {
                $lista[] = (string) $item;
            }
        }
        return $lista;
    }

    /** Data Y-m-d válida (input type=date) ou null. */
    public function data($nome, $formato = 'Y-m-d')
    {
        $v = self::escalar($this->query, $nome);
        if ($v === null) {
            return null;
        }
        $d = \DateTimeImmutable::createFromFormat('!' . $formato, (string) $v);
        return ($d && $d->format($formato) === (string) $v) ? (string) $v : null;
    }

    /** "1", "true", "on", "sim" → true; "0", "false", "off", "nao" → false; ausente → null. */
    public function booleano($nome)
    {
        $v = strtolower((string) self::escalar($this->query, $nome));
        if (in_array($v, ['1', 'true', 'on', 'sim', 's', 'yes'], true)) {
            return true;
        }
        if (in_array($v, ['0', 'false', 'off', 'nao', 'não', 'n', 'no'], true)) {
            return false;
        }
        return null;
    }

    // ---------- resposta ----------

    /**
     * Formato Laravel API Resource, lido pelo x-lista sem configuração:
     * { data: [...], meta: { current_page, last_page, per_page, total, from, to } }
     */
    public function resposta(array $itens, $total)
    {
        $total = max(0, (int) $total);
        $itens = array_values($itens);
        $ultima = max(1, (int) ceil($total / $this->porPagina));
        return [
            'data' => $itens,
            'meta' => [
                'current_page' => $this->pagina,
                'last_page' => $ultima,
                'per_page' => $this->porPagina,
                'total' => $total,
                'from' => $itens ? $this->offset() + 1 : null,
                'to' => $itens ? $this->offset() + count($itens) : null,
            ],
        ];
    }

    /**
     * Sem COUNT(*) (tabelas enormes): busque porPagina() + 1 linhas (use limiteMaisUm())
     * e passe todas; a sobra indica que há próxima página.
     */
    public function respostaSemTotal(array $itensMaisUm)
    {
        $itensMaisUm = array_values($itensMaisUm);
        $temProxima = count($itensMaisUm) > $this->porPagina;
        return [
            'data' => array_slice($itensMaisUm, 0, $this->porPagina),
            'meta' => ['current_page' => $this->pagina, 'per_page' => $this->porPagina, 'next_page_url' => $temProxima ? '?page=' . ($this->pagina + 1) : null],
        ];
    }

    public function limiteMaisUm()
    {
        return $this->porPagina + 1;
    }

    /** Pagina um array já carregado (listas pequenas, dados de API externa). Ordenação e filtros ficam com você. */
    public function paginarArray(array $todos)
    {
        return $this->resposta(array_slice(array_values($todos), $this->offset(), $this->porPagina), count($todos));
    }

    /** Ordena um array de linhas pela ordenação aceita (comparação natural, sem diferenciar maiúsculas). */
    public function ordenarArray(array $linhas)
    {
        $coluna = $this->coluna();
        if ($coluna === null) {
            return array_values($linhas);
        }
        $sinal = $this->direcao === 'desc' ? -1 : 1;
        $indexadas = [];
        foreach (array_values($linhas) as $i => $linha) {
            $indexadas[] = [$i, $linha];
        }
        usort($indexadas, function ($a, $b) use ($coluna, $sinal) {
            $va = is_array($a[1]) ? (isset($a[1][$coluna]) ? $a[1][$coluna] : null) : (isset($a[1]->$coluna) ? $a[1]->$coluna : null);
            $vb = is_array($b[1]) ? (isset($b[1][$coluna]) ? $b[1][$coluna] : null) : (isset($b[1]->$coluna) ? $b[1]->$coluna : null);
            $c = strnatcasecmp((string) $va, (string) $vb);
            return $c !== 0 ? $c * $sinal : $a[0] - $b[0];   // estável
        });
        return array_map(function ($par) {
            return $par[1];
        }, $indexadas);
    }

    private function ordenaveis()
    {
        $mapa = [];
        foreach ($this->opcoes['ordenaveis'] as $chave => $coluna) {
            if (is_int($chave)) {
                $mapa[(string) $coluna] = (string) $coluna;
            } else {
                $mapa[(string) $chave] = (string) $coluna;
            }
        }
        foreach ($mapa as $coluna) {
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/', $coluna)) {
                throw new \InvalidArgumentException('Consulta: coluna de ordenação inválida "' . $coluna . '" (use letras, números, _ e no máximo um ponto).');
            }
        }
        return $mapa;
    }

    private static function escalar(array $query, $nome)
    {
        if (!isset($query[$nome]) || !is_scalar($query[$nome])) {
            return null;
        }
        return (string) $query[$nome];
    }

    private static function inteiroEntre($v, $min, $max, $padrao)
    {
        if ($v === null || !preg_match('/^\d{1,9}$/', trim($v))) {
            return $padrao;
        }
        return max($min, min($max, (int) $v));
    }
}

/**
 * CSRF por sessão para o AlpineForm (que envia X-CSRF-TOKEN a partir de <meta name="csrf-token">).
 * Em Joomla e Laravel use o mecanismo do framework (form.token / @csrf); isto é para PHP puro.
 *
 *   <meta name="csrf-token" content="<?= htmlspecialchars(Csrf::token()) ?>">
 *   if (!Csrf::valido()) Resposta::enviar(Resposta::erro('Sessão expirada. Recarregue a página.', 419));
 */
final class Csrf
{
    const CHAVE = '_alpineform_csrf';

    public static function token()
    {
        self::sessao();
        if (empty($_SESSION[self::CHAVE]) || !is_string($_SESSION[self::CHAVE])) {
            $_SESSION[self::CHAVE] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::CHAVE];
    }

    /** Confere o cabeçalho X-CSRF-TOKEN (ou o campo _token, para formulários sem JavaScript). */
    public static function valido($servidor = null, $post = null)
    {
        self::sessao();
        $servidor = $servidor === null ? $_SERVER : $servidor;
        $post = $post === null ? $_POST : $post;
        $esperado = isset($_SESSION[self::CHAVE]) && is_string($_SESSION[self::CHAVE]) ? $_SESSION[self::CHAVE] : '';
        $recebido = isset($servidor['HTTP_X_CSRF_TOKEN']) ? $servidor['HTTP_X_CSRF_TOKEN'] : (isset($post['_token']) ? $post['_token'] : '');
        return $esperado !== '' && is_string($recebido) && hash_equals($esperado, $recebido);
    }

    private static function sessao()
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            if (headers_sent()) {
                throw new \RuntimeException('Csrf: inicie a sessão (session_start) antes de enviar qualquer saída.');
            }
            session_start();
        }
    }
}
