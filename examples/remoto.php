<?php require __DIR__ . '/_layout.php';
layout_start('Validação remota', 'Executada somente após as regras locais. Respostas obsoletas são descartadas; abortos não viram erro; falhas de rede geram resultado inconclusivo.');
?>
<form id="remoto" x-data x-form action="/api/demo/sucesso" method="post" novalidate>
    <input type="hidden" name="id" value="7">
    <div class="field">
        <label for="email-edicao">E-mail (edição do registro 7)</label>
        <input id="email-edicao" name="email" type="email" value="joao@exemplo.com"
               data-form-v="required|email"
               data-form-remote="/api/validar-email"
               data-form-remote-fields="id"
               data-form-remote-cache="20"
               data-form-remote-cache-ttl="30s"
               data-form-msg.remote="Este e-mail pertence a outro cadastro.">
        <small class="hint">O id do registro em edição é enviado junto (<code>data-form-remote-fields="id"</code>): joao@exemplo.com é válido para o próprio registro.</small>
    </div>

    <div class="field">
        <label for="email-instavel">E-mail (serviço instável, política "allow")</label>
        <input id="email-instavel" name="email_alternativo" type="email"
               data-form-v="email"
               data-form-remote="/api/validar-email?falhar=1"
               data-form-remote-param="email"
               data-form-remote-timeout="3s"
               data-form-remote-inconclusive="allow">
        <small class="hint">O servidor responde 503: o resultado é inconclusivo e o envio é permitido (o backend valida de novo).</small>
    </div>

    <div class="field">
        <label for="email-bloqueante">E-mail (serviço instável, política "block")</label>
        <input id="email-bloqueante" name="email_obrigatorio" type="email"
               data-form-v="email"
               data-form-remote="/api/validar-email?falhar=1"
               data-form-remote-param="email"
               data-form-remote-inconclusive="block">
    </div>

    <div class="actions">
        <button type="submit">Enviar</button>
        <button type="button" @click="$form.clearRemoteCache()">Limpar cache remoto</button>
    </div>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ phase: $form.phase, remoto: Object.fromEntries(Object.entries($form.fields).map(([k, f]) => [k, f.remote])), errors: $form.errors }'); ?>
</form>
<?php layout_end('<ul>
<li>O POST é o método padrão: o valor não vai para a query string. Campos de senha com GET exigem <code>data-form-remote-allow-query</code>.</li>
<li>Cada digitação aborta a consulta anterior (AbortController) e só a resposta associada ao valor atual é aplicada.</li>
<li>O cache é limitado (entradas e TTL) e só guarda respostas definitivas; erros do servidor no envio invalidam a entrada do valor.</li>
<li>Validação remota não substitui a validação final no servidor (há janela de corrida entre a consulta e o envio).</li>
</ul>'); ?>
