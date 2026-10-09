export class AlpineFormError extends Error {
    constructor(message, details = {}) {
        super(message)
        this.name = 'AlpineFormError'
        this.details = details
    }
}

/**
 * Erro do desenvolvedor: atributo malformado, regra desconhecida, referência inexistente.
 * Nunca deve aprovar o campo silenciosamente.
 */
export class ConfigError extends AlpineFormError {
    constructor(message, details = {}) {
        super(message, details)
        this.name = 'ConfigError'
        this.kind = 'config'
    }
}

/**
 * Falha que impede concluir uma operação (rede, timeout, leitura de arquivo, resposta inesperada).
 * Não representa valor inválido digitado pelo usuário.
 */
export class OperationalError extends AlpineFormError {
    constructor(message, details = {}) {
        super(message, details)
        this.name = 'OperationalError'
        this.kind = details.kind || 'operational'
    }
}

export class StateError extends AlpineFormError {
    constructor(message, details = {}) {
        super(message, details)
        this.name = 'StateError'
        this.kind = 'state'
    }
}

export class SerializationError extends AlpineFormError {
    constructor(message, details = {}) {
        super(message, details)
        this.name = 'SerializationError'
        this.kind = 'serialization'
    }
}

export class AbortError extends AlpineFormError {
    constructor(message = 'Operação cancelada.', details = {}) {
        super(message, details)
        this.name = 'AbortError'
        this.kind = 'abort'
    }
}

/** Detecção por "kind" (não instanceof): módulos opcionais empacotados separadamente têm cópias das classes. */
export function isConfigError(error) {
    return !!error && (error.kind === 'config' || error.name === 'ConfigError')
}

export function isSerializationError(error) {
    return !!error && (error.kind === 'serialization' || error.name === 'SerializationError')
}

export function isAbort(error) {
    return !!error && (error.name === 'AbortError' || error.kind === 'abort')
}
