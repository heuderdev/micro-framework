Você é um arquiteto de software e engenheiro sênior especializado em JavaScript, Alpine.js, formulários, validação, máscaras, acessibilidade e uploads.

Crie um micro-framework completo de gerenciamento de formulários sobre Alpine.js, chamado AlpineForm.

Não quero somente uma proposta arquitetural, pseudocódigo ou exemplos desconectados. Quero uma biblioteca funcional, organizada, testada, documentada e utilizável em projetos reais.

O objetivo principal é configurar formulários, validações, mensagens, máscaras, arquivos e envio diretamente no HTML, usando atributos data-form-* nos próprios inputs.

A biblioteca deve funcionar em páginas renderizadas pelo servidor, especialmente PHP, Joomla e Laravel, sem exigir uma SPA nem alterar a estrutura existente da aplicação.

Leia todos os requisitos antes de começar. Resolva ambiguidades explicitamente e mantenha consistência entre implementação, exemplos, testes e documentação.

Não afirme que a biblioteca atende a “todos os casos possíveis”. Entregue o escopo definido, mecanismos de extensão e limitações claras.

==================================================
1. PRINCÍPIOS OBRIGATÓRIOS
==================================================

- Alpine.js 3 como integração principal.
- Utilizar somente APIs públicas do Alpine.
- Não usar propriedades internas privadas do Alpine.
- Não reinventar o mecanismo reativo do Alpine.
- Configuração declarativa nos próprios elementos HTML.
- JavaScript moderno, modular e organizado.
- Não exigir TypeScript para consumir a biblioteca.
- Permitir uso por script tradicional e por importação ESM.
- Não exigir bundler do usuário final.
- Não depender de jQuery.
- Não depender de framework CSS.
- Compatibilidade visual por adaptadores, incluindo Bootstrap.
- Estado isolado para cada formulário.
- Suporte a múltiplos formulários simultâneos.
- Compatibilidade com formulários HTML existentes.
- Não exigir cadastrar campos em um schema JavaScript.
- Não usar eval nem new Function para interpretar regras.
- Não inserir mensagens recebidas do servidor com innerHTML.
- Não substituir conteúdo ou atributos existentes sem necessidade.
- Não prometer segurança de upload por validação apenas no navegador.
- Não prometer retomada ou chunks sem um protocolo real no servidor.
- Não simular progresso de upload.
- Não implementar máscaras complexas com um simples replace improvisado.
- Código limpo, sem comentários óbvios ou excessivos.
- Documentação em português brasileiro.
- Mensagens padrão em português brasileiro.
- Extensibilidade sem editar o núcleo.
- Dependências opcionais quando possível.
- Definição explícita de versões mínimas suportadas.

Priorize corretude, clareza e manutenção. Não crie uma abstração frágil somente para reduzir alguns atributos HTML.

==================================================
2. SINTAXE DECLARATIVA CENTRAL
==================================================

O uso principal deve ser:

<form
    x-form
    action="/api/vendedores"
    method="post"
    data-form-validation="live"
    data-form-debounce="250"
    novalidate
>
    <input
        name="nome"
        type="text"
        data-form-v="required|min:3|max:120"
        data-form-msg.required="Informe seu nome."
        data-form-msg.min="Digite pelo menos :min caracteres."
        data-form-msg.max="Digite no máximo :max caracteres."
    >

    <input
        name="email"
        type="email"
        data-form-v="required|email"
        data-form-msg.email="Informe um e-mail válido."
    >

    <input
        name="cpf"
        type="text"
        inputmode="numeric"
        data-form-mask="cpf"
        data-form-v="required|cpf"
        data-form-submit-value="raw"
        data-form-msg.cpf="Informe um CPF válido."
    >

    <input
        name="documentos[]"
        type="file"
        multiple
        data-form-v="required|files_max:5|file_max:10MB|files_total_max:30MB|ext:pdf,jpg,jpeg,png"
        data-form-msg.file_max="Cada arquivo pode ter no máximo :max."
    >

    <button type="submit">Salvar</button>
</form>

Os atributos com ponto, como data-form-msg.required, devem funcionar por leitura explícita com getAttribute ou mecanismo equivalente.

Não dependa de conversões presumidas do dataset.

x-form é a diretiva de inicialização. Os atributos data-form-* são configurações interpretadas pela biblioteca.

Mantenha os nomes finais dos atributos consistentes em código, documentação e exemplos.

==================================================
3. CONTRATO DE CONFIGURAÇÃO
==================================================

Defina formalmente:

- Configurações globais da biblioteca.
- Configurações por formulário.
- Configurações por campo.
- Configurações por grupo.
- Precedência entre essas configurações.
- Defaults.
- Validação das próprias configurações.
- Atributos booleanos.
- Valores numéricos.
- Unidades de tamanho.
- Seletores de destino.
- Referências a outros campos.

A configuração declarativa deve ser suficiente para o uso comum.

Uma API JavaScript pode existir para extensões e casos avançados, mas não deve ser obrigatória para registrar cada input.

Não interprete atributos como código JavaScript arbitrário.

Atributos malformados devem produzir erro de configuração claro, sem aprovar silenciosamente o campo.

==================================================
4. PARSER DE REGRAS
==================================================

Implemente um parser robusto para:

data-form-v="required|min:3|max:120"

Defina:

- Separador de regras.
- Separador entre nome e parâmetros.
- Separador entre parâmetros.
- Escape quando necessário.
- Espaços em branco.
- Argumentos vazios.
- Regras repetidas.
- Regras desconhecidas.
- Parâmetros inválidos.
- Referências a campos.
- Mensagens com placeholders.
- Ordem de execução.
- Primeiro erro ou coleta de todos os erros.

Expressões regulares devem usar atributo separado:

data-form-v="required|pattern"
data-form-pattern="^[A-Z]{3}-[0-9]{4}$"

Defina limites e tratamento de expressões inválidas.

Não execute regex fornecida por usuários externos como configuração confiável.

Separe:
- erro de configuração
- erro de validação
- falha operacional

Não ignore silenciosamente uma regra desconhecida como requried.

==================================================
5. TIPOS DE CAMPO
==================================================

Suporte:

- text
- email
- password
- number
- tel
- url
- search
- date
- datetime-local
- time
- month
- week
- textarea
- select simples
- select múltiplo
- checkbox individual
- grupos de checkbox
- grupos de radio
- hidden
- file único
- file múltiplo
- campos adicionados dinamicamente
- campos removidos dinamicamente
- campos desabilitados
- campos somente leitura
- campos associados ao formulário pelo atributo form
- nomes em notação de arrays
- grupos repetidos
- componentes externos através de adaptadores

Defina a semântica de required para cada tipo.

Não confunda:
- campo ausente
- string vazia
- zero
- false
- array vazio
- arquivo vazio

Defina políticas distintas para:
- type="hidden"
- campos ocultos por CSS
- campos ocultos por x-show
- campos removidos por x-if

Não considere automaticamente todo campo invisível como dispensado de validação.

Documente quais controles participam da validação e da serialização.

==================================================
6. NORMALIZAÇÃO E SERIALIZAÇÃO
==================================================

Separe:

- valor exibido
- valor bruto
- valor canônico
- valor usado na validação
- valor enviado ao servidor

Não altere silenciosamente senhas, arquivos ou valores sensíveis.

Suporte normalizadores opcionais:
- trim
- lowercase
- uppercase
- apenas dígitos
- decimal com locale
- remoção de máscara
- normalizador personalizado

Defina comportamento de:
- campos sem name
- nomes repetidos
- checkbox desmarcado
- select múltiplo
- arrays
- objetos aninhados
- arquivos
- campos desabilitados
- botão que originou o submit

Use FormData corretamente.

Não defina manualmente Content-Type multipart com boundary incorreto.

JSON deve ser opcional e tratar arquivos explicitamente, sem descartá-los silenciosamente.

Não use conversão de FormData para objeto que perca nomes repetidos.

Defina a interpretação de:

itens[0][nome]
itens[1][nome]
documentos[]
usuario.email

Não transforme nomes em objetos aninhados sem política explícita.

Bloqueie caminhos perigosos como __proto__, prototype e constructor quando houver construção de objetos.

==================================================
7. REGRAS DE VALIDAÇÃO
==================================================

Implemente regras para:

Presença:
- required
- optional/nullable com semântica documentada
- accepted
- required_if
- required_unless
- required_with
- required_without

Texto:
- min
- max
- length
- min_length
- max_length
- email
- url
- pattern
- alpha
- alphanumeric
- digits
- starts_with
- ends_with
- contains
- in
- not_in

Números:
- numeric
- integer
- decimal
- positive
- negative
- between
- min_value
- max_value
- multiple_of

Comparação:
- same
- different
- greater_than
- greater_or_equal
- less_than
- less_or_equal

Datas:
- date
- before
- after
- before_or_equal
- after_or_equal
- date_between

Brasil:
- cpf
- cnpj
- cpf_cnpj
- cep
- telefone

Arquivos:
- files_min
- files_max
- file_min
- file_max
- files_total_max
- ext
- mime
- non_empty_file

Imagens:
- image
- width_min
- width_max
- height_min
- height_max
- dimensions
- aspect_ratio

Documente o que cada regra comprova e o que não comprova.

CPF/CNPJ validam formato e dígitos verificadores, não existência ou situação cadastral.

CEP e telefone locais validam formato, não existência.

Datas devem usar parsing estrito e semântica explícita de timezone.

Não dependa de Date.parse para formatos ambíguos.

Defina contagem de caracteres e comportamento Unicode.

Defina:
- min/max como comprimento em texto
- min/max como valor em campos numéricos
- regras específicas para arquivos

Documente MB, MiB e precisão das comparações.

Campos opcionais vazios devem pular regras de formato, salvo quando uma regra de presença exigir valor.

Implemente registro público de validadores síncronos e assíncronos.

Comparações decimais devem ter estratégia explícita de precisão, especialmente para moeda.

==================================================
8. ESTADO REATIVO
==================================================

Cada campo deve rastrear:
- value ou representações equivalentes
- initialValue
- touched
- dirty
- validated
- validating
- localErrors
- serverErrors
- valid/invalid conforme estado de validação

Cada formulário deve rastrear:
- pristine
- dirty
- validating
- submitting
- uploading
- awaitingResponse
- processing quando houver protocolo
- success
- canceled
- failed
- progress
- errors
- result

Defina transições válidas de estado.

Não considere campo ainda não validado como visualmente aprovado.

Evite divergência entre DOM e estado reativo.

Exponha estado para Alpine por uma API pública clara, como $form, documentando o escopo.

No caso de formulários aninhados indevidamente no HTML, gere diagnóstico claro, sem tentar suportar estrutura inválida como padrão.

==================================================
9. VALIDAÇÃO EM TEMPO REAL
==================================================

Suporte:
- live
- input
- blur
- change
- submit

Modo live padrão:
- não mostrar erros antes da primeira interação
- validar no primeiro blur
- revalidar durante input depois de touched
- validar selects, checkboxes e arquivos no change
- validar todos os campos no submit

Configuração por formulário com sobrescrita por campo.

Suporte debounce.

Trate composição de texto IME.

Não destrua cursor nem sobrescreva digitação.

Registre automaticamente dependências entre campos.

Quando um campo referenciado mudar, revalide dependentes conforme política de interação.

Detecte ciclos sem entrar em loop.

No submit:
- aguarde validadores pendentes
- valide um conjunto consistente de valores
- defina o comportamento se valores mudarem durante a validação

Não envie dados diferentes dos que acabaram de ser validados sem revalidação ou política explícita de snapshot.

==================================================
10. VALIDAÇÃO REMOTA
==================================================

Exemplo:

<input
    name="email"
    data-form-v="required|email"
    data-form-remote="/api/validar-email"
    data-form-remote-method="post"
    data-form-remote-debounce="500"
    data-form-msg.remote="Este e-mail já está cadastrado."
    data-form-msg.pending="Verificando..."
>

Implemente:
- execução após regras locais
- debounce
- cancelamento quando possível
- descarte de respostas obsoletas
- associação ao valor consultado
- erro de rede separado de valor inválido
- timeout
- headers e CSRF
- campos adicionais configurados
- identificação do registro em edição
- cache opcional limitado
- invalidação de cache
- política para resultado inconclusivo
- adaptação de contrato

Contrato padrão:

{
    "valid": false,
    "message": "Valor já cadastrado."
}

Não trate abort como erro de preenchimento.

Não presuma que validação remota elimina validação final no servidor.

Não envie valores sensíveis por query string sem uma decisão explícita.

==================================================
11. MENSAGENS E UI
==================================================

Precedência:
1. mensagem específica da regra no campo
2. mensagem genérica do campo
3. mensagem padrão da biblioteca

Exemplos:

data-form-msg.required="Informe seu nome."
data-form-msg.min="Digite pelo menos :min caracteres."
data-form-msg="Confira o valor informado."

Placeholders:
- :field
- :min
- :max
- :value
- :other
- :allowed

Não exponha senhas ou valores sensíveis em placeholders.

Label por:
- data-form-label
- label associado
- fallback para name

Crie automaticamente elemento de erro, sem exigir <small> manual.

Destino personalizado:

data-form-error-target="#erro-email"

Suporte:
- primeiro erro
- todos os erros
- resumo de erros
- erros gerais
- estado pendente
- classes configuráveis
- adaptador Bootstrap
- foco no primeiro erro
- rolagem configurável
- hooks para aba, accordion e modal
- preservação de atributos ARIA existentes

Use textContent para mensagens.

Implemente aria-invalid e associação por aria-describedby.

Evite anúncios agressivos durante digitação.

Barra de progresso e controles devem ser acessíveis.

Não dependa somente de cor.

IDs gerados devem ser únicos entre formulários.

==================================================
12. ARQUIVOS E PREVIEWS
==================================================

Suporte:
- arquivo único
- múltiplos arquivos
- drag and drop opcional
- seleção incremental opcional
- remoção antes do envio
- listagem
- tamanho individual e total
- identificador estável por arquivo
- política de duplicados
- erro individual e de grupo
- thumbnails de imagens
- preview seguro quando suportado
- limpeza de object URLs
- metadados de mídia quando disponíveis
- falha de leitura e decodificação
- cancelamento de validações pesadas
- arquivos existentes na edição
- pedido de remoção separado de upload novo

Defina a fonte de verdade da seleção.

Remover arquivo da UI deve removê-lo do FormData enviado.

Não presuma alteração irrestrita de input.files.

Não leia arquivos enormes inteiros sem necessidade.

Plugins especializados:
- imagem
- CSV com cabeçalhos e amostragem
- JSON com sintaxe e estrutura
- adaptadores opcionais para PDF/XLSX

Não improvise parsers de formatos complexos.

Validação por amostra deve ser identificada como amostragem.

Permitir um formato não significa comprovar que seu conteúdo é seguro.

Defina o comportamento quando o navegador não conseguir decodificar um formato permitido.

==================================================
13. ENVIO DO FORMULÁRIO
==================================================

Suporte:
- action e method existentes
- endpoint sobrescrito por configuração
- FormData
- JSON opcional
- headers
- credentials
- CSRF
- campos ocultos existentes
- submitter com name/value
- overrides permitidos do submitter
- clique, Enter e requestSubmit
- prevenção de envio duplicado
- timeout configurável
- cancelamento
- resposta JSON
- resposta vazia, incluindo 204
- resposta não JSON inesperada
- erros HTTP
- falhas de rede
- sucesso lógico separado de status HTTP
- adaptadores de resposta
- hooks antes e depois
- reset opcional após sucesso
- redirecionamento opcional seguro

Documente form.submit(), que contorna eventos de submit, sem monkey patch global.

HTTP 200 com success:false não é sucesso.

Resposta HTML de login/proxy deve gerar diagnóstico útil, não apenas erro genérico de JSON.

Defina tratamento para:
- autenticação expirada
- 401/403
- 413
- 422
- 429
- 5xx
- redirects
- falhas CORS
- conexão interrompida

Não ofereça garantia de detectar a causa exata de uma falha de rede quando o navegador não fornece essa informação.

==================================================
14. BARRA DE PROGRESSO REAL
==================================================

Este requisito é obrigatório.

Implemente transporte XMLHttpRequest para progresso real de upload.

Não simule progresso com timers.

Exponha:
- loaded
- total quando disponível
- percent quando calculável
- estado indeterminado
- velocidade estimada
- ETA quando houver base suficiente
- tempo decorrido
- cancelamento
- timeout
- erro

Velocidade e ETA são estimativas.

Diferencie:
1. validando
2. enviando bytes
3. upload concluído, aguardando resposta
4. processamento no servidor quando houver protocolo
5. concluído

100% enviado não significa operação concluída.

Crie atributos declarativos para conectar a UI, por exemplo:

data-form-progress
data-form-progress-bar
data-form-progress-percent
data-form-progress-loaded
data-form-progress-total
data-form-progress-speed
data-form-progress-eta
data-form-status
data-form-cancel

Você pode ajustar esses nomes antes da implementação, mas deve congelar e documentar o contrato final.

Forneça exemplo completo com:
- barra
- porcentagem
- bytes
- velocidade
- tempo estimado
- mensagem de espera após upload
- cancelar
- erro
- sucesso
- estado indeterminado

Não invente progresso individual exato por arquivo em um único multipart.

Progresso individual exige requisições separadas ou protocolo adequado.

Documente implicações de CORS para eventos de upload.

Defina se loaded/total representam corpo transmitido, incluindo overhead, ou bytes úteis do arquivo em cada modo.

==================================================
15. ARQUIVOS GRANDES, CHUNKS E RETOMADA
==================================================

Implemente módulo opcional real de upload em partes.

Não considere entregue apenas por existir chunkSize.

Defina protocolo cliente/servidor:
- iniciar sessão
- retornar uploadId
- consultar partes
- enviar parte
- identificar índice, offset e tamanho
- retry seguro
- finalizar
- cancelar
- expirar
- verificar integridade
- rejeitar partes incompatíveis
- autorização
- limites
- limpeza de sessões abandonadas

Cliente:
- Blob.slice
- chunk configurável
- concorrência limitada
- retry com backoff e limite
- cancelamento
- pausa documentada
- retomada
- progresso sem dupla contagem
- partes confirmadas
- persistência opcional de metadados não sensíveis
- re-seleção após reload quando necessária
- detecção de arquivo diferente
- recuperação de sessão expirada

Não persistir credenciais em armazenamento inseguro.

Não afirmar que o navegador conserva automaticamente acesso ao arquivo após reload.

Se usar hash:
- evite carregar arquivo enorme inteiro
- use estratégia incremental adequada
- diferencie identificação rápida de verificação criptográfica de integridade

Forneça backend PHP executável.

Separe:
- upload
- vínculo ao formulário
- commit da operação
- limpeza de órfãos

Todas as partes recebidas não significam operação de negócio concluída.

Implemente consistência com concorrência e retries no backend.

Defina finalização atômica ou estratégia equivalente que evite arquivo final parcialmente montado.

==================================================
16. PROCESSAMENTO DEMORADO NO SERVIDOR
==================================================

Suporte opcional a HTTP 202/jobId.

Protocolo:
- envio retorna identificador
- consulta de status
- queued
- processing
- succeeded
- failed
- canceled quando suportado
- resultado final
- falha final
- polling configurável
- cancelamento da observação
- timeout
- recuperação após interrupção

Cancelar polling não significa cancelar o trabalho.

Não invente percentual se o backend não informar.

Polling não pode sobrepor requisições.

Defina término da observação e liberação de recursos.

Se houver exemplo de worker, forneça-o e documente execução.

==================================================
17. RETRIES E IDEMPOTÊNCIA
==================================================

Não repetir automaticamente POST de criação após resultado desconhecido.

Defina:
- operações repetíveis
- comportamento por status
- backoff
- limite
- Retry-After
- idempotência quando suportada
- retry de chunk versus retry de negócio
- mensagem para resultado desconhecido

O cliente sozinho não garante idempotência: o backend precisa participar.

==================================================
18. ERROS DO BACKEND
==================================================

Contrato padrão:

{
    "success": false,
    "mensagem": "Confira os campos.",
    "errors": {
        "email": ["Este e-mail já está cadastrado."],
        "documentos": ["Envie um documento."],
        "documentos.1": ["Arquivo inválido."]
    },
    "data": null
}

Suporte:
- message e mensagem
- string e array de mensagens
- HTTP 422
- HTTP 200 com success:false
- erros gerais
- campo inexistente na UI
- nomes com arrays
- caminhos em notação de ponto
- arquivos individuais
- adaptadores Joomla/Laravel
- request_id para diagnóstico

Erro sem input correspondente deve aparecer no resumo.

Defina limpeza de erro de servidor quando o campo muda.

Não aplique resposta antiga a valores novos sem política explícita.

Para grupos dinâmicos, preserve associação correta mesmo quando linhas forem removidas ou reordenadas.

==================================================
19. ALPINE E DOM DINÂMICO
==================================================

Implemente:
- Alpine.plugin
- diretiva x-form
- API mágica pública quando necessária
- alpine:init no uso por script
- x-if e x-for
- descoberta de campos
- remoção com limpeza
- prevenção de inicialização duplicada
- destroy explícito
- cancelamento ao destruir
- remoção de listeners
- limpeza de timers e previews
- isolamento
- nomes de campos sem seletores inseguros

Use event delegation e MutationObserver somente quando adequados.

Não observe todo o documento sem necessidade.

Não exponha dados sensíveis em stores globais.

Defina funcionamento com campos associados pelo atributo form fora da árvore DOM do formulário.

==================================================
20. API PÚBLICA E EXTENSÕES
==================================================

Implemente APIs equivalentes a:

- validate()
- validateField(name)
- submit()
- cancel()
- reset()
- resetValidation()
- setValue(name, value, options?)
- getValue(name, options?)
- getValues(options?)
- setErrors(errors)
- clearErrors(name?)
- refresh()
- destroy()
- addFiles(name, files)
- removeFile(name, fileId)

Para chunks:
- pauseUpload()
- resumeUpload()
- getUploadSession()

Defina:
- retornos
- Promises
- erros
- estados permitidos
- comportamento de chamadas simultâneas

Extensões:
- validator
- normalizer
- mask
- transport
- response adapter
- UI adapter
- file inspector

Eventos:
- form:ready
- form:change
- form:validating
- form:validated
- form:invalid
- form:before-submit
- form:submit
- form:progress
- form:uploaded
- form:processing
- form:success
- form:error
- form:cancel
- form:reset
- form:destroy

Defina eventos canceláveis e detail.

Não inclua senha ou conteúdo integral de arquivos em eventos por padrão.

==================================================
21. SEGURANÇA
==================================================

Documente e aplique:
- validação de UI não substitui backend
- extensão/MIME informado não garantem conteúdo
- CSRF
- XSS em mensagens e previews
- ausência de eval
- proteção contra prototype pollution
- URLs e redirects não confiáveis
- limites
- ausência de logging sensível por padrão
- não persistir arquivos/passwords em localStorage
- autorização de uploads e sessões
- IDs imprevisíveis vinculados ao usuário
- armazenamento seguro
- nomes de arquivo seguros
- inspeção no servidor
- proteção contra abuso
- limpeza de temporários
- política para conteúdos ativos como HTML/SVG
- política específica para arquivos compactados
- autorização e validação final antes de persistir

Backend demonstrativo não deve ser apresentado automaticamente como pronto para produção.

Identifique claramente o que exige adaptação de autenticação, autorização e infraestrutura.

==================================================
22. BACKEND PHP DE REFERÊNCIA
==================================================

Forneça backend independente de framework para:
- multipart
- erros de validação
- validação remota
- chunks
- status
- finalização
- cancelamento
- processamento assíncrono de exemplo

Informe versão mínima de PHP.

Não use recursos incompatíveis com a versão declarada.

Se o backend principal exigir PHP moderno, forneça guia separado para Joomla 3/PHP 7.0.

Não presuma classes particulares do meu projeto.

Inclua integração de CSRF e contratos Joomla/Laravel.

Não invente fila invisível. Se exigir worker, forneça código e instruções.

Documente:
- upload_max_filesize
- post_max_size
- max_file_uploads
- timeouts
- servidor web/proxy
- diretório temporário
- permissões
- espaço em disco
- limpeza

Não considere HTML MAX_FILE_SIZE uma garantia de segurança.

==================================================
23. PERFORMANCE E COMPATIBILIDADE
==================================================

- Não ler arquivos grandes inteiros desnecessariamente.
- Limitar concorrência.
- Evitar listeners duplicados.
- Módulos opcionais.
- Parsers pesados fora do núcleo.
- Navegadores suportados documentados.
- Fallback real ou erro claro para APIs ausentes.
- Não afirmar compatibilidade sem base verificável.
- Declarar CSP e variantes do Alpine.
- Exemplos devem respeitar a compatibilidade declarada.
- Não prometer suporte a navegador legado apenas porque existe build minificado.

Defina política de suporte e tamanho aproximado dos módulos quando mensurável.

==================================================
24. MÁSCARAS DE INPUT
==================================================

Implemente módulo completo de máscaras integrado à validação e serialização.

As máscaras ficam nos inputs:

<input
    name="cpf"
    data-form-mask="cpf"
    data-form-v="required|cpf"
    data-form-submit-value="raw"
>

Máscara não é validação.

--------------------------------------------------
24.1. REPRESENTAÇÕES E ATRIBUTOS
--------------------------------------------------

Separe:
- raw
- formatted
- canonical
- valor usado na validação
- valor enviado

Atributos:
- data-form-mask
- data-form-mask-pattern
- data-form-mask-placeholder
- data-form-mask-locale
- data-form-mask-currency
- data-form-mask-scale
- data-form-mask-validation-value
- data-form-submit-value

Valores:

data-form-mask-validation-value="raw|formatted|canonical"
data-form-submit-value="raw|formatted|canonical"

Defina defaults por máscara.

Para moeda, canonical pode ser string decimal como "1234.56".

Não converta dinheiro silenciosamente para Number.

Diferencie raw e canonical: remover caracteres não equivale necessariamente a interpretar corretamente um decimal.

--------------------------------------------------
24.2. MÁSCARAS PRONTAS
--------------------------------------------------

Implemente:
- CPF
- CNPJ
- CPF/CNPJ dinâmico
- CEP
- telefone fixo
- celular
- telefone brasileiro dinâmico
- cartão com padrões configuráveis
- data
- hora
- mês/ano
- inteiro
- decimal
- moeda
- percentual
- padrão personalizado

Exemplos:

<input
    name="documento"
    data-form-mask="cpf_cnpj"
    data-form-v="required|cpf_cnpj"
    data-form-submit-value="raw"
>

<input
    name="telefone"
    data-form-mask="telefone_br"
    data-form-v="required|telefone"
    data-form-submit-value="raw"
>

<input
    name="valor"
    type="text"
    inputmode="decimal"
    data-form-mask="currency"
    data-form-mask-locale="pt-BR"
    data-form-mask-currency="BRL"
    data-form-mask-scale="2"
    data-form-v="required|numeric|min_value:0.01"
    data-form-mask-validation-value="canonical"
    data-form-submit-value="canonical"
>

Não presuma que toda bandeira de cartão usa o mesmo comprimento.

Não registre nem persista dados de cartão nos exemplos.

Máscaras de datas não substituem parsing estrito.

--------------------------------------------------
24.3. PADRÕES PERSONALIZADOS
--------------------------------------------------

Exemplo:

<input
    name="codigo"
    data-form-mask="pattern"
    data-form-mask-pattern="AAA-9999"
    data-form-v="required|pattern"
    data-form-pattern="^[A-Z]{3}-[0-9]{4}$"
>

Defina tokens, por exemplo:
- 9: dígito
- A: letra
- *: alfanumérico

Documente:
- literais
- escape
- partes opcionais se suportadas
- transformação de caixa
- caracteres inválidos
- preenchimento incompleto

Não documente recursos não implementados.

--------------------------------------------------
24.4. DIGITAÇÃO E CURSOR
--------------------------------------------------

Trate:
- input
- beforeinput quando adequado
- paste
- cut
- Backspace
- Delete
- edição no meio
- substituição de seleção
- selecionar tudo
- undo/redo com limitações documentadas
- IME
- mobile
- autofill
- valores iniciais do servidor
- atualização por API
- reset
- troca dinâmica de máscara

Preserve cursor e seleção quando o input permitir.

Não implemente somente digitação no final.

Não use type="number" para máscaras que exigem apresentação e controle de seleção incompatíveis.

Use inputmode adequado.

Defina:
- zeros iniciais
- números negativos
- separadores
- valores colados
- valores incompletos

--------------------------------------------------
24.5. INTEGRAÇÃO
--------------------------------------------------

- Validação recebe representação configurada.
- FormData e JSON recebem representação configurada.
- Não alterar visualmente o input para serializar e depois restaurar.
- Não criar hidden duplicado com mesmo name.
- Não perder valores repetidos.
- setValue deve aceitar representação de entrada.
- getValue deve permitir solicitar representação.
- Atualização por API sincroniza máscara e dependências.
- Formatação inicial não marca dirty.
- Não gerar loop de eventos.
- Reset restaura valor e apresentação.
- Destroy limpa recursos.

--------------------------------------------------
24.6. IMPLEMENTAÇÃO E DEPENDÊNCIAS
--------------------------------------------------

Módulo opcional e extensível.

Pode utilizar biblioteca especializada, desde que:
- escolha justificada
- versão e licença declaradas
- dependência explícita
- adaptador declarativo
- sem configuração manual por campo
- sem apresentar código terceiro como implementação própria
- comportamento testado

Se implementar motor próprio, não entregue regex simples como motor completo.

--------------------------------------------------
24.7. TESTES DE MÁSCARAS
--------------------------------------------------

Cubra:
- CPF/CNPJ
- transição dinâmica
- telefone fixo/celular
- colagem formatada e bruta
- edição no meio
- exclusão perto de literais
- seleção
- valores iniciais
- zeros iniciais
- negativos
- moeda pt-BR
- precisão decimal
- IME
- reset
- setValue/getValue
- serialização
- ausência de duplicação
- validação remota
- destroy
- cursor em navegador real

Forneça exemplo executável com CPF/CNPJ, telefone, CEP, moeda e padrão personalizado.

==================================================
25. TESTES GERAIS
==================================================

Forneça:
- testes unitários
- integração
- E2E quando aplicável

Cubra:
- parser
- configurações inválidas
- mensagens
- tipos de campo
- zero/false/arrays
- datas
- dependências
- ciclos
- async fora de ordem
- cancelamento
- DOM dinâmico
- múltiplos formulários
- nomes repetidos
- submitter
- remoção de arquivos
- cleanup de URLs
- erro sem campo correspondente
- 200 com success:false
- 204
- HTML inesperado
- timeout
- submit duplicado
- progresso indeterminado
- upload concluído aguardando resposta
- retry de chunks
- progresso sem dupla contagem
- retomada
- sessão expirada
- finalização falha
- polling
- reset
- destroy
- segurança de mensagens
- acessibilidade
- máscaras

Diferencie testes mockados de testes reais.

Não diga “testes passaram” sem executá-los.

Forneça comandos reproduzíveis.

Inclua testes de backend para concorrência, autorização, finalização e limpeza de uploads quando aplicável.

==================================================
26. ENTREGÁVEIS
==================================================

Entregue:

1. Resumo curto da arquitetura.
2. Contrato final de atributos HTML.
3. Estrutura de diretórios.
4. Código completo.
5. package.json.
6. Configuração de build.
7. Entrada ESM.
8. Build por script gerado pelo build.
9. CSS mínimo opcional.
10. Adaptador Bootstrap.
11. Módulo de máscaras.
12. Backend PHP.
13. Testes.
14. README.
15. Guia de integração.
16. Guia de extensão.
17. Tabela de limitações.
18. Matriz requisito → módulo → teste.
19. Exemplos executáveis.
20. Instruções de build, execução e testes.

Exemplos obrigatórios:
- cadastro com validação ao vivo
- campos condicionais
- senha e confirmação
- validação remota
- radios/checkboxes/select múltiplo
- linhas repetidas
- arquivo único
- múltiplos arquivos com remoção
- imagem e preview
- CSV por amostragem
- edição com arquivos existentes
- upload grande com progresso e cancelamento
- chunks com pausa/retomada
- processamento após upload
- erros Joomla/Laravel
- máscaras CPF/CNPJ/telefone/CEP/moeda/padrão

Use endpoints do backend de referência, não URLs públicas fictícias.

Se uma dependência externa for opcional, o exemplo deve informar como instalá-la ou carregá-la.

==================================================
27. CRITÉRIOS DE ACEITE
==================================================

O projeto só está concluído quando:

- Regras e mensagens ficam nos inputs.
- Não é necessário registrar cada campo em JavaScript.
- Erros aparecem automaticamente.
- Validação ao vivo funciona.
- Condições e dependências funcionam.
- Async não aplica resposta obsoleta.
- Campos dinâmicos funcionam.
- Arquivos removidos não são enviados.
- Barra utiliza progresso real.
- 100% enviado não é confundido com concluído.
- Cancelamento e timeout funcionam.
- Chunks têm backend funcional.
- Retomada respeita limitações do navegador.
- Processamento posterior possui protocolo real.
- Erros do backend são associados corretamente.
- Erros sem input aparecem no resumo.
- Múltiplos formulários são isolados.
- Máscaras são declaradas nos inputs.
- raw/formatted/canonical são separados.
- Cursor e seleção são preservados nos casos suportados.
- Colagem e edição no meio funcionam.
- Validação e envio usam representações configuradas.
- Aplicar máscara não substitui validação.
- Máscaras funcionam com valores iniciais, API, reset e destroy.
- Recursos são limpos ao remover componentes.
- Exemplos usam APIs realmente implementadas.
- Não existem funções vazias, TODOs essenciais ou imports ausentes.
- Build e testes são reproduzíveis.
- Limitações são declaradas claramente.
- Módulos opcionais não tornam o núcleo inutilizável.
- Nenhuma funcionalidade difícil é substituída apenas por descrição.

==================================================
28. COMO EXECUTAR A TAREFA
==================================================

Se houver ambiente de arquivos e execução:
- crie o projeto
- escreva arquivos
- instale dependências quando permitido
- execute build
- execute testes
- corrija erros
- informe o que foi executado e o que não foi

Se responder somente por texto:
- apresente arquivos com caminhos
- entregue conteúdo completo
- não use “restante igual”
- não finja execução

Se exceder o limite da resposta:
- divida em etapas coerentes
- entregue arquivos completos por etapa
- mantenha checklist de entregue e pendente
- mantenha etapas executáveis
- não declare conclusão antecipada
- não substitua módulos difíceis por explicações
- indique exatamente a próxima etapa
- preserve o contrato entre etapas

Antes de implementar:
1. Congele o contrato dos atributos e APIs.
2. Identifique decisões de arquitetura e dependências.
3. Declare limitações e requisitos de infraestrutura.
4. Apresente a estrutura de diretórios.
5. Inicie a implementação.

Não faça perguntas desnecessárias para adiar o desenvolvimento. Quando houver escolha não crítica, adote um default razoável e documente.

Quando uma ambiguidade afetar segurança ou compatibilidade, declare a decisão e suas consequências.

Não me devolva somente uma análise.

Desenvolva a biblioteca completa, com código funcional, exemplos, backend, build, testes e documentação.