<?php
/**
 * Testes dos helpers PHP (sem dependências). Rode com qualquer PHP 7.0+:
 *   php php/tests/run.php
 */

require dirname(__DIR__) . '/alpine-form.php';

use AlpineForm\Helpers\Consulta;
use AlpineForm\Helpers\Entrada;
use AlpineForm\Helpers\Resposta;
use AlpineForm\Helpers\Validador;

$testes = [];
$falhas = 0;

function teste($nome, $fn)
{
    $GLOBALS['testes'][] = [$nome, $fn];
}

function igual($esperado, $obtido, $msg = '')
{
    if ($esperado !== $obtido) {
        throw new RuntimeException(($msg ? $msg . ': ' : '') . 'esperado ' . var_export($esperado, true) . ', obtido ' . var_export($obtido, true));
    }
}

function lanca($classe, $fn)
{
    try {
        $fn();
    } catch (Exception $e) {
        if ($e instanceof $classe) {
            return $e;
        }
        throw $e;
    }
    throw new RuntimeException('Esperava ' . $classe);
}

// ---------- Resposta ----------

teste('Resposta: sucesso, inválido (422, mensagens em lista), erro e aceito', function () {
    igual([200, ['success' => true, 'message' => 'Salvo.', 'data' => ['id' => 7]]], Resposta::sucesso(['id' => 7], 'Salvo.'));
    list($status, $corpo) = Resposta::invalido(['nome' => 'Obrigatório.', 'itens.0.qtd' => ['A', ''], 'vazio' => []]);
    igual(422, $status);
    igual(['nome' => ['Obrigatório.'], 'itens.0.qtd' => ['A']], (array) $corpo['errors']);
    igual('{"success":false,"message":"Confira os campos destacados.","errors":{}}', Resposta::json(Resposta::invalido([])[1]), 'errors vazio vira objeto');
    igual([403, ['success' => false, 'message' => 'Sem permissão.']], Resposta::erro('Sem permissão.', 403));
    list($s, $c) = Resposta::aceito('j1', '/jobs/j1', '/jobs/j1/cancelar');
    igual(202, $s);
    igual(['id' => 'j1', 'status_url' => '/jobs/j1', 'cancel_url' => '/jobs/j1/cancelar'], $c['job']);
});

teste('Resposta::json mantém acentos e não devolve vazio com UTF-8 inválido', function () {
    igual('{"m":"Ação/ok"}', Resposta::json(['m' => 'Ação/ok']));
    $json = Resposta::json(['m' => "a\xB1b"]);
    igual(true, is_string($json) && strlen($json) > 0);
});

teste('Resposta::enviar escreve o JSON (sem exit em teste)', function () {
    Resposta::$semExit = true;
    ob_start();
    Resposta::enviar(Resposta::sucesso(null, 'ok'));
    igual('{"success":true,"message":"ok","data":null}', ob_get_clean());
});

// ---------- Entrada ----------

teste('Entrada: JSON, POST, GET e caminhos com colchetes ou ponto', function () {
    $e = Entrada::ler('{"cliente":{"nome":" Ana "},"itens":[{"qtd":"2"}]}', ['REQUEST_METHOD' => 'POST', 'CONTENT_TYPE' => 'application/json; charset=utf-8']);
    igual('Ana', $e->texto('cliente[nome]'));
    igual('Ana', $e->texto('cliente.nome'));
    igual('2', $e->get('itens.0.qtd'));
    igual(null, $e->get('itens.5.qtd'));
    $p = Entrada::ler(null, ['REQUEST_METHOD' => 'POST', 'CONTENT_TYPE' => 'multipart/form-data; boundary=x'], ['cpf' => '123.456.789-09', 'tags' => ['a', ['x'], 'b']]);
    igual('12345678909', $p->digitos('cpf'));
    igual(['a', 'b'], $p->lista('tags'));
    igual(['x'], (new Entrada(['t' => 'x']))->lista('t'));
    $g = Entrada::ler(null, ['REQUEST_METHOD' => 'GET'], null, ['busca' => 'ana']);
    igual('ana', $g->texto('busca'));
    igual([], Entrada::ler('não é json', ['REQUEST_METHOD' => 'POST', 'CONTENT_TYPE' => 'application/json'])->todos());
});

// ---------- Validador ----------

teste('Validador: obrigatório, tamanho em caracteres, e-mail, primeiro erro por campo', function () {
    $v = new Validador(['nome' => 'Jô', 'email' => 'x', 'vazio' => '  ', 'lista' => []]);
    $v->obrigatorio('nome')->tamanho('nome', 3, 80)->obrigatorio('vazio')->obrigatorio('lista')
      ->obrigatorio('email')->email('email')->tamanho('email', 5);
    igual([
        'nome' => ['Use pelo menos 3 caracteres.'],
        'vazio' => ['Preencha este campo.'],
        'lista' => ['Preencha este campo.'],
        'email' => ['Informe um e-mail válido.'],
    ], $v->erros());
    $ok = new Validador(['nome' => 'José']);
    $ok->tamanho('nome', 4, 4)->email('opcional');
    igual(false, $ok->falhou(), 'José tem 4 caracteres; campo ausente é opcional');
});

teste('Validador: CPF, CNPJ, CPF ou CNPJ, CEP, telefone', function () {
    igual(true, Validador::cpfValido('529.982.247-25'));
    igual(false, Validador::cpfValido('111.111.111-11'));
    igual(false, Validador::cpfValido('529.982.247-24'));
    igual(true, Validador::cnpjValido('11.222.333/0001-81'));
    igual(false, Validador::cnpjValido('11.222.333/0001-80'));
    $v = new Validador(['a' => '52998224725', 'b' => '11222333000181', 'c' => '123', 'cep' => '01001-000', 'cep2' => '0100', 'tel' => '(11) 98765-4321', 'tel2' => '(11) 1234-5678']);
    $v->cpfOuCnpj('a')->cpfOuCnpj('b')->cpfOuCnpj('c')->cep('cep')->cep('cep2')->telefone('tel')->telefone('tel2');
    igual(['c', 'cep2', 'tel2'], array_keys($v->erros()));
});

teste('Validador: inteiro e decimal com limites exatos (sem float)', function () {
    $v = new Validador(['q' => '5', 'q2' => '5.5', 'v' => '0.10', 'v2' => '10.999', 'v3' => '1000000000000000.01', 'v4' => '-3']);
    $v->inteiro('q', 1, 5)->inteiro('q2')->decimal('v', 2, '0.1')->decimal('v2')->decimal('v3', 2, null, '1000000000000000.00')->decimal('v4', 2, '0');
    igual([
        'q2' => ['Informe um número inteiro.'],
        'v2' => ['Informe um número com até 2 casas decimais.'],
        'v3' => ['O valor máximo é 1000000000000000.00.'],
        'v4' => ['O valor mínimo é 0.'],
    ], $v->erros());
    igual(0, Validador::compararDecimal('1.50', '1.5'));
    igual(-1, Validador::compararDecimal('-2', '1'));
    igual(1, Validador::compararDecimal('-1.1', '-1.2'));
    igual(1, Validador::compararDecimal('10', '9.99'));
    igual(0, Validador::compararDecimal('-0', '0.00'));
});

teste('Validador: em (inclusive listas), data com limites, igual, regex, url', function () {
    $v = new Validador([
        'uf' => 'SP', 'uf2' => 'XX', 'tags' => ['a', 'z'],
        'd' => '2024-02-30', 'd2' => '2024-02-29', 'd3' => '2020-01-01', 'br' => '31/12/2024',
        'senha' => 'abc', 'confirma' => 'abd', 'placa' => 'ABC1D23', 'site' => 'javascript:alert(1)', 'site2' => 'https://exemplo.com',
    ]);
    $v->em('uf', ['SP', 'RJ'])->em('uf2', ['SP'])->em('tags', ['a', 'b'])
      ->data('d')->data('d2')->data('d3', 'Y-m-d', '2021-01-01')->data('br', 'd/m/Y', null, '01/01/2024')
      ->igual('confirma', 'senha')->regex('placa', '/^[A-Z]{3}\d[A-Z0-9]\d{2}$/')->url('site')->url('site2');
    igual([
        'uf2' => ['Escolha uma opção válida.'],
        'tags' => ['Escolha uma opção válida.'],
        'd' => ['Informe uma data válida.'],
        'd3' => ['A data deve ser a partir de 01/01/2021.'],
        'br' => ['A data deve ser até 01/01/2024.'],
        'confirma' => ['Os valores não conferem.'],
        'site' => ['Informe um endereço válido (https://…).'],
    ], $v->erros());
});

teste('Validador: chaves com colchetes viram ponto; cadaItem; mensagem própria e erro manual', function () {
    $v = new Validador(['jform' => ['nome' => ''], 'itens' => [['produto' => 'A', 'qtd' => '0'], ['produto' => '', 'qtd' => '2']]]);
    $v->obrigatorio('jform[nome]', 'Informe o nome.')
      ->cadaItem('itens', function (Validador $item, $i) {
          $item->obrigatorio('produto')->inteiro('qtd', 1);
      })
      ->erro('email', 'E-mail já cadastrado.');
    igual([
        'jform.nome' => ['Informe o nome.'],
        'itens.0.qtd' => ['O valor mínimo é 1.'],
        'itens.1.produto' => ['Preencha este campo.'],
        'email' => ['E-mail já cadastrado.'],
    ], $v->erros());
});

// ---------- Consulta ----------

teste('Consulta: padrões, limites e lista branca de ordenação', function () {
    $c = Consulta::ler([], ['ordenaveis' => ['nome', 'criado' => 'c.created_at'], 'ordem' => 'nome']);
    igual([1, 20, 0, 'nome', 'asc', 'nome'], [$c->pagina(), $c->porPagina(), $c->offset(), $c->ordem(), $c->direcao(), $c->coluna()]);
    $c = Consulta::ler(['page' => '3', 'per_page' => '5000', 'sort' => 'criado', 'direction' => 'DESC'], ['ordenaveis' => ['nome', 'criado' => 'c.created_at']]);
    igual([3, 100, 200, 'c.created_at DESC', 'LIMIT 100 OFFSET 200'], [$c->pagina(), $c->porPagina(), $c->offset(), $c->sqlOrdem(), $c->sqlLimite()]);
    igual('c.created_at DESC, c.id DESC', $c->sqlOrdem('c.id'));
    $ataque = Consulta::ler(['page' => '-1', 'per_page' => '0', 'sort' => 'nome; DROP TABLE x', 'direction' => 'asc;--', 'x' => ['y']], ['ordenaveis' => ['nome'], 'direcao' => 'desc']);
    igual([1, 1, null, 'desc', ''], [$ataque->pagina(), $ataque->porPagina(), $ataque->ordem(), $ataque->direcao(), $ataque->sqlOrdem()]);
    igual(10000, Consulta::ler(['page' => '999999999'])->pagina());
    igual(1, Consulta::ler(['page' => ['2']])->pagina(), 'array no parâmetro é ignorado');
});

teste('Consulta: configuração errada gera exceção (nada ignorado em silêncio)', function () {
    lanca('InvalidArgumentException', function () {
        Consulta::ler([], ['ordenaveis' => ['nome'], 'ordem' => 'email']);
    });
    lanca('InvalidArgumentException', function () {
        Consulta::ler([], ['porPagina' => 10]);
    });
    lanca('InvalidArgumentException', function () {
        Consulta::ler([], ['ordenaveis' => ['nome' => 'nome; drop']]);
    });
});

teste('Consulta: nomes de parâmetros personalizados', function () {
    $c = Consulta::ler(['pag' => '2', 'tamanho' => '10', 'ordenar_por' => 'uf', 'sentido' => 'desc'], [
        'ordenaveis' => ['uf'], 'param_pagina' => 'pag', 'param_por_pagina' => 'tamanho', 'param_ordem' => 'ordenar_por', 'param_direcao' => 'sentido',
    ]);
    igual([2, 10, 'uf', 'desc'], [$c->pagina(), $c->porPagina(), $c->ordem(), $c->direcao()]);
});

teste('Consulta: filtros tipados (texto, like, inteiro, opção, opções, data, booleano)', function () {
    $c = Consulta::ler([
        'busca' => "  ana   maria \n", 'termo' => '50%_off', 'vazio' => '   ', 'id' => '42', 'id2' => '4x', 'uf' => 'SP', 'uf2' => 'ZZ',
        'status' => ['ativo', 'hacker', 'ativo', 'pendente'], 'de' => '2024-01-31', 'ate' => '2024-13-01', 'ativo' => 'sim', 'arr' => ['x'],
    ]);
    igual('ana maria', $c->texto('busca'));
    igual('ana', $c->texto('busca', 3));
    igual(null, $c->texto('vazio'));
    igual(null, $c->texto('arr'));
    igual('50\\%\\_off', $c->like('termo'));
    igual([42, null, null], [$c->inteiro('id'), $c->inteiro('id2'), $c->inteiro('id', 1, 10)]);
    igual(['SP', null], [$c->opcao('uf', ['SP', 'RJ']), $c->opcao('uf2', ['SP'])]);
    igual(['ativo', 'pendente'], $c->opcoes('status', ['ativo', 'inativo', 'pendente']));
    igual([], $c->opcoes('nada', ['a']));
    igual(['2024-01-31', null], [$c->data('de'), $c->data('ate')]);
    igual([true, null], [$c->booleano('ativo'), $c->booleano('nada')]);
});

teste('Consulta: resposta no formato lido pelo x-lista (com e sem total)', function () {
    $c = Consulta::ler(['page' => '2', 'per_page' => '2']);
    igual([
        'data' => [['id' => 3], ['id' => 4]],
        'meta' => ['current_page' => 2, 'last_page' => 3, 'per_page' => 2, 'total' => 5, 'from' => 3, 'to' => 4],
    ], $c->resposta([['id' => 3], ['id' => 4]], 5));
    igual(['current_page' => 1, 'last_page' => 1, 'per_page' => 20, 'total' => 0, 'from' => null, 'to' => null], Consulta::ler([])->resposta([], 0)['meta']);
    igual(3, $c->limiteMaisUm());
    $r = $c->respostaSemTotal([['id' => 3], ['id' => 4], ['id' => 5]]);
    igual([2, '?page=3'], [count($r['data']), $r['meta']['next_page_url']]);
    igual(null, $c->respostaSemTotal([['id' => 3]])['meta']['next_page_url']);
});

teste('Consulta: ordenar e paginar arrays (estável, natural, sem diferenciar maiúsculas)', function () {
    $linhas = [['n' => 'item 10', 'k' => 1], ['n' => 'Item 2', 'k' => 2], ['n' => 'item 2', 'k' => 3], ['n' => 'abc', 'k' => 4]];
    $c = Consulta::ler(['sort' => 'n', 'per_page' => '3', 'page' => '1'], ['ordenaveis' => ['n']]);
    $ordenadas = $c->ordenarArray($linhas);
    igual([4, 2, 3, 1], array_column($ordenadas, 'k'));
    $p = $c->paginarArray($ordenadas);
    igual([3, 4, 2], [count($p['data']), $p['meta']['total'], $p['meta']['last_page']]);
    $desc = Consulta::ler(['sort' => 'n', 'direction' => 'desc'], ['ordenaveis' => ['n']]);
    igual([1, 2, 3, 4], array_column($desc->ordenarArray($linhas), 'k'));
    $obj = array_map(function ($l) {
        return (object) $l;
    }, $linhas);
    igual(4, $c->ordenarArray($obj)[0]->k);
});

$inicio = microtime(true);
foreach ($testes as $t) {
    try {
        $t[1]();
        echo "  ✓ {$t[0]}\n";
    } catch (Throwable $e) {
        $falhas++;
        echo "  ✗ {$t[0]}\n      " . get_class($e) . ': ' . $e->getMessage() . "\n";
    }
}
$total = count($testes);
echo "\n" . ($total - $falhas) . "/{$total} testes dos helpers PHP passaram em " . round(microtime(true) - $inicio, 2) . 's (PHP ' . PHP_VERSION . ")\n";
exit($falhas ? 1 : 0);
