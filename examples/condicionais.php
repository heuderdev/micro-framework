<?php require __DIR__ . '/_layout.php';
layout_start('Campos condicionais', 'Três políticas diferentes, escolhidas explicitamente: <code>required_if</code>, <code>data-form-hidden="skip"</code> (x-show) e remoção do DOM (x-if). Campos invisíveis NÃO são dispensados automaticamente.', ['masks' => true]);
?>
<form id="condicionais" x-data="{ entrega: 'retirada', motivo: '', temCupom: false }" x-form action="/api/demo/sucesso" method="post" novalidate>
    <fieldset>
        <legend>Entrega</legend>
        <label class="inline"><input type="radio" name="entrega" value="retirada" x-model="entrega"> Retirar na loja</label>
        <label class="inline"><input type="radio" name="entrega" value="casa" x-model="entrega"> Entregar em casa</label>
    </fieldset>

    <div x-show="entrega === 'casa'" data-form-hidden="skip">
        <p class="hint">Bloco com <code>x-show</code> + <code>data-form-hidden="skip"</code>: enquanto oculto, os campos não são validados (mas continuam no envio se não estiverem desabilitados).</p>
        <div class="row">
            <div class="field">
                <label for="cep">CEP</label>
                <input id="cep" name="cep" data-form-mask="cep" data-form-v="required|cep">
            </div>
            <div class="field">
                <label for="numero">Número</label>
                <input id="numero" name="numero" data-form-v="required|digits">
            </div>
        </div>
        <div class="field">
            <label for="complemento">Complemento</label>
            <input id="complemento" name="complemento" :disabled="entrega !== 'casa'" data-form-v="max:60">
            <small class="hint">Com <code>:disabled</code>: fora de validação E fora do envio enquanto oculto.</small>
        </div>
    </div>

    <div class="field">
        <label for="motivo">Como nos conheceu?</label>
        <select id="motivo" name="motivo" x-model="motivo" data-form-v="required">
            <option value="">Selecione</option>
            <option value="busca">Busca</option>
            <option value="indicacao">Indicação</option>
            <option value="outro">Outro</option>
        </select>
    </div>
    <div class="field">
        <label for="motivo_outro">Qual?</label>
        <input id="motivo_outro" name="motivo_outro" data-form-v="required_if:motivo,outro|max:80">
        <small class="hint">Sempre visível; obrigatório somente quando "Outro" está selecionado (dependência revalidada ao mudar o select).</small>
    </div>

    <label class="inline"><input type="checkbox" x-model="temCupom"> Tenho cupom</label>
    <template x-if="temCupom">
        <div class="field">
            <label for="cupom">Cupom</label>
            <input id="cupom" name="cupom" data-form-v="required|alphanumeric|length:8">
            <small class="hint">Criado/removido por <code>x-if</code>: ao sair do DOM, o campo é descadastrado (listeners, erros e estado limpos).</small>
        </div>
    </template>

    <div class="actions">
        <button type="submit">Enviar</button>
    </div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ phase: $form.phase, errors: $form.errors, campos: Object.keys($form.fields), enviado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li>Com "Retirar na loja", CEP e número estão ocultos e são ignorados na validação; o envio ainda inclui seus valores (vazios). O complemento, desabilitado, não é enviado.</li>
<li>O campo "Qual?" fica válido até "Outro" ser escolhido; ao trocar o select, o dependente já validado é revalidado.</li>
<li>Campos ocultos apenas por CSS seguem a mesma política: só são dispensados com <code>data-form-hidden="skip"</code> (no campo, em um ancestral ou no form).</li>
<li><code>input type="hidden"</code> não é validado, a menos que declare <code>data-form-v</code>; nesse caso o erro aparece no resumo.</li>
</ul>'); ?>
