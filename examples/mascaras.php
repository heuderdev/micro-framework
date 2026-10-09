<?php require __DIR__ . '/_layout.php';
layout_start('Máscaras', 'Máscara formata a digitação; validação decide se o valor é aceitável. Cada campo separa valor exibido, bruto (raw), formatado e canônico, e escolhe qual representação vai para a validação e para o envio.', ['masks' => true]);
?>
<form id="mascaras" x-data x-form action="/api/pagamento" method="post" data-form-encoding="json" novalidate>
    <div class="row">
        <div class="field">
            <label for="documento">CPF ou CNPJ</label>
            <input id="documento" name="documento" data-form-mask="cpf_cnpj" data-form-v="required|cpf_cnpj" data-form-submit-value="raw">
        </div>
        <div class="field">
            <label for="telefone">Telefone</label>
            <input id="telefone" name="telefone" type="tel" data-form-mask="telefone_br" data-form-v="required|telefone" data-form-submit-value="raw">
        </div>
        <div class="field">
            <label for="cep-m">CEP</label>
            <input id="cep-m" name="cep" value="01310100" data-form-mask="cep" data-form-mask-placeholder="_" data-form-v="cep">
        </div>
    </div>
    <div class="row">
        <div class="field">
            <label for="valor">Valor</label>
            <input id="valor" name="valor" type="text" inputmode="decimal"
                   data-form-mask="currency" data-form-mask-locale="pt-BR" data-form-mask-currency="BRL" data-form-mask-scale="2"
                   data-form-v="required|numeric|min_value:0.01"
                   data-form-mask-validation-value="canonical" data-form-submit-value="canonical">
        </div>
        <div class="field">
            <label for="percentual">Desconto (%)</label>
            <input id="percentual" name="percentual" data-form-mask="percent" data-form-mask-scale="1" data-form-v="numeric|max_value:100">
        </div>
        <div class="field">
            <label for="data-m">Data</label>
            <input id="data-m" name="data" data-form-mask="date" data-form-v="date|after_or_equal:today" data-form-msg.after_or_equal="A data não pode estar no passado.">
        </div>
    </div>
    <div class="field">
        <label for="codigo">Código (AAA-9999)</label>
        <input id="codigo" name="codigo" data-form-mask="pattern" data-form-mask-pattern="AAA-9999" data-form-mask-case="upper"
               data-form-v="required|pattern" data-form-pattern="^[A-Z]{3}-[0-9]{4}$">
    </div>

    <div class="actions">
        <button type="submit">Enviar</button>
        <button type="reset">Resetar</button>
        <button type="button" @click="$form.setValue('valor', '1234.5', { as: 'canonical' })">setValue(valor, "1234.5", canonical)</button>
        <button type="button" @click="$form.setValue('documento', '12ABC34501DE35', { as: 'raw' })">setValue(documento, CNPJ alfanumérico)</button>
    </div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ raw: { documento: $form.fields.documento && $form.getValue(\'documento\', { as: \'raw\' }), valor: $form.fields.valor && $form.getValue(\'valor\', { as: \'raw\' }) }, canonical: { valor: $form.fields.valor && $form.getValue(\'valor\', { as: \'canonical\' }), data: $form.fields.data && $form.getValue(\'data\', { as: \'canonical\' }) }, exibido: $form.fields.valor && $form.fields.valor.value, dirty: $form.dirty, errors: $form.errors, servidor_recebeu: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li>Moeda: exibido <code>R$ 1.234,50</code>, raw <code>123450</code> (apenas dígitos, não é número), canônico <code>"1234.50"</code> (string decimal; nunca convertido para Number).</li>
<li>Colar <code>(11) 98765-4321</code> ou <code>11987654321</code> produz o mesmo valor; colar <code>1234.56</code> no campo de valor é interpretado como decimal canônico.</li>
<li>Edição no meio, seleção, Backspace/Delete ao lado de separadores e IME preservam o cursor nos casos suportados. Desfazer (Ctrl+Z) usa a pilha do navegador e pode pular estados intermediários.</li>
<li>O CEP inicial vindo do servidor (<code>01310100</code>) é formatado sem marcar o formulário como alterado (dirty).</li>
<li>O reset restaura o valor do servidor e a apresentação; nenhum input hidden duplicado é criado: o valor enviado é calculado na serialização.</li>
</ul>'); ?>
