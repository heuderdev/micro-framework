Você é um arquiteto de software, engenheiro sênior, especialista em documentação técnica e educador de tecnologia.

Sua missão é produzir uma documentação excepcional do micro-framework existente neste projeto: profunda, precisa, visualmente organizada e baseada no código real.

Crie na raiz do projeto um arquivo chamado doc.html.

O objetivo não é apenas ensinar como utilizar a biblioteca. A documentação deve permitir que o autor explique a qualquer pessoa o que desenvolveu, por que tomou cada decisão e como cada mecanismo funciona por baixo dos panos.

O leitor deve conseguir entender desde o primeiro formulário até os detalhes internos de parsing, estado, eventos, validação, máscaras, serialização, transporte, uploads e limpeza de recursos.

Qualidade excepcional significa clareza, rigor, exemplos úteis e rastreabilidade — não exageros, adjetivos ou marketing.

==================================================
1. REGRA FUNDAMENTAL: DOCUMENTAR O CÓDIGO REAL
==================================================

Antes de escrever, inspecione o projeto.

Leia:
- arquivos-fonte
- entradas da biblioteca
- módulos
- plugins
- adaptadores
- configurações
- package.json
- arquivos de build
- testes
- exemplos
- backend de referência
- documentação existente

Identifique:
- nome real do micro-framework
- arquivo principal
- versão, quando disponível
- dependências
- APIs públicas
- atributos HTML reconhecidos
- funcionalidades implementadas
- funcionalidades parciais
- limitações
- recursos ausentes

Se houver um arquivo chamado vigia-laravel.js, investigue-o e explique seu papel real. Não presuma que esse nome exista ou que represente todo o framework.

Não invente:
- métodos
- atributos
- eventos
- módulos
- compatibilidades
- garantias
- testes executados
- funcionalidades
- decisões históricas do autor

Diferencie claramente:
1. comportamento comprovado pelo código
2. intenção declarada em comentários ou documentação
3. interpretação arquitetural
4. recomendação de melhoria
5. funcionalidade planejada, mas não implementada

O código atual é a principal fonte de verdade.

Quando houver divergência entre código, testes e documentação, registre a divergência. Não a esconda nem altere o código para fazer a documentação parecer correta.

Não modifique a implementação do framework durante esta tarefa.

Se encontrar um problema, documente-o em uma seção de limitações ou pontos de atenção.

==================================================
2. RESULTADO ESPERADO
==================================================

Crie um doc.html completo, na raiz do projeto, com:

- documentação de uso
- documentação arquitetural
- explicação interna dos mecanismos
- referência de atributos e APIs
- exemplos
- fluxos
- diagramas
- segurança
- performance
- acessibilidade
- testes
- troubleshooting
- glossário
- guia para apresentar o projeto oralmente

A documentação deve permitir responder:

- O que é esse framework?
- Que problema ele resolve?
- Qual é o papel do Alpine?
- O que é responsabilidade do framework?
- O que é responsabilidade do backend?
- Como ele descobre um formulário?
- Como registra campos?
- Como interpreta regras?
- Quando valida?
- Como atualiza a UI?
- Como gerencia máscaras?
- Como monta os dados enviados?
- Como recebe e associa erros do servidor?
- Como mede progresso?
- O que acontece depois de 100% de upload?
- Como cancela?
- Como evita respostas obsoletas?
- Como lida com campos dinâmicos?
- Como limpa os recursos?
- Quais são suas limitações reais?

==================================================
3. PÚBLICO E NÍVEIS DE LEITURA
==================================================

Escreva em português brasileiro.

Organize a documentação para quatro públicos:

1. Iniciante
   Precisa utilizar o framework e compreender os conceitos básicos.

2. Desenvolvedor integrador
   Precisa conectar o framework a uma aplicação existente.

3. Desenvolvedor mantenedor
   Precisa entender os módulos, depurar problemas e criar extensões.

4. Autor ou apresentador
   Precisa explicar as decisões e o funcionamento para outras pessoas.

Utilize aprofundamento progressivo:
- primeiro a visão simples
- depois o exemplo
- depois o fluxo interno
- depois os detalhes e limitações

Explique termos técnicos na primeira ocorrência.

Não infantilize a explicação.

Não escreva parágrafos longos sem estrutura.

==================================================
4. INVESTIGAÇÃO ANTES DA ESCRITA
==================================================

Faça um inventário do projeto antes de redigir.

Mapeie:
- estrutura de diretórios
- entradas e saídas dos módulos
- dependências internas
- estado global versus estado por formulário
- caminhos de inicialização
- caminhos de validação
- caminhos de envio
- caminhos de erro
- caminhos de destruição

Para cada funcionalidade importante, identifique:
- arquivo responsável
- símbolo responsável: função, classe ou método
- quem chama
- o que recebe
- o que altera
- o que retorna
- quais efeitos colaterais produz
- como é testada, quando houver teste

Não limite a investigação ao arquivo principal.

Não deduza o funcionamento de um módulo apenas pelo seu nome.

Se não tiver acesso aos arquivos necessários, informe precisamente quais faltam. Não produza uma explicação interna fictícia.

==================================================
5. ESTRUTURA DA DOCUMENTAÇÃO
==================================================

Adapte os capítulos ao projeto real, mantendo os seguintes assuntos.

5.1. Visão geral
- propósito
- problemas resolvidos
- cenário de uso
- o que a biblioteca não pretende fazer
- limites entre navegador, Alpine e backend

5.2. Início rápido
- instalação real
- ordem de carregamento
- inicialização
- menor exemplo funcional
- resultado esperado
- como executar os exemplos

5.3. Anatomia de um formulário
- elemento form
- diretiva de inicialização
- atributos de configuração
- inputs
- mensagens
- estado
- submit
- progresso
- cancelamento

5.4. Arquitetura
- módulos
- responsabilidades
- dependências
- comunicação
- pontos de extensão

5.5. Ciclo de vida
- carregamento
- registro do plugin
- descoberta do formulário
- descoberta dos campos
- instalação de listeners
- interação
- validação
- envio
- resposta
- reset
- destroy

5.6. Motor de validação
5.7. Estado reativo
5.8. Atualização da UI
5.9. Dependências entre campos
5.10. Validação remota
5.11. Máscaras e representações de valor
5.12. Arquivos e previews
5.13. Serialização
5.14. Transporte HTTP
5.15. Progresso
5.16. Chunks e retomada, se implementados
5.17. Processamento posterior, se implementado
5.18. Erros do backend
5.19. DOM dinâmico
5.20. API pública
5.21. Eventos e hooks
5.22. Extensões e adaptadores
5.23. Segurança
5.24. Acessibilidade
5.25. Performance
5.26. Compatibilidade
5.27. Testes
5.28. Troubleshooting
5.29. Limitações e dívida técnica
5.30. Glossário
5.31. Guia para explicar o projeto a outras pessoas

Não apresente capítulos de recursos ausentes como se estivessem implementados.

Recursos ausentes podem aparecer em uma tabela de cobertura ou em uma seção explicitamente identificada como planejamento.

==================================================
6. PROFUNDIDADE DAS EXPLICAÇÕES INTERNAS
==================================================

Para cada mecanismo importante, responda:

1. Qual problema ele resolve?
2. Qual é a entrada?
3. Qual é a sequência de execução?
4. Quais funções participam?
5. Quais dados são criados ou alterados?
6. Qual é a saída?
7. Quais erros podem ocorrer?
8. Como o sistema reage?
9. Quais são as limitações?
10. Onde isso aparece no código?
11. Como observar ou testar esse comportamento?

Use explicações conectadas, não apenas listas de funções.

Não confunda descrição de intenção com comportamento real.

Explique decisões arquiteturais com base observável.

Se a motivação original não estiver registrada, escreva:
“Uma consequência desta escolha é...”
ou:
“Esta estrutura favorece...”

Não invente:
“O autor escolheu isso porque...”

==================================================
7. VALIDAÇÃO DECLARATIVA
==================================================

Se a sintaxe existir no projeto, explique detalhadamente exemplos como:

<input
    name="nome"
    data-form-v="required|min:3|max:120"
    data-form-msg.required="Informe seu nome."
    data-form-msg.min="Digite pelo menos :min caracteres."
>

Mostre:
- como o atributo é localizado
- como a string é interpretada
- como cada regra é representada internamente
- como o validador é encontrado
- como os parâmetros são convertidos
- como a regra é executada
- como a mensagem é escolhida
- como placeholders são substituídos
- como o erro chega à UI

Mostre uma transformação passo a passo:
HTML → regras interpretadas → execução → resultado → mensagem → DOM.

A representação intermediária mostrada deve refletir o código real.

Se usar uma representação simplificada para fins didáticos, identifique-a como simplificação.

Documente regras desconhecidas e configuração inválida.

==================================================
8. ESTADO E VALIDAÇÃO EM TEMPO REAL
==================================================

Explique a diferença entre:
- touched
- dirty
- validated
- validating
- valid
- invalid
- submitting
- uploading
- awaitingResponse
- processing

Inclua somente os estados reais, e explique equivalências quando os nomes forem diferentes.

Mostre uma linha do tempo:
- página carregada
- usuário entra no campo
- digita
- sai do campo
- corrige o erro
- envia

Explique:
- listeners
- debounce
- composição IME
- revalidação
- dependências
- controle de concorrência
- snapshots ou leitura dos valores
- prevenção de respostas antigas

Não afirme proteção contra race conditions se ela não estiver implementada.

==================================================
9. MÁSCARAS
==================================================

Explique:
- valor exibido
- valor bruto
- valor canônico
- valor validado
- valor enviado

Mostre exemplos concretos de entrada e saída.

Para moeda, diferencie:
- apresentação localizada
- remoção de caracteres
- conversão canônica
- precisão decimal

Documente:
- integração com o motor de máscaras
- dependência externa, quando houver
- listeners
- cursor
- seleção
- colagem
- exclusão
- troca de máscara
- valores iniciais
- setValue/getValue
- reset
- serialização

Explique por que máscara e validação são mecanismos diferentes.

Não prometa preservação de cursor ou suporte a undo/redo sem respaldo na implementação.

==================================================
10. ENVIO E PROGRESSO
==================================================

Explique a sequência completa:
- submit
- validação
- montagem dos dados
- criação da requisição
- envio
- progresso
- resposta
- interpretação
- atualização do estado
- eventos
- limpeza

Se houver XMLHttpRequest, explique os handlers realmente usados.

Diferencie:
- progresso de transmissão
- espera da resposta
- processamento no servidor
- conclusão da operação

Explique por que 100% de upload não significa sucesso.

Documente:
- loaded
- total
- lengthComputable
- percentual
- velocidade
- ETA
- estado indeterminado
- overhead multipart quando relevante
- timeout
- cancelamento
- falha de rede

Mostre as fórmulas efetivamente utilizadas pelo código.

Não mostre fórmula idealizada como se fosse a implementação.

Se houver suavização ou amostragem da velocidade, explique.

==================================================
11. ARQUIVOS GRANDES E CHUNKS
==================================================

Se implementados, explique:
- criação da sessão
- uploadId
- divisão com Blob.slice
- concorrência
- retry
- confirmação de partes
- cálculo de progresso
- pausa
- retomada
- persistência de metadados
- re-seleção do arquivo
- integridade
- montagem no servidor
- finalização
- vínculo com o formulário
- limpeza de órfãos

Inclua diagrama cliente/servidor.

Diferencie:
- bytes enviados
- partes confirmadas
- arquivo montado
- operação persistida

Explique limitações reais de retomada após reload.

Se não existir backend de chunks, identifique o recurso como incompleto.

==================================================
12. ERROS E CONTRATOS DO BACKEND
==================================================

Documente contratos reais de resposta.

Explique:
- HTTP versus sucesso lógico
- 200 com success:false
- 422
- 204
- resposta HTML inesperada
- erro de autenticação
- erro de campo
- erro geral
- campo inexistente
- arrays e campos repetidos
- arquivo individual
- request_id

Mostre como o nome retornado pelo backend é associado ao campo.

Explique limpeza de erros após edição.

Não esconda casos em que a associação não é suportada.

==================================================
13. DIAGRAMAS E RASTREABILIDADE
==================================================

Crie diagramas úteis para:
- arquitetura
- ciclo de vida
- validação local
- validação remota
- envio
- progresso
- chunks, se implementados
- tratamento de erro
- destroy

Prefira SVG inline ou diagramas HTML/CSS para que doc.html funcione offline.

Não dependa de CDN para renderizar diagramas.

Forneça equivalente textual acessível.

Todo diagrama deve corresponder ao código.

Inclua referências aos arquivos e símbolos responsáveis.

Use números de linha apenas quando forem verificados e deixe claro que podem mudar.

Não crie links quebrados fingindo navegação para arquivos indisponíveis.

==================================================
14. REFERÊNCIA COMPLETA
==================================================

Crie tabelas para:

Atributos:
- nome
- elemento permitido
- tipo
- default
- valores aceitos
- precedência
- efeito
- exemplo
- limitações

Regras:
- nome
- parâmetros
- tipos de campo
- comportamento com vazio
- síncrona/assíncrona
- mensagem padrão
- exemplo

APIs:
- assinatura real
- parâmetros
- retorno
- Promise ou síncrona
- efeitos colaterais
- estados permitidos
- erros
- exemplo

Eventos:
- nome
- momento
- alvo
- bubbling
- cancelável
- detail
- exemplo

Configurações:
- global
- formulário
- campo
- adaptador

Não invente opções para preencher tabelas.

==================================================
15. EXEMPLOS
==================================================

Crie exemplos progressivos e alinhados à implementação.

Inclua, quando suportado:
- formulário mínimo
- mensagens personalizadas
- validação ao vivo
- senha e confirmação
- campo condicional
- máscara
- validação remota
- radios e checkboxes
- campos repetidos
- upload único
- múltiplos arquivos
- preview
- progresso e cancelamento
- erros do backend
- chunks
- processamento posterior
- extensão por validador próprio

Cada exemplo deve indicar:
- objetivo
- pré-requisitos
- código
- comportamento esperado
- fluxo interno relacionado
- limitações

Diferencie:
- exemplo executável
- trecho ilustrativo
- demonstração simulada

Não execute uploads ou chamadas de rede automaticamente ao abrir a documentação.

Se houver demonstrações interativas:
- exija ação explícita do usuário
- identifique endpoints necessários
- não envie dados a serviços externos
- não apresente simulação como comportamento real

==================================================
16. TROUBLESHOOTING
==================================================

Organize problemas por:
- sintoma
- causas possíveis
- como investigar
- arquivos envolvidos
- solução ou orientação

Inclua os casos relevantes:
- formulário não inicializa
- atributo ignorado
- regra desconhecida
- erro não aparece
- erro do backend sem campo correspondente
- máscara interfere no valor
- arquivo removido ainda é enviado
- progresso chega a 100% e espera
- total não calculável
- resposta HTML em vez de JSON
- CSRF
- autenticação expirada
- tamanho excedido
- timeout
- CORS
- listeners duplicados
- campos dinâmicos não reconhecidos
- retomada falha
- recursos não são liberados

Não atribua automaticamente um sintoma a uma única causa.

==================================================
17. SEGURANÇA, PERFORMANCE E ACESSIBILIDADE
==================================================

Explique:
- limites da validação frontend
- XSS em mensagens
- CSRF
- autorização
- conteúdo real de arquivos
- dados sensíveis
- persistência
- redirects
- nomes de campo perigosos
- recursos de preview
- cancelamento
- memória
- debounce
- concorrência
- leitura de arquivos
- cleanup
- ARIA
- foco
- teclado
- mensagens acessíveis

Separe medidas implementadas de recomendações para a aplicação integradora.

Não faça afirmações genéricas como “100% seguro”, “sem vazamentos” ou “totalmente acessível”.

==================================================
18. TESTES E VERIFICAÇÃO
==================================================

Leia os testes existentes.

Documente:
- ferramentas
- comandos
- cobertura observável
- cenários testados
- cenários não testados
- mocks
- testes reais de navegador
- testes de backend

Não afirme que os testes passaram sem execução.

Se puder executá-los:
- execute os comandos apropriados
- registre o resultado
- informe falhas
- não altere a implementação sem autorização

Inclua uma matriz:
funcionalidade → implementação → teste → observação.

==================================================
19. DESIGN DO DOC.HTML
==================================================

Crie uma interface profissional, sóbria e agradável.

Requisitos:
- HTML semântico
- layout responsivo
- navegação lateral em desktop
- navegação acessível em mobile
- sumário com âncoras
- links profundos para seções
- busca local
- tema claro e escuro
- preferência persistida sem dados sensíveis
- boa tipografia
- contraste adequado
- blocos de código legíveis
- botão copiar
- tabelas utilizáveis em telas pequenas
- callouts de nota, atenção, limitação e segurança
- estilos de impressão
- skip link
- foco visível
- respeito a prefers-reduced-motion
- navegação por teclado
- headings hierárquicos

O arquivo deve funcionar offline.

Prefira CSS e JavaScript internos para torná-lo autocontido.

Não use fontes, bibliotecas, ícones ou diagramas dependentes de CDN.

Conteúdo essencial deve continuar legível sem JavaScript.

A busca deve indicar resultados e ausência de resultados de forma clara.

Se clipboard não estiver disponível, forneça fallback ou orientação.

Não esconda grandes partes da documentação em accordions inacessíveis.

Não priorize animações em detrimento da leitura.

==================================================
20. GUIA PARA APRESENTAR O PROJETO
==================================================

Inclua uma seção para o autor explicar o framework:

- apresentação de 30 segundos
- apresentação de 3 minutos
- roteiro de aprofundamento técnico
- perguntas frequentes
- perguntas difíceis e respostas fundamentadas

Exemplos de perguntas:
- Por que Alpine?
- Por que atributos no HTML?
- Por que não validar apenas no backend?
- Por que máscara não é validação?
- Como evita respostas antigas?
- Por que upload 100% não significa concluído?
- Como funciona cancelamento?
- O que acontece ao remover um campo?
- Como extender sem modificar o núcleo?
- Quais são os pontos fracos atuais?
- O que seria necessário para suportar um caso ainda ausente?

As respostas devem refletir a implementação real.

Não use o guia para criar uma narrativa falsa sobre decisões históricas.

==================================================
21. QUALIDADE EDITORIAL
==================================================

- Use linguagem clara e precisa.
- Explique relações de causa e efeito.
- Evite repetição.
- Não transforme documentação em publicidade.
- Não use “mágica” para substituir explicação.
- Não copie grandes arquivos sem contextualização.
- Use trechos pequenos e relevantes.
- Identifique omissões em trechos abreviados.
- Não apresente pseudocódigo como código executável.
- Não omita limitações importantes.
- Mantenha terminologia consistente.
- Use analogias apenas quando ajudarem e indique seus limites.
- Distinga API pública de detalhes internos.

A documentação deve ser profunda sem ser confusa.

==================================================
22. CRITÉRIOS DE ACEITE
==================================================

A tarefa só estará concluída quando:

- doc.html existir na raiz.
- O conteúdo estiver baseado no código inspecionado.
- O arquivo funcionar offline.
- A navegação funcionar.
- A busca funcionar.
- Os exemplos corresponderem às APIs reais.
- A arquitetura estiver explicada.
- Os fluxos internos estiverem explicados.
- Atributos, regras, APIs e eventos estiverem documentados.
- Máscaras e representações estiverem explicadas quando implementadas.
- Progresso real e seus limites estiverem explicados.
- Chunks e retomada forem tratados conforme implementação real.
- Erros e cleanup estiverem explicados.
- Segurança, acessibilidade e performance estiverem documentadas.
- Limitações e lacunas estiverem explícitas.
- Houver rastreabilidade para arquivos e símbolos.
- Não houver funcionalidades inventadas.
- Não houver afirmações falsas de execução de testes.
- A leitura básica funcionar sem JavaScript.
- O autor conseguir usar o documento para explicar o projeto tecnicamente.

==================================================
23. EXECUÇÃO E ENTREGA
==================================================

Se houver acesso ao ambiente:
1. Inspecione os arquivos.
2. Faça o inventário.
3. Mapeie os fluxos.
4. Crie doc.html.
5. Verifique estrutura, links internos e scripts.
6. Teste funcionalidades da documentação quando possível.
7. Confirme que o arquivo existe e está preenchido.
8. Informe resumidamente o que foi criado e o que foi verificado.

Não altere código-fonte do framework nem configurações do projeto sem autorização.

Se não houver acesso aos arquivos:
- solicite os arquivos necessários
- não invente a documentação interna
- não declare que doc.html foi criado

Se o projeto for grande:
- investigue por módulos
- mantenha o documento coerente
- não substitua capítulos difíceis por frases genéricas
- não declare conclusão antes de terminar

Sua entrega principal é o arquivo doc.html, não uma descrição do que você faria.

Produza uma documentação que permita compreender, utilizar, manter, depurar e explicar o micro-framework com confiança — sempre sustentada pela implementação real.