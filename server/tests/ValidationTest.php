<?php

declare(strict_types=1);

use AlpineForm\Server\Fs;
use AlpineForm\Server\UploadInspector;
use AlpineForm\Server\Validator;

test('validador: CPF e CNPJ (inclusive alfanumérico)', function () {
    assert_true(Validator::isCpf('529.982.247-25'));
    assert_true(Validator::isCpf('52998224725'));
    assert_true(!Validator::isCpf('111.111.111-11'));
    assert_true(!Validator::isCpf('529.982.247-26'));
    assert_true(Validator::isCnpj('11.222.333/0001-81'));
    assert_true(Validator::isCnpj('12.ABC.345/01DE-35'));
    assert_true(Validator::isCnpj('12abc34501de35'));
    assert_true(!Validator::isCnpj('12.ABC.345/01DE-36'));
    assert_true(!Validator::isCnpj('00.000.000/0000-00'));
});

test('validador: comparação decimal sem ponto flutuante', function () {
    assert_same(-1, Validator::compareDecimal('0.009', '0.01'));
    assert_same(0, Validator::compareDecimal('1.10', '1.1'));
    assert_same(1, Validator::compareDecimal('10', '9.99'));
});

test('validador: required, comprimento por code point e same', function () {
    $v = new Validator(['nome' => '  ', 'apelido' => '😀😀', 'senha' => 'a', 'conf' => 'b']);
    $v->required('nome', 'obrigatório');
    $v->length('apelido', 3, 10, 'curto');
    $v->same('conf', 'senha', 'diferente');
    assert_same(['nome' => ['obrigatório'], 'apelido' => ['curto'], 'conf' => ['diferente']], $v->errors());
});

test('upload: normalização de $_FILES múltiplo ignora vazios', function () {
    $files = UploadInspector::normalize([
        'name' => ['a.pdf', ''],
        'type' => ['application/pdf', ''],
        'tmp_name' => ['/tmp/a', ''],
        'error' => [UPLOAD_ERR_OK, UPLOAD_ERR_NO_FILE],
        'size' => [10, 0],
    ]);
    assert_same(1, count($files));
    assert_same('a.pdf', $files[0]['name']);
});

test('upload: inspeção pelo conteúdo rejeita extensão mentirosa e aceita PNG real', function () {
    $dir = temp_storage();
    $inspector = new UploadInspector(alpineform_config()['upload']['allowed'], 1024 * 1024);
    file_put_contents($dir . '/fake.png', '<html><script>alert(1)</script></html>');
    $fake = $inspector->inspect(['name' => 'foto.png', 'tmp_name' => $dir . '/fake.png', 'error' => UPLOAD_ERR_OK, 'size' => 10], false);
    assert_same(false, $fake['ok']);
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    file_put_contents($dir . '/ok.png', $png);
    $ok = $inspector->inspect(['name' => 'ok.png', 'tmp_name' => $dir . '/ok.png', 'error' => UPLOAD_ERR_OK, 'size' => strlen($png)], false);
    assert_same(true, $ok['ok']);
    assert_same(1, $ok['width']);
    $svg = $inspector->inspect(['name' => 'x.svg', 'tmp_name' => $dir . '/ok.png', 'error' => UPLOAD_ERR_OK, 'size' => 1], false);
    assert_same(false, $svg['ok']);
    $partial = $inspector->inspect(['name' => 'x.pdf', 'tmp_name' => '', 'error' => UPLOAD_ERR_PARTIAL, 'size' => 0], false);
    assert_same('O upload foi interrompido antes de terminar.', $partial['error']);
});

test('nomes de arquivo: caminho e caracteres de controle removidos', function () {
    assert_same('passwd', Fs::displayName('../../etc/passwd'));
    assert_same('arquivo', Fs::displayName('..'));
    assert_same('ab.pdf', Fs::displayName("a\x00b.pdf"));
    assert_same('', Fs::extension('arquivo.ex$e'));
    assert_same('pdf', Fs::extension('A.PDF'));
});
