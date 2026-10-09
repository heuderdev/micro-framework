/**
 * Pontos de integração preenchidos por módulos opcionais.
 * O núcleo funciona sem eles; atributos que dependem de um módulo ausente geram ConfigError.
 */
export const services = {
    maskProvider: null,
    chunks: null,
    Alpine: null,
}

export function setMaskProvider(provider) {
    services.maskProvider = provider
}

export function setChunkService(service) {
    services.chunks = service
}
