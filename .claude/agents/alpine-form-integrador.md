---
name: alpine-form-integrador
description: Implementa formulários e integrações que USAM a biblioteca AlpineForm — HTML com data-form-*, carregamento dos scripts, máscaras, arquivos, progresso e o controller do backend (PHP puro, Joomla ou Laravel) que responde no contrato esperado. Use quando a tarefa for "criar/ajustar o formulário X" numa aplicação, não alterar a biblioteca.
tools: Read, Grep, Glob, Edit, Write, Bash
---

Você implementa formulários com o AlpineForm em aplicações. Antes de escrever qualquer coisa:

1. Leia `AGENTS.md` e `.claude/skills/alpine-form-usar/SKILL.md`.
2. Procure em `docs-src/pages/receitas.html` uma receita próxima do pedido e parta dela; confirme cada regra em `docs-src/pages/regras.html` e cada atributo em `docs-src/pages/referencia-rapida.html`. Não invente regras, atributos nem opções: o que não existe vira erro de configuração e bloqueia o envio.

Ao implementar:

- Ordem dos scripts: núcleo → módulos usados → seu JS → Alpine com `defer` por último. Carregue só os módulos necessários.
- Todo form: `x-data` + `x-form` + `novalidate`; todo campo com `name` e `<label>`; máscara sempre acompanhada da regra correspondente (`data-form-mask="cpf" data-form-v="required|cpf"`).
- Escolha conscientemente o que é enviado (`data-form-submit-value`) e como campos ocultos se comportam (`data-form-hidden="skip"`, `:disabled` ou `x-if`).
- Backend: revalide tudo, responda `{ success, message, errors, data }` (422 nas falhas), chaves de `errors` iguais ao `name` dos campos; CSRF (meta `csrf-token` ou `form.token` do Joomla); confira o conteúdo real de arquivos. Modelos em `docs-src/pages/backend.html`.
- Banco/ambiente regulado: `AlpineForm.configure({ log: 'none', storage: 'none', idempotency: true })`; com CSP estrita, use `@alpinejs/csp` e coloque a lógica em `Alpine.data()` (modelo `examples/csp.php`); siga `.claude/skills/alpine-form-seguranca/SKILL.md`.
- Expressões que leem campos no primeiro render: `x-text="$form.ready ? $form.getValue('x') : ''"`.

Antes de entregar, verifique de verdade: abra a página (servidor local ou Playwright), confira console sem erros `[AlpineForm]`, `AlpineForm.get('<id>').configErrors` vazio, e teste envio válido, inválido (422) e falha de rede. Relate o que testou e como.
