<?php require __DIR__ . '/_layout.php';
layout_start('Rascunho automático', 'Módulo opcional <code>alpine-form-rascunho</code>: o que a pessoa digita fica guardado no navegador e volta ao reabrir a página. Preencha, recarregue (F5) e veja os campos voltarem. Senhas, campos sensíveis e arquivos nunca são guardados.', ['masks' => true, 'rascunho' => true]);
?>
<form id="rascunho-cadastro" x-data="{ restaurado: false, quando: '' }" x-form action="/api/cadastro" method="post"
      data-form-rascunho="3"
      @form:rascunho-restaurado="restaurado = true; quando = new Date($event.detail.salvoEm).toLocaleString('pt-BR')"
      @form:rascunho-apagado="restaurado = false" novalidate>

    <p class="ok" x-show="restaurado" role="status">
        Recuperamos o que você tinha preenchido em <span x-text="quando"></span>.
        <button type="button" @click="$form.reset()">Começar do zero</button>
    </p>

    <div class="field">
        <label for="r-nome">Nome</label>
        <input id="r-nome" name="nome" data-form-v="required|min:3">
    </div>
    <div class="field">
        <label for="r-email">E-mail</label>
        <input id="r-email" name="email" type="email" data-form-v="required|email">
    </div>
    <div class="field">
        <label for="r-cpf">CPF</label>
        <input id="r-cpf" name="cpf" data-form-mask="cpf" data-form-v="required|cpf" data-form-submit-value="raw">
    </div>
    <div class="row">
        <div class="field">
            <label for="r-senha">Senha (nunca é guardada)</label>
            <input id="r-senha" name="senha" type="password" autocomplete="new-password" data-form-v="required|min:8">
        </div>
        <div class="field">
            <label for="r-senha2">Confirme a senha</label>
            <input id="r-senha2" name="senha_confirmacao" type="password" autocomplete="new-password" data-form-v="required|same:senha">
        </div>
    </div>
    <fieldset>
        <legend>Como prefere ser contatado?</legend>
        <label class="inline"><input type="radio" name="contato" value="email" data-form-v="required"> E-mail</label>
        <label class="inline"><input type="radio" name="contato" value="telefone"> Telefone</label>
    </fieldset>
    <div class="field">
        <label for="r-obs">Observação interna (marcada para não guardar)</label>
        <input id="r-obs" name="observacao" data-form-rascunho-ignorar>
    </div>
    <label class="inline"><input type="checkbox" name="termos" value="1" data-form-v="accepted" data-form-label="os termos"> Aceito os termos</label>

    <div class="actions">
        <button type="submit" x-bind:disabled="$form.submitting">Cadastrar</button>
        <button type="reset">Limpar (apaga o rascunho)</button>
    </div>
    <p data-form-status class="hint"></p>
</form>
<?php layout_end('<ul>
<li>O rascunho é gravado 400 ms depois que a digitação para, no <code>localStorage</code>, com a chave <code>alpineform:rascunho:rascunho-cadastro</code>, e vale por 3 dias (<code>data-form-rascunho="3"</code>).</li>
<li>Envio com sucesso ou "Limpar" apagam o rascunho. Envio com erro mantém.</li>
<li>Com <code>data-form-rascunho-sessao</code>, o rascunho vai para o <code>sessionStorage</code> e some ao fechar a aba.</li>
<li><code>AlpineForm.configure({ storage: "none" })</code> ou <code>data-form-storage="none"</code> desligam o rascunho por completo.</li>
<li>Em páginas com dados pessoais ou financeiros, prefira não usar (ou use a sessão e ignore os campos identificadores): qualquer script da página e qualquer pessoa no mesmo computador podem ler o armazenamento local.</li>
</ul>'); ?>
