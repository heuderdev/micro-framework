/**
 * Módulo opcional de autopreenchimento: quando um campo fica completo, busca dados na API e preenche
 * outros campos do formulário.
 *
 *   <input name="cep" data-form-mask="cep"
 *          data-form-preencher="/api/cep/{cep}"
 *          data-form-preencher-campos="logradouro, bairro, localidade:cidade, uf"
 *          data-form-preencher-minimo="8">
 *
 * {campo} é trocado pelo valor bruto do campo (com máscara: só o que foi digitado, ex.: CEP sem traço), codificado.
 * data-form-preencher-campos: "chaveDaResposta:campoDoFormulario" separados por vírgula; sem ":" o nome é o
 * mesmo; chaves aninhadas com ponto (endereco.rua:logradouro).
 *
 * Regras:
 * - só busca quando o valor de envio tem o mínimo de caracteres (data-form-preencher-minimo) e não tem erro
 *   de validação; espera a digitação parar; requisição anterior cancelada, resposta antiga descartada;
 * - nunca apaga o que a pessoa digitou: só preenche campo vazio ou que ainda tem o valor que o próprio
 *   módulo colocou (data-form-preencher-sobrescrever para sempre substituir);
 * - selects com data-form-opcoes (módulo de opções) recebem o valor quando a lista deles chegar;
 * - "não encontrado" (404, success:false, { erro: true }) vira erro no campo de origem;
 * - URL só da mesma origem, exceto origens liberadas explicitamente (AlpineForm.preencher.permitirOrigem)
 *   ou serviços prontos (data-form-preencher="viacep" | "brasilapi-cnpj" | "brasilapi-cep"); para outras
 *   origens não vão cookies nem cabeçalhos próprios.
 * Usa só a API recebida no plugin (não importa o núcleo).
 */

export const PREENCHER_EVENTOS = {
    preenchido: 'form:preenchido',
    erro: 'form:preencher-erro',
}

const ATRIBUTOS = [
    'data-form-preencher',
    'data-form-preencher-campos',
    'data-form-preencher-minimo',
    'data-form-preencher-debounce',
    'data-form-preencher-sobrescrever',
    'data-form-preencher-nao-encontrado',
    'data-form-preencher-estado',
]

const ESPERA_PADRAO = 400
const TIMEOUT_MS = 10000
const PLACEHOLDER = /\{([^{}]+)\}/g

/** Serviços prontos: URL e como reconhecer "não encontrado". */
const SERVICOS = new Map([
    ['viacep', { url: 'https://viacep.com.br/ws/{campo}/json/', minimo: 8, naoEncontrado: json => json && json.erro !== undefined && json.erro !== false }],
    ['brasilapi-cep', { url: 'https://brasilapi.com.br/api/cep/v1/{campo}', minimo: 8 }],
    ['brasilapi-cnpj', { url: 'https://brasilapi.com.br/api/cnpj/v1/{campo}', minimo: 14 }],
])

const origensPermitidas = new Set()
const isObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const CHAVES_PROIBIDAS = new Set(['__proto__', 'prototype', 'constructor'])

/** "logradouro, bairro, localidade:cidade" → [['logradouro','logradouro'], ...] */
export function lerMapa(texto, ConfigError, campo) {
    const pares = []
    for (const parte of String(texto || '').split(',')) {
        const item = parte.trim()
        if (!item) continue
        const [origem, destino = origem] = item.split(':').map(t => t.trim())
        if (!origem || !destino || item.split(':').length > 2) {
            throw new ConfigError(`data-form-preencher-campos do campo "${campo}" tem um item inválido: "${item}". Use "chave:campo" separados por vírgula.`)
        }
        if (origem.split('.').some(p => CHAVES_PROIBIDAS.has(p))) throw new ConfigError(`data-form-preencher-campos do campo "${campo}" usa uma chave proibida: "${origem}".`)
        pares.push([origem, destino])
    }
    if (!pares.length) throw new ConfigError(`data-form-preencher do campo "${campo}" exige data-form-preencher-campos (ex.: "logradouro, bairro, localidade:cidade, uf").`)
    return pares
}

/** Lê "a.b.c" de um objeto (apenas propriedades próprias). */
export function lerCaminho(obj, caminho) {
    let atual = obj
    for (const parte of caminho.split('.')) {
        if (!isObjeto(atual) || !Object.prototype.hasOwnProperty.call(atual, parte)) return undefined
        atual = atual[parte]
    }
    return atual
}

/** Desembrulha { success, data } e { data: {...} }; devolve null para "não encontrado". */
export function extrairDados(json, naoEncontrado) {
    if (naoEncontrado && naoEncontrado(json)) return null
    let corpo = json
    if (isObjeto(corpo) && typeof corpo.success === 'boolean') {
        if (!corpo.success) return null
        corpo = corpo.data
    }
    if (isObjeto(corpo) && isObjeto(corpo.data) && Object.keys(corpo).every(k => ['data', 'meta', 'links', 'message'].includes(k))) corpo = corpo.data
    if (Array.isArray(corpo)) corpo = corpo[0]
    if (!isObjeto(corpo)) return null
    if (corpo.erro === true || corpo.erro === 'true') return null
    return corpo
}

function lerDuracao(texto, padrao, ConfigError, attr) {
    if (texto === null || texto === undefined) return padrao
    const m = /^(\d+)\s*(ms|s)?$/.exec(String(texto).trim())
    if (!m) throw new ConfigError(`Duração inválida em ${attr}="${texto}". Use 400, 400ms ou 1s.`)
    return Number(m[1]) * (m[2] === 's' ? 1000 : 1)
}

class Preenchedor {
    constructor(ext, field) {
        this.ext = ext
        this.controller = ext.controller
        this.field = field
        this.el = field.primary
        this.timer = null
        this.abort = null
        this.token = 0
        this.ultimoValor = null           // valor do campo na última busca (não repete a mesma)
        this.preenchidos = new Map()      // campo → valor que este módulo colocou
        this.carregando = false
        this.config()
    }

    config() {
        const { ConfigError } = this.ext
        const el = this.el
        const nome = this.field.name
        const alvo = (el.getAttribute('data-form-preencher') || '').trim()
        if (!alvo) throw new ConfigError(`data-form-preencher vazio no campo "${nome}". Informe a URL (ex.: /api/cep/{cep}) ou um serviço (viacep, brasilapi-cep, brasilapi-cnpj).`)
        const servico = SERVICOS.get(alvo) || this.ext.servicos.get(alvo) || null
        if (!servico && !alvo.includes('/')) throw new ConfigError(`data-form-preencher="${alvo}" no campo "${nome}": serviço desconhecido. Use uma URL ou ${[...SERVICOS.keys(), ...this.ext.servicos.keys()].join(', ')}.`)
        const minimoAttr = el.getAttribute('data-form-preencher-minimo')
        if (minimoAttr !== null && !/^\d+$/.test(minimoAttr.trim())) throw new ConfigError(`data-form-preencher-minimo="${minimoAttr}" inválido no campo "${nome}". Use um número inteiro.`)
        const sobrescrever = el.getAttribute('data-form-preencher-sobrescrever')
        if (sobrescrever !== null && !['', 'true', 'false', 'data-form-preencher-sobrescrever'].includes(sobrescrever)) {
            throw new ConfigError(`Valor booleano inválido em data-form-preencher-sobrescrever="${sobrescrever}". Use o atributo sem valor, "true" ou "false".`)
        }
        return {
            modelo: servico ? servico.url : alvo,
            servico,
            mapa: lerMapa(el.getAttribute('data-form-preencher-campos'), ConfigError, nome),
            minimo: minimoAttr !== null ? Number(minimoAttr) : servico?.minimo ?? 1,
            espera: lerDuracao(el.getAttribute('data-form-preencher-debounce'), ESPERA_PADRAO, ConfigError, 'data-form-preencher-debounce'),
            sobrescrever: sobrescrever !== null && sobrescrever !== 'false',
            mensagem: el.getAttribute('data-form-preencher-nao-encontrado') || this.ext.AlpineForm.messages['preencher.nao_encontrado'],
        }
    }

    valorAtual() {
        let v = this.field.disabled ? '' : this.field.getValue('raw')
        if (v === null || v === undefined || v === false || Array.isArray(v)) v = ''
        return String(v).trim()
    }

    montarUrl(cfg, valor) {
        const { ConfigError } = this.ext
        const url = cfg.modelo.replace(PLACEHOLDER, (_, nome) => {
            const chave = nome.trim()
            if (cfg.servico || chave === 'campo') return encodeURIComponent(valor)
            const campo = this.controller.resolveField(chave)
            if (!campo) throw new ConfigError(`data-form-preencher do campo "${this.field.name}" cita {${chave}}, que não existe neste formulário.`)
            let v = campo === this.field ? valor : campo.getValue('raw')
            if (v === null || v === undefined || Array.isArray(v)) v = ''
            return encodeURIComponent(String(v))
        })
        const absoluta = new URL(url, document.baseURI)
        const mesma = absoluta.origin === location.origin
        if (!mesma && !cfg.servico && !origensPermitidas.has(absoluta.origin)) {
            throw new ConfigError(`data-form-preencher do campo "${this.field.name}" aponta para outra origem (${absoluta.origin}). Use um endpoint do próprio site ou libere com AlpineForm.preencher.permitirOrigem('${absoluta.origin}').`)
        }
        return { url: absoluta.href, mesma }
    }

    /** O campo mudou: agenda a busca se o valor estiver completo e válido. */
    aoMudar(gatilho) {
        clearTimeout(this.timer)
        let cfg
        try {
            cfg = this.config()
        } catch (error) {
            this.ext.falhaConfig(error, this.field)
            return
        }
        const valor = this.valorAtual()
        if (valor.length < cfg.minimo) {
            this.abort?.abort()
            this.ultimoValor = null
            this.definirEstado(null)
            return
        }
        if (valor === this.ultimoValor) return
        const espera = gatilho === 'api' || gatilho === 'change' ? 0 : cfg.espera
        this.timer = setTimeout(() => this.buscar(cfg), espera)
    }

    async buscar(cfg = this.config(), { forcar = false } = {}) {
        const valor = this.valorAtual()
        if (valor.length < cfg.minimo || (!forcar && valor === this.ultimoValor)) return false
        // não busca com valor inválido (CEP/CNPJ com dígito errado): valida o próprio campo antes
        const resultado = await this.controller.validateField(this.field, { trigger: 'api', remoteDebounce: false })
        if (resultado && resultado.valid === false) return false
        if (valor !== this.valorAtual()) return false

        let destino
        try {
            destino = this.montarUrl(cfg, valor)
        } catch (error) {
            this.ext.falhaConfig(error, this.field)
            return false
        }
        this.abort?.abort()
        const controle = new AbortController()
        this.abort = controle
        const token = ++this.token
        this.ultimoValor = valor
        this.carregando = true
        this.definirEstado('carregando')
        const AF = this.ext.AlpineForm
        const registro = AF.registry
        const transporte = registro.get('transport', registro.has('transport', 'preencher') ? 'preencher' : 'fetch')
        let dados
        let status = null
        try {
            const raw = await transporte({
                url: destino.url,
                method: 'GET',
                headers: destino.mesma ? { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } : { Accept: 'application/json' },
                body: null,
                credentials: destino.mesma ? 'same-origin' : 'omit',
                timeout: TIMEOUT_MS,
                signal: controle.signal,
            })
            if (token !== this.token) return false
            status = raw.status
            if (raw.status === 404 || raw.status === 400 || raw.status === 422) dados = null
            else if (raw.status < 200 || raw.status >= 300) throw Object.assign(new Error(`HTTP ${raw.status}`), { status: raw.status })
            else {
                const corpo = AF.internals.parseBody(raw)
                if (corpo.type !== 'json') throw Object.assign(new Error('Resposta não é JSON.'), { status: raw.status })
                dados = extrairDados(corpo.json, cfg.servico?.naoEncontrado)
            }
        } catch (error) {
            if (token !== this.token || this.ext.destruido) return false
            if (error?.name === 'AbortError' || error?.kind === 'abort') return false
            this.carregando = false
            this.ultimoValor = null     // falha de rede/servidor: permite tentar de novo com o mesmo valor
            this.definirEstado('erro')
            this.controller.log('error', `Falha no autopreenchimento de "${this.field.name}":`, error?.message)
            this.ext.form.dispatchEvent(new CustomEvent(PREENCHER_EVENTOS.erro, { bubbles: true, detail: { name: this.field.name, status: error?.status ?? null, motivo: 'falha' } }))
            return false
        }
        if (token !== this.token || this.ext.destruido || valor !== this.valorAtual()) return false
        this.carregando = false
        if (!dados) {
            this.definirEstado('nao-encontrado')
            this.controller.setErrors({ [this.field.key]: [cfg.mensagem] }, { replace: false })
            this.ext.form.dispatchEvent(new CustomEvent(PREENCHER_EVENTOS.erro, { bubbles: true, detail: { name: this.field.name, status, motivo: 'nao-encontrado' } }))
            return false
        }
        const campos = this.preencher(cfg, dados)
        this.definirEstado('pronto')
        this.ext.form.dispatchEvent(new CustomEvent(PREENCHER_EVENTOS.preenchido, { bubbles: true, detail: { name: this.field.name, campos } }))
        return true
    }

    /** Aplica os valores mapeados respeitando o que a pessoa digitou. */
    preencher(cfg, dados) {
        const { ConfigError } = this.ext
        const preenchidos = []
        const opcoes = this.ext.AlpineForm.opcoes
        for (const [chave, nomeCampo] of cfg.mapa) {
            const campo = this.controller.resolveField(nomeCampo)
            if (!campo) {
                this.ext.falhaConfig(new ConfigError(`data-form-preencher-campos do campo "${this.field.name}" cita "${nomeCampo}", que não existe neste formulário.`), this.field)
                continue
            }
            if (campo === this.field || campo.kind === 'file' || campo.sensitive || (campo.disabled && !campo.primary?.hasAttribute('data-form-opcoes'))) continue
            let valor = lerCaminho(dados, chave)
            if (valor === undefined || valor === null || isObjeto(valor) || Array.isArray(valor)) continue
            valor = String(valor)
            const atual = campo.getValue('display')
            const atualTexto = Array.isArray(atual) ? atual.join(',') : atual === null || atual === undefined ? '' : String(atual)
            const nossoAnterior = this.preenchidos.get(campo.key)
            if (!cfg.sobrescrever && atualTexto !== '' && atualTexto !== nossoAnterior) continue   // a pessoa digitou: não mexe
            if (opcoes?.controla?.(this.ext.form, campo.name)) {
                opcoes.selecionar(this.ext.form, campo.name, valor)
            } else {
                try {
                    this.controller.setValue(campo, valor, { validate: campo.state.validated ? true : null })
                } catch {
                    continue
                }
            }
            this.preenchidos.set(campo.key, valor)
            preenchidos.push(campo.name)
        }
        return preenchidos
    }

    definirEstado(estado) {
        if (estado === null) {
            if (this.el.hasAttribute('data-form-preencher-estado')) this.el.removeAttribute('data-form-preencher-estado')
        } else if (this.el.getAttribute('data-form-preencher-estado') !== estado) this.el.setAttribute('data-form-preencher-estado', estado)
        if (estado === 'carregando') {
            if (this.el.getAttribute('aria-busy') !== 'true') this.el.setAttribute('aria-busy', 'true')
        } else if (this.el.hasAttribute('aria-busy')) this.el.removeAttribute('aria-busy')
    }

    destroy() {
        clearTimeout(this.timer)
        this.abort?.abort()
        this.token++
        this.el.removeAttribute('data-form-preencher-estado')
        this.el.removeAttribute('aria-busy')
    }
}

class PreencherExtension {
    constructor(controller, AlpineForm, servicos) {
        this.controller = controller
        this.form = controller.form
        this.AlpineForm = AlpineForm
        this.ConfigError = AlpineForm.errors.ConfigError
        this.servicos = servicos
        this.itens = new Map()   // Field → Preenchedor
        this.removers = []
        this.destruido = false
        const on = (type, handler) => {
            this.form.addEventListener(type, handler)
            this.removers.push(() => this.form.removeEventListener(type, handler))
        }
        on('form:ready', () => this.sincronizar())
        on('form:field-added', () => this.sincronizar())
        on('form:field-removed', () => this.sincronizar())
        on('form:change', event => {
            for (const p of this.itens.values()) if (p.field.name === event.detail?.name) p.aoMudar(event.detail?.trigger)
        })
        on('form:reset', () => {
            for (const p of this.itens.values()) {
                p.ultimoValor = null
                p.preenchidos.clear()
                p.definirEstado(null)
            }
        })
    }

    falhaConfig(error, field) {
        if (!(error && (error.kind === 'config' || error.name === 'ConfigError'))) throw error
        if (field.configError?.message === error.message) return
        field.configError = error
        field.state.configError = error.message
        const erros = this.controller.state.configErrors.filter(e => e.field !== field.key)
        this.controller.state.configErrors = [...erros, { field: field.key, message: error.message }]
        this.controller.log('error', `Campo "${field.name}":`, error.message, field.primary)
        this.form.dispatchEvent(new CustomEvent('form:config-error', { bubbles: true, detail: { errors: this.controller.state.configErrors.slice() } }))
    }

    sincronizar() {
        if (this.destruido) return
        const vivos = new Set()
        for (const field of this.controller.fields.values()) {
            if (!field.primary?.hasAttribute?.('data-form-preencher')) continue
            vivos.add(field)
            if (this.itens.has(field)) continue
            try {
                this.itens.set(field, new Preenchedor(this, field))
            } catch (error) {
                this.falhaConfig(error, field)
            }
        }
        for (const [field, p] of this.itens) {
            if (!vivos.has(field)) {
                p.destroy()
                this.itens.delete(field)
            }
        }
    }

    buscar(nome) {
        for (const p of this.itens.values()) {
            if (p.field.name === nome) return p.buscar(undefined, { forcar: true })
        }
        return Promise.resolve(false)
    }

    destroy() {
        this.destruido = true
        for (const p of this.itens.values()) p.destroy()
        this.itens.clear()
        for (const remove of this.removers) remove()
        this.removers = []
    }
}

/**
 * Módulo opcional de autopreenchimento.
 *   ESM:    import preencher from 'alpine-form/preencher'; AlpineForm.use(preencher)
 *   script: <script src="alpine-form-preencher.min.js"></script> (após alpine-form.min.js, antes do Alpine)
 */
export default function preencherPlugin(AlpineForm) {
    const extensoes = new WeakMap()
    const servicos = new Map()
    AlpineForm.fieldAttributes(ATRIBUTOS)
    if (!AlpineForm.messages['preencher.nao_encontrado']) AlpineForm.messages['preencher.nao_encontrado'] = 'Não encontramos dados para este valor. Confira ou preencha manualmente.'
    AlpineForm.formHook(controller => {
        const ext = new PreencherExtension(controller, AlpineForm, servicos)
        extensoes.set(controller.form, ext)
        return ext
    })
    const resolver = formOuId => (typeof formOuId === 'string' ? document.getElementById(formOuId) : formOuId)
    AlpineForm.preencher = {
        /** Busca agora (mesmo valor já buscado), ex.: botão "Buscar CEP". Resolve true quando preencheu. */
        buscar(formOuId, nome) {
            return extensoes.get(resolver(formOuId))?.buscar(nome) ?? Promise.resolve(false)
        },
        /** Libera uma origem externa para data-form-preencher com URL (ex.: 'https://api.empresa.com.br'). */
        permitirOrigem(origem) {
            const o = new URL(origem).origin
            origensPermitidas.add(o)
            return o
        },
        /** Registra um serviço nomeado: { url: 'https://…/{campo}', minimo, naoEncontrado(json) }. */
        servico(nome, definicao) {
            if (!/^[a-z0-9-]+$/.test(nome)) throw new AlpineForm.errors.ConfigError(`Nome de serviço inválido: "${nome}". Use letras minúsculas, números e hífen.`)
            if (!definicao || typeof definicao.url !== 'string') throw new AlpineForm.errors.ConfigError(`Serviço "${nome}" precisa de { url }.`)
            servicos.set(nome, { url: definicao.url, minimo: definicao.minimo ?? 1, naoEncontrado: definicao.naoEncontrado })
        },
        lerMapa: (texto, campo = '?') => lerMapa(texto, AlpineForm.errors.ConfigError, campo),
        extrairDados,
    }
}
