<?php require __DIR__ . '/_layout.php';
layout_start('Importação ESM', 'Mesma biblioteca, carregada como módulo ES nativo do navegador (sem bundler): <code>import AlpineFormPlugin, { AlpineForm } from "/dist/alpine-form.esm.js"</code>. Veja <code>examples/esm-boot.js</code>.', ['esm' => true]);
?>
<form id="esm" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <div class="field">
        <label for="tel-esm">Celular</label>
        <input id="tel-esm" name="celular" data-form-mask="celular" data-form-v="required|telefone:celular">
    </div>
    <button type="submit">Enviar</button>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ phase: $form.phase, errors: $form.errors, enviado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li>Módulos opcionais em ESM recebem o núcleo pelo objeto passado a <code>AlpineForm.use()</code>; não há segunda cópia do registro.</li>
<li>Para bundlers: <code>import AlpineFormPlugin, { AlpineForm } from "alpine-form"</code> e <code>import masks from "alpine-form/masks"</code>.</li>
</ul>'); ?>
