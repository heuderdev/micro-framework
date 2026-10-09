import { truncate } from '../lib/utils.js'

/** Mensagens padrão (pt-BR). Chaves "regra.variante" têm prioridade sobre "regra" para o mesmo nível. */
export const DEFAULT_MESSAGES = {
    __fallback: 'Confira o valor de :field.',
    __config: 'Este campo tem uma configuração inválida e não pode ser validado.',

    required: 'O campo :field é obrigatório.',
    'required.choice': 'Selecione uma opção em :field.',
    'required.multiple': 'Selecione ao menos uma opção em :field.',
    'required.checkbox': 'Marque :field para continuar.',
    'required.file': 'Selecione um arquivo em :field.',
    accepted: 'Você precisa aceitar :field.',
    required_if: 'O campo :field é obrigatório.',
    required_unless: 'O campo :field é obrigatório.',
    required_with: 'O campo :field é obrigatório quando :other for informado.',
    required_without: 'O campo :field é obrigatório quando :other não for informado.',

    min: 'Digite pelo menos :min caracteres.',
    'min.numeric': 'O valor mínimo de :field é :min.',
    'min.array': 'Selecione pelo menos :min opções.',
    max: 'Digite no máximo :max caracteres.',
    'max.numeric': 'O valor máximo de :field é :max.',
    'max.array': 'Selecione no máximo :max opções.',
    length: ':field deve ter exatamente :length caracteres.',
    'length.array': 'Selecione exatamente :length opções.',
    min_length: 'Digite pelo menos :min caracteres.',
    max_length: 'Digite no máximo :max caracteres.',
    between: ':field deve ter entre :min e :max caracteres.',
    'between.numeric': ':field deve estar entre :min e :max.',
    'between.array': 'Selecione entre :min e :max opções.',
    email: 'Informe um e-mail válido.',
    url: 'Informe um endereço (URL) válido.',
    pattern: 'O formato de :field é inválido.',
    alpha: 'Use apenas letras em :field.',
    alphanumeric: 'Use apenas letras e números em :field.',
    digits: 'Use apenas dígitos em :field.',
    'digits.length': ':field deve conter exatamente :length dígitos.',
    starts_with: ':field deve começar com: :allowed.',
    ends_with: ':field deve terminar com: :allowed.',
    contains: ':field deve conter: :allowed.',
    in: 'Selecione um valor válido para :field.',
    not_in: 'O valor informado em :field não é permitido.',

    numeric: 'Informe um número válido em :field.',
    integer: 'Informe um número inteiro em :field.',
    decimal: ':field deve ter no máximo :max casas decimais.',
    'decimal.range': ':field deve ter entre :min e :max casas decimais.',
    positive: ':field deve ser maior que zero.',
    negative: ':field deve ser menor que zero.',
    min_value: 'O valor mínimo de :field é :min.',
    max_value: 'O valor máximo de :field é :max.',
    multiple_of: ':field deve ser múltiplo de :step.',

    same: ':field deve ser igual a :other.',
    different: ':field deve ser diferente de :other.',
    greater_than: ':field deve ser maior que :other.',
    greater_or_equal: ':field deve ser maior ou igual a :other.',
    less_than: ':field deve ser menor que :other.',
    less_or_equal: ':field deve ser menor ou igual a :other.',

    date: 'Informe uma data válida em :field.',
    'date.datetime': 'Informe data e hora válidas em :field.',
    'date.time': 'Informe um horário válido em :field.',
    'date.month': 'Informe um mês válido em :field.',
    'date.week': 'Informe uma semana válida em :field.',
    before: ':field deve ser anterior a :other.',
    after: ':field deve ser posterior a :other.',
    before_or_equal: ':field deve ser igual ou anterior a :other.',
    after_or_equal: ':field deve ser igual ou posterior a :other.',
    date_between: ':field deve estar entre :min e :max.',

    cpf: 'Informe um CPF válido.',
    cnpj: 'Informe um CNPJ válido.',
    cpf_cnpj: 'Informe um CPF ou CNPJ válido.',
    cep: 'Informe um CEP válido (8 dígitos).',
    telefone: 'Informe um telefone válido com DDD.',
    'telefone.celular': 'Informe um celular válido com DDD.',
    'telefone.fixo': 'Informe um telefone fixo válido com DDD.',
    luhn: 'Número de cartão inválido.',
    card: 'Número de cartão inválido.',

    files_min: 'Envie pelo menos :min arquivo(s).',
    files_max: 'Envie no máximo :max arquivo(s).',
    file_min: 'O arquivo :file deve ter pelo menos :min.',
    file_max: 'O arquivo :file excede o limite de :max.',
    files_total_max: 'O total dos arquivos excede :max.',
    ext: 'O arquivo :file deve ter uma das extensões: :allowed.',
    mime: 'O tipo do arquivo :file não é permitido (:allowed).',
    non_empty_file: 'O arquivo :file está vazio.',
    image: 'O arquivo :file não é uma imagem válida.',
    'image.decode': 'Não foi possível ler a imagem :file neste navegador.',
    width_min: 'A imagem :file deve ter largura mínima de :min px.',
    width_max: 'A imagem :file deve ter largura máxima de :max px.',
    height_min: 'A imagem :file deve ter altura mínima de :min px.',
    height_max: 'A imagem :file deve ter altura máxima de :max px.',
    dimensions: 'A imagem :file deve ter :width x :height px.',
    aspect_ratio: 'A imagem :file deve ter proporção :ratio.',

    remote: 'Este valor não está disponível.',
    pending: 'Verificando...',
    'remote.inconclusive': 'Não foi possível verificar agora. O valor será conferido no envio.',
    'remote.error': 'Não foi possível verificar este valor agora.',

    'submit.network': 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
    'submit.timeout': 'O servidor demorou demais para responder.',
    'submit.unknown': 'A conexão caiu depois do envio. Não é possível confirmar se a operação foi concluída; verifique antes de enviar novamente.',
    'submit.auth': 'Sua sessão expirou ou você não tem permissão. Entre novamente e tente outra vez.',
    'submit.forbidden': 'Você não tem permissão para realizar esta operação.',
    'submit.csrf': 'O token de segurança expirou. Recarregue a página e tente novamente.',
    'submit.too_large': 'Os dados enviados excedem o limite aceito pelo servidor.',
    'submit.rate_limited': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'submit.server': 'O servidor encontrou um erro. Tente novamente mais tarde.',
    'submit.http': 'O servidor respondeu com um erro (HTTP :status).',
    'submit.validation': 'Confira os campos destacados.',
    'submit.logical': 'Não foi possível concluir a operação.',
    'submit.html': 'O servidor respondeu com uma página HTML em vez de dados. Isso costuma indicar sessão expirada, redirecionamento para login ou erro de proxy.',
    'submit.parse': 'A resposta do servidor não pôde ser interpretada.',
    'submit.changed': 'Os dados foram alterados durante a validação. Revise e envie novamente.',
    'submit.config': 'O formulário possui erros de configuração e não pode ser enviado.',
    'submit.serialization': 'Não foi possível preparar os dados para envio.',
    'submit.cors': 'A requisição foi bloqueada pelo navegador (possível bloqueio de CORS ou rede).',
    'job.failed': 'O processamento no servidor falhou.',
    'job.timeout': 'O processamento está demorando mais que o esperado. Consulte o status mais tarde.',
    'job.canceled': 'O processamento foi cancelado.',
    'status.validating': 'Validando…',
    'status.uploading': 'Enviando…',
    'status.uploading_percent': 'Enviando… :percent%',
    'status.awaiting': 'Envio concluído. Aguardando resposta do servidor…',
    'status.processing': 'Processando no servidor…',
    'status.processing_percent': 'Processando no servidor… :percent%',
    'status.success': 'Concluído.',
    'status.error': 'Não foi possível concluir o envio.',
    'status.canceled': 'Envio cancelado.',
    'status.paused': 'Envio pausado.',
    'status.observation_stopped': 'Acompanhamento encerrado. O processamento pode continuar no servidor.',
    'summary.title': 'Corrija os itens abaixo:',
    'upload.expired': 'A sessão de upload expirou. O envio será reiniciado.',
    'upload.failed': 'Falha ao enviar o arquivo :file.',
}

export function interpolate(template, vars) {
    return String(template).replace(/:([a-z_]+)/g, (match, key) => {
        if (!Object.prototype.hasOwnProperty.call(vars, key)) return match
        const value = vars[key]
        return value == null ? '' : String(value)
    })
}

/**
 * Precedência:
 *  1. data-form-msg.<regra> do campo
 *  2. data-form-msg do campo
 *  3. mensagens configuradas (configure/x-form) para "regra.variante" e "regra"
 *  4. padrão da biblioteca para "regra.variante" e "regra"
 */
export function resolveMessage({ rule, variant, fieldMessages = {}, genericMessage = null, configMessages = {}, vars = {} }) {
    const keys = variant ? [`${rule}.${variant}`, rule] : [rule]
    let template = null
    if (fieldMessages[rule] != null) template = fieldMessages[rule]
    else if (genericMessage != null && rule !== 'pending') template = genericMessage
    else {
        for (const key of keys) {
            if (configMessages[key] != null) {
                template = configMessages[key]
                break
            }
        }
        if (template == null) {
            for (const key of keys) {
                if (DEFAULT_MESSAGES[key] != null) {
                    template = DEFAULT_MESSAGES[key]
                    break
                }
            }
        }
    }
    if (template == null) template = DEFAULT_MESSAGES.__fallback
    return interpolate(template, vars)
}

export function safeValuePlaceholder(value, sensitive) {
    if (sensitive) return ''
    if (value == null) return ''
    if (Array.isArray(value)) return truncate(value.map(v => (typeof v === 'object' ? v?.name ?? '' : v)).join(', '), 60)
    if (typeof value === 'object') return ''
    return truncate(value, 60)
}
