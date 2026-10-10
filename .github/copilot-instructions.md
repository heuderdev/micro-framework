# Instruções para o GitHub Copilot

Leia `AGENTS.md` na raiz do repositório: é a fonte única de instruções para assistentes de IA (mapa do código, comandos, invariantes que não podem ser quebrados, fluxo de mudança e armadilhas do ambiente).

Resumo do essencial:

- Idioma: português do Brasil em código, comentários, mensagens, documentação e commits.
- `dist/` e `docs/*.html` são gerados: edite `src/` e `docs-src/pages/` e rode `npm run build` / `npm run docs`.
- Atributo ou regra desconhecida é erro de configuração (nunca ignorar); todo atributo novo precisa ser registrado.
- Sem `eval`, `new Function`, `innerHTML` em `src/` (a biblioteca roda sob CSP estrita); mensagens via `textContent`.
- POST nunca é repetido automaticamente; valores sensíveis nunca expostos; URLs vindas do servidor só da mesma origem.
- Antes de concluir: `npm run build && npm test && npm run test:php && npm run test:e2e` e `npm run docs:check`.

Procedimentos detalhados: `.claude/skills/alpine-form-*/SKILL.md`.
