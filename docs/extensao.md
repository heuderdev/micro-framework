# Guia de extensão

Toda extensão usa a API pública de `AlpineForm` e deve ser registrada **antes de o Alpine iniciar** (com scripts: depois de `alpine-form.js` e antes de `alpine.js defer`; com ESM: antes de `Alpine.start()`). Nomes aceitam letras, números, `_` e `-`. Registrar um nome existente é erro, salvo `{ replace: true }`. Exemplo executável: `examples/extensao.php`.

## Validador

```js
AlpineForm.validator('placa', {
    params: [],                       // opcional: [{ name, type, optional }]; tipos: integer, number, size, field, date-or-field, enum…
    validate(value, ctx) {
        return /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(String(value).toUpperCase())
    },
})
AlpineForm.messages.placa = 'Informe uma placa válida.'
```

`validate` pode devolver `true`/`undefined`/`null` (válido), `false`, uma string (mensagem usada quando não há mensagem configurada para a regra) ou `{ valid: false, variant, vars, message, items }` (`items` = erros por arquivo). Valores vazios só chegam ao validador quando ele declara `presence: true`; por padrão, regra em campo vazio e não obrigatório não é executada.

`ctx`: `field` (informações do campo), `params`, `rule`, `signal` (`AbortSignal`), `config`, `clock()`, `other(nomeOuRef)` (valor e estado de outro campo — também registra a dependência para revalidação), `attribute(nome)`, `pattern()`, `inspect(nomeDoInspetor, item)`, `configError(msg)`.

### Validador assíncrono

```js
AlpineForm.validator('nao_gmail', {
    async: true,
    async validate(value, ctx) {
        const r = await fetch('/api/regra?v=' + encodeURIComponent(value), { signal: ctx.signal })
        return (await r.json()).ok || 'Use um e-mail corporativo.'
    },
})
```

Ao digitar de novo, a execução anterior é abortada pelo `signal`; resultado de valor antigo é descartado. Abortos não viram erro.

## Normalizador

```js
AlpineForm.normalizer('sem_acentos', (value, { args }) => typeof value === 'string' ? value.normalize('NFD').replace(/[̀-ͯ]/g, '') : value)
```

Uso: `data-form-normalize="trim|sem_acentos"`. Normalizadores não alteram o que o usuário vê; afetam o valor canônico (validação e envio).

## Componente externo

```js
AlpineForm.component('estrelas', {
    getValue: el => el.getAttribute('data-valor') || '',
    setValue(el, value) { el.setAttribute('data-valor', value ?? '') },
    subscribe(el, notify) {
        const onClick = () => notify()
        el.addEventListener('click', onClick)
        return () => el.removeEventListener('click', onClick)   // cleanup obrigatório
    },
})
```

```html
<div data-form-component="estrelas" data-form-name="nota" data-form-v="required|min_value:3"></div>
```

O componente participa de validação, `dirty`, reset e serialização com o nome de `data-form-name`. `data-form-disabled` o desabilita.

## Máscara

O módulo de máscaras registra as embutidas com `AlpineForm.mask(nome, fabrica)`. A fábrica recebe a configuração lida dos atributos e devolve um objeto com: `name`, `inputmode`, `defaults: { validation, submit }`, `format(texto, cursor) → { value, caret }`, `represent(exibido) → { raw, formatted, canonical }`, `fromValue(texto, as)` e, para padrões, `deleteAcrossLiteral(valor, cursor, direção)`. O jeito mais seguro de criar uma máscara de padrão é reutilizar `data-form-mask="pattern"` com `data-form-mask-pattern`.

## Transporte

```js
AlpineForm.transport('meu', async request => {
    // request: { url, method, headers, body, credentials, timeout, signal, onUploadProgress?, onUploadComplete? }
    const r = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal: request.signal })
    return { status: r.status, statusText: r.statusText, url: r.url, redirected: r.redirected, headers: r.headers, text: await r.text() }
})
```

Uso: `data-form-transport="meu"`. Para progresso real, chame `onUploadProgress({ loaded, total, lengthComputable })` e `onUploadComplete()` quando o corpo terminar de sair. Erros de rede devem ter `kind: 'network'` ou `'timeout'`; abortos, `name: 'AbortError'`. Os testes unitários usam exatamente esse ponto de extensão para simular a rede.

## Adaptador de resposta

```js
AlpineForm.responseAdapter('minha-api', (raw, ctx) => {
    const result = AlpineForm.registry.get('responseAdapter', 'default')(raw, ctx)
    // ajuste result: { ok, status, kind, message, errors, generalErrors, data, redirect, requestId, job, retryAfter, diagnostic }
    return result
})
```

## Adaptador remoto

```js
AlpineForm.remoteAdapter('disponivel', json => ({ valid: json.disponivel === true, message: json.motivo }))
```

Uso: `data-form-remote-adapter="disponivel"`. Devolver `valid` diferente de `true`/`false` = inconclusivo.

## Adaptador de UI

`AlpineForm.uiAdapter(nome, ({ form, uid, controller }) => adapter)`. O adaptador implementa `renderField(field, view)`, `removeField(field)`, `renderSummary(view)`, `focusSummary()`, `renderFileList(field, container, items, { onRemove })`, `renderExisting(entry)`, `setDropzoneOver(el, over)` e `destroy()`. O caminho mais simples é estender `AlpineForm.internals.DefaultUiAdapter` e trocar as classes — é o que `src/ui/bootstrap.js` faz. Todo elemento criado pelo adaptador deve levar `data-form-generated` (o observador de DOM ignora esse conteúdo) e ser removido no `destroy()`.

## Inspetor de arquivo

`AlpineForm.fileInspector(nome, { inspect(file, ctx) { … return meta } })`; um validador lê o resultado com `ctx.inspect(nome, item)`. O resultado é memorizado por arquivo. O módulo `alpine-form-inspectors` é o exemplo completo (CSV por amostragem, JSON, PDF/XLSX, mídia).

## Plugin e hooks de formulário

```js
export default function meuPlugin(AlpineForm) {
    AlpineForm.fieldAttributes(['data-form-meu-attr'])   // atributos de campo que o plugin passa a aceitar
    AlpineForm.formHook(controller => ({                 // um objeto por formulário
        beforeSend(ctx) { /* pode trocar valores (ctx.replacements), definir fase e progresso */ },
        cancel() { return false },
        destroy() {},
    }))
}
AlpineForm.use(meuPlugin)   // idempotente
```

É assim que o módulo de chunks substitui arquivos por tokens antes do envio principal. Hooks por configuração (`configure({ hooks })` ou `x-form="{ hooks: {…} }"`): `beforeSubmit(state, { submitter })` (devolver `false` impede o envio), `beforeRequest(request, state)`, `afterResponse(result, state)` e `reveal(control, fieldState)` (para abrir abas/accordions antes de focar um erro).
