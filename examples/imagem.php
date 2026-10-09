<?php require __DIR__ . '/_layout.php';
layout_start('Imagem e preview', 'Regras de imagem decodificam o arquivo no navegador (createImageBitmap) para ler largura e altura. Formatos que o navegador não decodifica geram erro explícito.');
?>
<form id="imagem" x-data x-form action="/api/upload" method="post" enctype="multipart/form-data" novalidate>
    <div class="field">
        <label for="foto">Foto de perfil (JPG/PNG/WebP, mínimo 200×200, quadrada, até 5 MB)</label>
        <input id="foto" name="foto" type="file" accept="image/png,image/jpeg,image/webp"
               data-form-v="required|image|file_max:5MB|width_min:200|height_min:200|aspect_ratio:1/1,0.02"
               data-form-msg.aspect_ratio="A foto precisa ser quadrada (1:1).">
    </div>
    <div data-form-file-list="foto"></div>
    <div class="actions"><button type="submit">Enviar foto</button></div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ phase: $form.phase, validando: $form.validating, arquivos: $form.fields.foto && $form.fields.foto.files, errors: $form.errors, servidor: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li>O preview é um <code>&lt;img&gt;</code> com object URL; SVG não recebe preview (conteúdo ativo). URLs são revogadas ao remover/limpar.</li>
<li>Imagens acima de 50 MB não são decodificadas no navegador (limite de memória); a regra falha com mensagem própria.</li>
<li>As dimensões são confirmadas também no servidor (<code>getimagesize</code>). Validar no navegador não torna a imagem segura.</li>
</ul>'); ?>
