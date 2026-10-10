# CLAUDE.md

As instruções do projeto ficam em `AGENTS.md` (fonte única para todas as IAs):

@AGENTS.md

## Específico do Claude Code

- **Skills** (carregadas automaticamente quando a tarefa combina): `.claude/skills/`
  - `alpine-form-usar` — escrever formulários e backends usando a biblioteca
  - `alpine-form-desenvolver` — alterar o código da biblioteca
  - `alpine-form-documentar` — documentação (`docs-src/`, `doc.html`, `docs/*.md`)
  - `alpine-form-seguranca` — revisão de segurança e uso em ambiente regulado
- **Subagentes**: `.claude/agents/`
  - `alpine-form-integrador` — implementa formulários/integrações em projetos que usam a biblioteca
  - `alpine-form-revisor` — revisa mudanças contra os invariantes e a segurança (somente leitura)
  - `alpine-form-testador` — roda as suítes e diagnostica falhas
  - `alpine-form-documentador` — atualiza a documentação e roda os verificadores
