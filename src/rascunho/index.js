/**
 * Módulo opcional de rascunho automático: guarda os campos do formulário no navegador enquanto a
 * pessoa preenche e restaura ao reabrir a página.
 *
 *   <form id="cadastro" x-data x-form data-form-rascunho ...>              guarda por 7 dias (localStorage)
 *   <form id="cadastro" x-data x-form data-form-rascunho="2" ...>          guarda por 2 dias
 *   <form id="cadastro" x-data x-form data-form-rascunho data-form-rascunho-sessao ...>
 *                                                                          sessionStorage: some ao fechar a aba
 *   <input name="obs" data-form-rascunho-ignorar>                          campo fora do rascunho
 *
 * Nunca guarda senhas, campos data-form-sensitive, arquivos nem campos com data-form-rascunho-ignorar.
 * Respeita storage: 'none' (AlpineForm.configure ou data-form-storage): nesse caso não lê nem grava nada.
 * O rascunho é apagado no envio com sucesso e no reset.
 * Usa só a API recebida no plugin (não importa o núcleo), como os demais módulos opcionais.
 */

export const RASCUNHO_PREFIXO = 'alpineform:rascunho:'
const DIA = 24 * 60 * 60 * 1000
const ESPERA_MS = 400
const DIAS_PADRAO = 7
const DIAS_MAXIMO = 365

export const RASCUNHO_EVENTOS = {
    restaurado: 'form:rascunho-restaurado',
    salvo: 'form:rascunho-salvo',
    apagado: 'form:rascunho-apagado',
}

function storageDe(sessao) {
    try {
        return sessao ? globalThis.sessionStorage : globalThis.localStorage
    } catch {
        return null
    }
}

class RascunhoExtension {
    constructor(controller, ConfigError) {
        this.controller = controller
        this.form = controller.form
        this.timer = null
        this.removers = []
        const attr = this.form.getAttribute('data-form-rascunho')
        if (attr === null) {
            this.ativo = false
            return
        }
        const id = this.form.getAttribute('id')
        if (!id) throw new ConfigError('data-form-rascunho exige um id no <form> (o id identifica o rascunho no navegador).')
        const texto = attr.trim()
        if (texto !== '' && !/^\d+$/.test(texto)) {
            throw new ConfigError(`data-form-rascunho="${attr}" inválido. Use o atributo sem valor (7 dias) ou um número de dias, ex.: data-form-rascunho="2".`)
        }
        const dias = texto === '' ? DIAS_PADRAO : Number(texto)
        if (dias < 1 || dias > DIAS_MAXIMO) throw new ConfigError(`data-form-rascunho="${attr}" fora do intervalo permitido (1 a ${DIAS_MAXIMO} dias).`)
        const sessao = this.form.getAttribute('data-form-rascunho-sessao')
        if (sessao !== null && !['', 'true', 'false', 'data-form-rascunho-sessao'].includes(sessao)) {
            throw new ConfigError(`Valor booleano inválido em data-form-rascunho-sessao="${sessao}". Use o atributo sem valor, "true" ou "false".`)
        }
        this.ativo = true
        this.chave = RASCUNHO_PREFIXO + id
        this.validadeMs = dias * DIA
        this.sessao = sessao !== null && sessao !== 'false'

        const on = (type, handler) => {
            this.form.addEventListener(type, handler)
            this.removers.push(() => this.form.removeEventListener(type, handler))
        }
        on('form:ready', () => this.restaurar())
        on('form:change', () => this.agendar())
        on('form:success', () => this.apagar())
        on('form:reset', () => this.apagar())
    }

    get storage() {
        // storage: 'none' (global ou do form) desliga leitura e gravação
        if (!this.controller.storageAllowed) return null
        return storageDe(this.sessao)
    }

    /** Campos que podem ir para o rascunho: nunca senha/sensível, arquivo ou marcado para ignorar. */
    guardavel(field) {
        if (!field || field.kind === 'file' || field.sensitive) return false
        return !field.controls.some(control => control.hasAttribute('data-form-rascunho-ignorar'))
    }

    agendar() {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.salvar(), ESPERA_MS)
    }

    salvar() {
        const storage = this.storage
        if (!storage || this.controller.destroyed) return
        const valores = {}
        for (const field of this.controller.fields.values()) {
            if (this.guardavel(field) && !field.disabled) valores[field.name] = field.getValue('display')
        }
        try {
            storage.setItem(this.chave, JSON.stringify({ salvoEm: Date.now(), valores }))
        } catch {
            return // armazenamento cheio ou bloqueado: segue sem rascunho
        }
        this.form.dispatchEvent(new CustomEvent(RASCUNHO_EVENTOS.salvo, { bubbles: true, detail: { campos: Object.keys(valores) } }))
    }

    ler() {
        const storage = this.storage
        if (!storage) return null
        try {
            const salvo = JSON.parse(storage.getItem(this.chave) || 'null')
            return salvo && typeof salvo === 'object' && salvo.valores && typeof salvo.valores === 'object' ? salvo : null
        } catch {
            return null
        }
    }

    restaurar() {
        const salvo = this.ler()
        if (!salvo) return
        if (!(Number(salvo.salvoEm) > 0) || Date.now() - salvo.salvoEm > this.validadeMs) {
            this.apagar()
            return
        }
        const restaurados = []
        for (const [nome, valor] of Object.entries(salvo.valores)) {
            const field = this.controller.resolveField(nome)
            // campo que não existe mais, ou que virou senha/arquivo/ignorado, é descartado
            if (!this.guardavel(field) || field.disabled) continue
            try {
                this.controller.setValue(field, valor, { silent: true })
                restaurados.push(field.name)
            } catch {
                /* valor incompatível com o campo atual: ignora */
            }
        }
        if (restaurados.length) {
            this.form.dispatchEvent(new CustomEvent(RASCUNHO_EVENTOS.restaurado, { bubbles: true, detail: { salvoEm: salvo.salvoEm, campos: restaurados } }))
        }
    }

    apagar() {
        // cancela um salvamento agendado: o "change" do blur ao clicar em Enviar chega antes do sucesso
        clearTimeout(this.timer)
        const storage = this.storage
        if (!storage) return
        try {
            if (storage.getItem(this.chave) === null) return
            storage.removeItem(this.chave)
        } catch {
            return
        }
        this.form.dispatchEvent(new CustomEvent(RASCUNHO_EVENTOS.apagado, { bubbles: true, detail: {} }))
    }

    destroy() {
        clearTimeout(this.timer)
        for (const remove of this.removers) remove()
        this.removers = []
    }
}

/**
 * Módulo opcional de rascunho.
 *   ESM:    import rascunho from 'alpine-form/rascunho'; AlpineForm.use(rascunho)
 *   script: <script src="alpine-form-rascunho.min.js"></script> (após alpine-form.min.js, antes do Alpine)
 */
export default function rascunhoPlugin(AlpineForm) {
    const { ConfigError } = AlpineForm.errors
    const extensoes = new WeakMap()
    AlpineForm.fieldAttributes(['data-form-rascunho-ignorar'])
    AlpineForm.formHook(controller => {
        const ext = new RascunhoExtension(controller, ConfigError)
        if (!ext.ativo) return null
        extensoes.set(controller.form, ext)
        return ext
    })
    /** Utilitários: salvar já, apagar o rascunho de um formulário ou ler o que está guardado. */
    AlpineForm.rascunho = {
        salvar(formOuId) {
            extensoes.get(resolverForm(formOuId))?.salvar()
        },
        descartar(formOuId) {
            extensoes.get(resolverForm(formOuId))?.apagar()
        },
        ler(formOuId) {
            return extensoes.get(resolverForm(formOuId))?.ler() ?? null
        },
    }
}

function resolverForm(formOuId) {
    return typeof formOuId === 'string' ? document.getElementById(formOuId) : formOuId
}
