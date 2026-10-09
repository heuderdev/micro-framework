<?php require __DIR__ . '/_layout.php';
layout_start('Cadastro com validação ao vivo', 'Regras, mensagens e máscaras declaradas nos próprios inputs. Nenhum campo é registrado em JavaScript.', ['masks' => true]);
?>
<form id="cadastro" x-data="{ tipo: 'pf' }" x-form action="/api/cadastro" method="post"
      data-form-validation="live" data-form-debounce="250" data-form-idempotency novalidate>

    <div class="field">
        <label for="nome">Nome</label>
        <input id="nome" name="nome" type="text" autocomplete="name"
               data-form-v="required|min:3|max:120"
               data-form-msg.required="Informe seu nome."
               data-form-msg.min="Digite pelo menos :min caracteres."
               data-form-msg.max="Digite no máximo :max caracteres.">
    </div>

    <div class="field">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="email" aria-describedby="email-dica"
               data-form-v="required|email"
               data-form-msg.email="Informe um e-mail válido."
               data-form-remote="/api/validar-email"
               data-form-remote-method="post"
               data-form-remote-debounce="500"
               data-form-msg.remote="Este e-mail já está cadastrado."
               data-form-msg.pending="Verificando...">
        <small id="email-dica" class="hint">Já cadastrados na demonstração: admin@exemplo.com, teste@exemplo.com.</small>
    </div>

    <div class="field">
        <label for="cpf">CPF</label>
        <input id="cpf" name="cpf" type="text" inputmode="numeric"
               data-form-mask="cpf"
               data-form-v="required|cpf"
               data-form-submit-value="raw"
               data-form-msg.cpf="Informe um CPF válido.">
    </div>

    <div class="row">
        <div class="field">
            <label for="senha">Senha</label>
            <input id="senha" name="senha" type="password" autocomplete="new-password"
                   data-form-v="required|min:8"
                   data-form-msg.min="A senha precisa de pelo menos :min caracteres.">
        </div>
        <div class="field">
            <label for="senha_confirmacao">Confirme a senha</label>
            <input id="senha_confirmacao" name="senha_confirmacao" type="password" autocomplete="new-password"
                   data-form-v="required|same:senha"
                   data-form-msg.same="As senhas não conferem.">
        </div>
    </div>

    <fieldset>
        <legend>Tipo de pessoa</legend>
        <label class="inline"><input type="radio" name="tipo" value="pf" x-model="tipo" data-form-v="required"> Física</label>
        <label class="inline"><input type="radio" name="tipo" value="pj" x-model="tipo"> Jurídica</label>
    </fieldset>

    <div class="field" x-show="tipo === 'pj'">
        <label for="cnpj">CNPJ</label>
        <input id="cnpj" name="cnpj" type="text"
               data-form-mask="cnpj"
               data-form-v="required_if:tipo,pj|cnpj"
               data-form-submit-value="raw">
        <small class="hint">Obrigatório apenas para pessoa jurídica (required_if). Aceita CNPJ alfanumérico.</small>
    </div>

    <div class="field">
        <label class="inline">
            <input type="checkbox" name="termos" value="1" data-form-v="accepted" data-form-label="os termos de uso">
            Li e aceito os termos de uso
        </label>
    </div>

    <div class="actions">
        <button type="submit" :disabled="$form.submitting">Cadastrar</button>
        <button type="reset">Limpar</button>
    </div>
    <p data-form-status class="hint"></p>
    <p class="ok" x-show="$form.success" x-text="$form.result && $form.result.message"></p>
    <?php state_panel(); ?>
</form>
<?php layout_end('<ul>
<li>Nenhum erro aparece antes da primeira interação; o campo é validado ao sair (blur) e revalidado durante a digitação depois disso.</li>
<li>O e-mail só é consultado no servidor depois que as regras locais passam. Digitar novamente cancela a consulta anterior; respostas antigas são descartadas.</li>
<li>O CPF é exibido formatado e enviado sem máscara (<code>data-form-submit-value="raw"</code>).</li>
<li>A confirmação de senha é revalidada automaticamente quando a senha muda (dependência registrada pela regra <code>same:senha</code>).</li>
<li><code>data-form-idempotency</code> envia <code>Idempotency-Key</code>; o backend de referência devolve a mesma resposta para reenvios idênticos. O POST nunca é repetido automaticamente.</li>
<li>Digite o nome <code>erro geral</code> para ver um erro geral (sem campo) no resumo.</li>
<li>A validação do servidor continua obrigatória: o backend refaz as verificações.</li>
</ul>'); ?>
