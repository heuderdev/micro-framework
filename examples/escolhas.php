<?php require __DIR__ . '/_layout.php';
layout_start('Radios, checkboxes e select múltiplo', 'Grupos são tratados como um único campo: o valor de um grupo de checkbox é uma lista; o de um radio é o valor marcado ou null.');
?>
<form id="escolhas" x-data x-form action="/api/preferencias" method="post" data-form-encoding="json" novalidate>
    <fieldset>
        <legend>Plano</legend>
        <label class="inline"><input type="radio" name="plano" value="basico" data-form-v="required" data-form-msg.required="Escolha um plano."> Básico</label>
        <label class="inline"><input type="radio" name="plano" value="pro"> Pro</label>
        <label class="inline"><input type="radio" name="plano" value="empresa"> Empresa</label>
    </fieldset>

    <fieldset>
        <legend>Interesses</legend>
        <label class="inline"><input type="checkbox" name="interesses[]" value="php" data-form-v="required|min:2|max:3"> PHP</label>
        <label class="inline"><input type="checkbox" name="interesses[]" value="js"> JavaScript</label>
        <label class="inline"><input type="checkbox" name="interesses[]" value="devops"> DevOps</label>
        <label class="inline"><input type="checkbox" name="interesses[]" value="dados"> Dados</label>
    </fieldset>

    <div class="field">
        <label for="estados">Estados atendidos (Ctrl/Cmd para vários)</label>
        <select id="estados" name="estados[]" multiple size="5" data-form-v="required|max:3">
            <option value="SP">São Paulo</option>
            <option value="RJ">Rio de Janeiro</option>
            <option value="MG">Minas Gerais</option>
            <option value="RS">Rio Grande do Sul</option>
            <option value="BA">Bahia</option>
        </select>
    </div>

    <div class="field">
        <label class="inline">
            <input type="checkbox" name="newsletter" value="1" data-form-unchecked-value="0"> Receber novidades
        </label>
        <small class="hint">Checkbox desmarcado não é enviado pelo HTML; com <code>data-form-unchecked-value="0"</code> o valor 0 é enviado.</small>
    </div>

    <div class="actions"><button type="submit">Salvar</button></div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ valores: $form.getValues(), errors: $form.errors, enviado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li><code>required</code> em grupo exige ao menos uma opção; <code>min</code>/<code>max</code> em grupos e selects múltiplos contam itens selecionados.</li>
<li>O envio usa JSON (<code>data-form-encoding="json"</code>): <code>interesses[]</code> vira lista e nenhum valor repetido é perdido.</li>
<li>Selects, radios e checkboxes são validados no evento change (modo live).</li>
</ul>'); ?>
