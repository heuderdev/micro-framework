<?php require __DIR__ . '/_layout.php';
layout_start('Adaptador Bootstrap 5', 'Mesmo HTML declarativo; apenas <code>data-form-ui="bootstrap"</code> muda as classes (<code>is-invalid</code>, <code>invalid-feedback</code>, <code>alert</code>) e o posicionamento das mensagens. O CSS do Bootstrap vem de <code>node_modules/bootstrap</code> (instalado como dependência de desenvolvimento).', ['bootstrap' => true, 'masks' => true]);
?>
<form id="bs" class="card card-body" x-data x-form action="/api/cadastro" method="post" data-form-ui="bootstrap" data-form-show-valid novalidate>
    <div class="mb-3">
        <label class="form-label" for="bs-nome">Nome</label>
        <input class="form-control" id="bs-nome" name="nome" data-form-v="required|min:3">
    </div>
    <div class="mb-3">
        <label class="form-label" for="bs-email">E-mail</label>
        <div class="input-group">
            <span class="input-group-text">@</span>
            <input class="form-control" id="bs-email" name="email" type="email" data-form-v="required|email">
        </div>
    </div>
    <div class="form-floating mb-3">
        <input class="form-control" id="bs-cpf" name="cpf" placeholder="CPF" data-form-mask="cpf" data-form-v="required|cpf">
        <label for="bs-cpf">CPF (form-floating)</label>
    </div>
    <fieldset class="mb-3">
        <legend class="col-form-label">Contato preferido</legend>
        <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="contato" id="bs-c1" value="email" data-form-v="required">
            <label class="form-check-label" for="bs-c1">E-mail</label>
        </div>
        <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="contato" id="bs-c2" value="telefone">
            <label class="form-check-label" for="bs-c2">Telefone</label>
        </div>
    </fieldset>
    <div class="form-check mb-3">
        <input class="form-check-input" type="checkbox" id="bs-termos" name="termos" value="1" data-form-v="accepted" data-form-label="os termos">
        <label class="form-check-label" for="bs-termos">Aceito os termos</label>
    </div>
    <div>
        <button class="btn btn-primary" type="submit">Enviar</button>
    </div>
    <div class="mt-3" data-form-progress>
        <div class="progress" role="presentation"><div class="progress-bar" data-form-progress-bar></div></div>
        <p class="small mt-1 mb-0" data-form-status></p>
    </div>
</form>
<?php layout_end('<p>Com <code>data-form-show-valid</code>, campos validados e corretos recebem <code>is-valid</code>. Campos ainda não validados nunca aparecem como aprovados.</p>'); ?>
