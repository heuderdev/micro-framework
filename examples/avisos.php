<?php require __DIR__ . '/_layout.php';
layout_start('Avisos e confirmação', 'Módulo opcional <code>alpine-form-avisos</code>: avisos flutuantes (toasts) depois do envio e confirmação acessível antes de enviar ou excluir — só com atributos.', ['avisos' => true, 'lista' => true]);
?>
<form id="cadastro" x-data x-form action="/api/demo/clientes-novo" method="post"
      data-form-avisos data-form-lista="clientes" data-form-reset-on-success novalidate>
    <h2>Cadastro com aviso</h2>
    <p class="hint"><code>data-form-avisos</code>: o sucesso mostra a mensagem do servidor ("Cliente cadastrado."); erros do servidor também viram aviso.</p>
    <div class="row">
        <div class="field">
            <label for="a-nome">Nome</label>
            <input id="a-nome" name="nome" data-form-v="required|min:3">
        </div>
        <div class="field">
            <label for="a-email">E-mail</label>
            <input id="a-email" name="email" type="email" data-form-v="required|email">
        </div>
        <div class="field">
            <label for="a-uf">UF</label>
            <select id="a-uf" name="uf" data-form-v="required"><option value="">--</option><option>SP</option><option>RJ</option><option>MG</option></select>
        </div>
    </div>
    <div class="actions"><button type="submit" x-bind:disabled="$form.submitting">Cadastrar</button></div>
</form>

<form id="exclusao" x-data x-form action="/api/demo/sucesso" method="post" data-form-avisos="sucesso" novalidate>
    <h2>Confirmação no botão</h2>
    <p class="hint">"Salvar" envia direto. "Excluir" pergunta antes (<code>data-form-confirmar</code> + <code>-perigo</code>: o foco começa em Cancelar; Esc cancela).</p>
    <input type="hidden" name="pedido" value="1234">
    <div class="actions">
        <button type="submit" id="b-salvar" name="acao" value="salvar">Salvar</button>
        <button type="submit" id="b-excluir" name="acao" value="excluir"
                data-form-confirmar="O pedido 1234 será excluído. Esta ação não pode ser desfeita."
                data-form-confirmar-titulo="Excluir pedido?" data-form-confirmar-ok="Excluir" data-form-confirmar-perigo>Excluir</button>
    </div>
    <p data-form-status class="hint"></p>
</form>

<section class="card" x-data="{ resposta: '' }">
    <h2>Pelo código</h2>
    <div class="actions">
        <button type="button" id="b-sucesso" @click="$avisos.sucesso('Exportação iniciada.')">Aviso de sucesso</button>
        <button type="button" id="b-erro" @click="$avisos.erro('Não foi possível gerar o relatório.')">Aviso de erro</button>
        <button type="button" id="b-fixo" @click="$avisos.aviso('Este aviso só fecha no ×.', { duracao: 0 })">Aviso fixo</button>
        <button type="button" id="b-perguntar" @click="resposta = (await $confirmar('Descartar as alterações?', { confirmar: 'Descartar' })) ? 'descartou' : 'manteve'">Perguntar</button>
    </div>
    <p class="hint">Resposta: <strong id="resposta" x-text="resposta || '—'"></strong></p>
</section>

<section id="clientes" class="card" x-data x-lista data-lista-url="/api/demo/clientes" data-lista-por-pagina="5" data-lista-ordem="criado_em" data-lista-direcao="desc">
    <h2>Últimos clientes</h2>
    <ul>
        <template x-for="item in $lista.itens" :key="item.id"><li x-text="item.nome + ' (' + item.uf + ')'"></li></template>
    </ul>
</section>
<?php layout_end('<ul>
<li>Os avisos ficam em regiões vivas (<code>role="status"</code>; erros em <code>role="alert"</code>) e não somem enquanto o mouse ou o foco estão neles.</li>
<li>A confirmação acontece depois da validação: formulário inválido nem pergunta. Cancelar não envia nada.</li>
<li>Texto do servidor vira texto, nunca HTML.</li>
</ul>'); ?>
