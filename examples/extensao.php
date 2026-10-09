<?php require __DIR__ . '/_layout.php';
layout_start('Extensões sem editar o núcleo', 'Validador síncrono, validador assíncrono, normalizador e adaptador de componente externo, registrados pela API pública antes de o Alpine iniciar.');
?>
<script>
    AlpineForm.validator('placa', {
        validate: value => /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(String(value).toUpperCase()),
    })
    AlpineForm.messages.placa = 'Informe uma placa no padrão antigo (ABC-1234) ou Mercosul (ABC1D23).'

    // Exemplo de regra assíncrona: a espera de 300 ms SIMULA uma verificação demorada (sem rede).
    AlpineForm.validator('nao_gmail', {
        async: true,
        async validate(value, ctx) {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, 300)
                ctx.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('cancelado', 'AbortError')) }, { once: true })
            })
            return !String(value).toLowerCase().endsWith('@gmail.com') || 'Use um e-mail corporativo.'
        },
    })

    AlpineForm.normalizer('sem_acentos', value => (typeof value === 'string' ? value.normalize('NFD').replace(/[̀-ͯ]/g, '') : value))

    AlpineForm.component('estrelas', {
        getValue: el => el.getAttribute('data-valor') || '',
        setValue(el, value) {
            el.setAttribute('data-valor', value == null ? '' : String(value))
            el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.value) <= Number(value))))
        },
        subscribe(el, notify) {
            const onClick = event => {
                const button = event.target.closest('button[value]')
                if (!button) return
                this.setValue(el, button.value)
                notify()
            }
            el.addEventListener('click', onClick)
            return () => el.removeEventListener('click', onClick)
        },
    })
</script>
<form id="extensao" x-data x-form action="/api/demo/sucesso" method="post" data-form-encoding="json" novalidate>
    <div class="field">
        <label for="placa">Placa</label>
        <input id="placa" name="placa" data-form-v="required|placa" data-form-normalize="trim|uppercase">
    </div>
    <div class="field">
        <label for="email-corp">E-mail corporativo</label>
        <input id="email-corp" name="email" type="email" data-form-v="required|email|nao_gmail">
    </div>
    <div class="field">
        <label for="cidade">Cidade (enviada sem acentos)</label>
        <input id="cidade" name="cidade" value="São José" data-form-normalize="trim|sem_acentos">
    </div>
    <div class="field">
        <span id="nota-label" class="label">Avaliação</span>
        <div data-form-component="estrelas" data-form-name="nota" data-form-label="Avaliação" data-form-v="required|min_value:3"
             data-form-msg.min_value="Avalie com pelo menos 3 estrelas." role="group" aria-labelledby="nota-label">
            <button type="button" value="1" aria-pressed="false">★1</button>
            <button type="button" value="2" aria-pressed="false">★2</button>
            <button type="button" value="3" aria-pressed="false">★3</button>
            <button type="button" value="4" aria-pressed="false">★4</button>
            <button type="button" value="5" aria-pressed="false">★5</button>
        </div>
    </div>
    <button type="submit">Enviar</button>
    <p data-form-status class="hint"></p>
    <?php state_panel('{ errors: $form.errors, enviado: $form.result && $form.result.data }'); ?>
</form>
<?php layout_end('<ul>
<li>Normalizadores não alteram o que o usuário vê; afetam o valor canônico usado na validação e no envio.</li>
<li>Componentes externos precisam implementar <code>getValue</code>, <code>setValue</code> e <code>subscribe</code>; o valor entra na serialização com <code>data-form-name</code>.</li>
<li>Regras assíncronas recebem <code>ctx.signal</code>; ao digitar de novo, a execução anterior é abortada.</li>
</ul>'); ?>
