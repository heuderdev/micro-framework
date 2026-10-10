/**
 * Módulo opcional de avisos (toasts) e confirmação.
 *
 *   <form x-data x-form data-form-avisos ...>                        aviso de sucesso e de erro do envio
 *   <form x-data x-form data-form-avisos="sucesso" data-form-aviso-sucesso="Cliente salvo!">
 *   <form x-data x-form data-form-confirmar="Confirma o envio?">     pergunta depois de validar, antes de enviar
 *   <button type="submit" data-form-confirmar="Excluir o cliente?" data-form-confirmar-perigo>Excluir</button>
 *
 *   AlpineForm.avisos.sucesso('Exportação iniciada.')                 ou $avisos.sucesso(...) no Alpine
 *   if (await AlpineForm.avisos.confirmar('Descartar alterações?')) { ... }   ou $confirmar('...')
 *
 * Tudo que é criado leva data-form-generated; texto sempre por textContent (mensagens do servidor nunca
 * viram HTML). A confirmação usa <dialog> nativo (foco preso, Esc cancela) com alternativa para navegadores
 * sem showModal; o foco volta para onde estava. Usa só a API recebida no plugin.
 */

export const AVISOS_EVENTOS = {
    mostrado: 'avisos:mostrado',
}

const DURACAO = { sucesso: 5000, info: 5000, aviso: 7000, erro: 8000 }
const TIPOS = new Set(Object.keys(DURACAO))
const MAXIMO = 4

let sequencia = 0

function criar(tag, classe, gerado, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    el.setAttribute('data-form-generated', gerado)
    if (texto !== undefined) el.textContent = texto
    return el
}

class Avisos {
    constructor(AlpineForm) {
        this.AlpineForm = AlpineForm
        this.container = null
        this.itens = new Map()     // id → { el, timer, restante, inicio }
    }

    msg(chave) {
        return this.AlpineForm.messages[chave]
    }

    garantirContainer() {
        if (this.container?.isConnected) return this.container
        const c = criar('div', 'af-avisos', 'avisos')
        c.setAttribute('role', 'region')
        c.setAttribute('aria-label', this.msg('avisos.regiao'))
        // duas regiões vivas: status (educado) e alert (assertivo, para erros)
        this.vivoEducado = criar('div', 'af-avisos-lista', 'avisos-status')
        this.vivoEducado.setAttribute('role', 'status')
        this.vivoEducado.setAttribute('aria-live', 'polite')
        this.vivoAlerta = criar('div', 'af-avisos-lista', 'avisos-alerta')
        this.vivoAlerta.setAttribute('role', 'alert')
        this.vivoAlerta.setAttribute('aria-live', 'assertive')
        c.append(this.vivoEducado, this.vivoAlerta)
        document.body.appendChild(c)
        this.container = c
        return c
    }

    /** Mostra um aviso. tipo: sucesso | erro | aviso | info. duracao em ms (0 = só fecha no botão). */
    mostrar(texto, { tipo = 'info', duracao } = {}) {
        if (!TIPOS.has(tipo)) throw new this.AlpineForm.errors.ConfigError(`Tipo de aviso desconhecido: "${tipo}". Use sucesso, erro, aviso ou info.`)
        const conteudo = texto === null || texto === undefined ? '' : String(texto)
        if (!conteudo) return null
        this.garantirContainer()
        const id = `af-aviso-${++sequencia}`
        const el = criar('div', `af-aviso af-aviso--${tipo}`, 'aviso')
        el.id = id
        el.setAttribute('data-tipo', tipo)
        const span = criar('span', 'af-aviso-texto', 'aviso-texto', conteudo)
        const fechar = criar('button', 'af-aviso-fechar', 'aviso-fechar', '×')
        fechar.type = 'button'
        fechar.setAttribute('aria-label', this.msg('avisos.fechar'))
        fechar.addEventListener('click', () => this.fechar(id))
        el.append(span, fechar)
        const tempo = duracao === undefined ? DURACAO[tipo] : Math.max(0, Number(duracao) || 0)
        const item = { el, timer: null, restante: tempo, inicio: 0 }
        const pausar = () => {
            if (!item.timer) return
            clearTimeout(item.timer)
            item.timer = null
            item.restante -= Date.now() - item.inicio
        }
        const retomar = () => {
            if (item.timer || !tempo || el.matches(':hover') || el.contains(document.activeElement)) return
            item.inicio = Date.now()
            item.timer = setTimeout(() => this.fechar(id), Math.max(1000, item.restante))
        }
        // não some enquanto a pessoa lê (mouse em cima) ou navega por teclado nele
        el.addEventListener('mouseenter', pausar)
        el.addEventListener('focusin', pausar)
        el.addEventListener('mouseleave', retomar)
        el.addEventListener('focusout', () => setTimeout(retomar, 0))
        this.itens.set(id, item)
        ;(tipo === 'erro' ? this.vivoAlerta : this.vivoEducado).appendChild(el)
        if (tempo) {
            item.inicio = Date.now()
            item.timer = setTimeout(() => this.fechar(id), tempo)
        }
        // limite de avisos na tela: o mais antigo sai
        while (this.itens.size > MAXIMO) this.fechar(this.itens.keys().next().value)
        document.dispatchEvent(new CustomEvent(AVISOS_EVENTOS.mostrado, { detail: { id, tipo, texto: conteudo } }))
        return id
    }

    fechar(id) {
        const item = this.itens.get(id)
        if (!item) return false
        clearTimeout(item.timer)
        item.el.remove()
        this.itens.delete(id)
        return true
    }

    limpar() {
        for (const id of Array.from(this.itens.keys())) this.fechar(id)
    }

    /**
     * Pergunta e resolve true (confirmou) ou false (cancelou, Esc, fechou).
     * opções: { titulo, confirmar: 'Excluir', cancelar: 'Cancelar', perigo: true }
     */
    confirmar(texto, { titulo = null, confirmar = null, cancelar = null, perigo = false } = {}) {
        if (this.dialogo) return Promise.resolve(false)    // uma pergunta por vez
        const anterior = document.activeElement
        const dialog = criar('dialog', `af-confirmar${perigo ? ' af-confirmar--perigo' : ''}`, 'confirmar')
        const idTexto = `af-confirmar-${++sequencia}`
        dialog.setAttribute('aria-describedby', idTexto)
        if (titulo) {
            const h = criar('h2', 'af-confirmar-titulo', 'confirmar-titulo', String(titulo))
            h.id = `${idTexto}-t`
            dialog.setAttribute('aria-labelledby', h.id)
            dialog.appendChild(h)
        } else dialog.setAttribute('aria-label', this.msg('avisos.confirmar_titulo'))
        const p = criar('p', 'af-confirmar-texto', 'confirmar-texto', String(texto ?? ''))
        p.id = idTexto
        const acoes = criar('div', 'af-confirmar-acoes', 'confirmar-acoes')
        const nao = criar('button', 'af-confirmar-cancelar', 'confirmar-cancelar', cancelar || this.msg('avisos.cancelar'))
        nao.type = 'button'
        const sim = criar('button', 'af-confirmar-ok', 'confirmar-ok', confirmar || this.msg('avisos.confirmar'))
        sim.type = 'button'
        acoes.append(nao, sim)
        dialog.append(p, acoes)
        document.body.appendChild(dialog)
        const nativo = typeof dialog.showModal === 'function'
        return new Promise(resolve => {
            let resolvido = false
            const terminar = valor => {
                if (resolvido) return
                resolvido = true
                document.removeEventListener('keydown', teclado, true)
                if (nativo && dialog.open) dialog.close()
                dialog.remove()
                this.dialogo = null
                if (anterior && typeof anterior.focus === 'function' && anterior.isConnected) anterior.focus()
                resolve(valor)
            }
            const teclado = event => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    terminar(false)
                } else if (event.key === 'Tab' && !nativo) {
                    // sem <dialog> nativo: mantém o foco entre os dois botões
                    event.preventDefault()
                    ;(document.activeElement === sim ? nao : sim).focus()
                }
            }
            sim.addEventListener('click', () => terminar(true))
            nao.addEventListener('click', () => terminar(false))
            dialog.addEventListener('cancel', event => {
                event.preventDefault()
                terminar(false)
            })
            document.addEventListener('keydown', teclado, true)
            this.dialogo = { terminar }
            if (nativo) dialog.showModal()
            else dialog.setAttribute('open', '')
            // ação perigosa: foco em "Cancelar" (Enter por engano não exclui)
            ;(perigo ? nao : sim).focus()
        })
    }
}

class AvisosDoForm {
    constructor(controller, avisos) {
        this.controller = controller
        this.form = controller.form
        this.avisos = avisos
        this.submitter = null
        this.removers = []
        const on = (type, handler) => {
            this.form.addEventListener(type, handler)
            this.removers.push(() => this.form.removeEventListener(type, handler))
        }
        on('form:before-submit', event => {
            this.submitter = event.detail?.submitter || null
        })
        on('form:success', event => this.aoSucesso(event.detail?.result))
        on('form:error', event => this.aoErro(event.detail?.error))
    }

    modo() {
        const v = this.form.getAttribute('data-form-avisos')
        if (v === null) return null
        const modo = v.trim() || 'todos'
        if (!['todos', 'sucesso', 'erro'].includes(modo)) {
            this.controller.log('error', `data-form-avisos="${v}" inválido. Use o atributo sem valor, "sucesso" ou "erro".`)
            return null
        }
        return modo
    }

    aoSucesso(result) {
        const modo = this.modo()
        if (modo !== 'todos' && modo !== 'sucesso') return
        const texto = this.form.getAttribute('data-form-aviso-sucesso') || result?.message || this.avisos.msg('avisos.sucesso')
        this.avisos.mostrar(texto, { tipo: 'sucesso' })
    }

    aoErro(error) {
        const modo = this.modo()
        if (modo !== 'todos' && modo !== 'erro') return
        if (!error || error.kind === 'canceled') return
        const texto = error.message || this.avisos.msg('avisos.erro')
        this.avisos.mostrar(texto, { tipo: 'erro' })
    }

    /** Depois da validação e antes da requisição: pergunta, se o botão ou o form pedirem. */
    async beforeSend() {
        const origem = this.submitter?.hasAttribute?.('data-form-confirmar') ? this.submitter : this.form.hasAttribute('data-form-confirmar') ? this.form : null
        this.submitter = null
        if (!origem) return
        const ok = await this.avisos.confirmar(origem.getAttribute('data-form-confirmar') || this.avisos.msg('avisos.confirmar_envio'), {
            titulo: origem.getAttribute('data-form-confirmar-titulo'),
            confirmar: origem.getAttribute('data-form-confirmar-ok'),
            perigo: origem.hasAttribute('data-form-confirmar-perigo'),
        })
        if (!ok) throw Object.assign(new Error('Envio cancelado na confirmação.'), { name: 'AbortError', kind: 'abort' })
    }

    destroy() {
        for (const remove of this.removers) remove()
        this.removers = []
    }
}

const MENSAGENS = {
    'avisos.regiao': 'Avisos',
    'avisos.fechar': 'Fechar aviso',
    'avisos.sucesso': 'Salvo com sucesso.',
    'avisos.erro': 'Não foi possível concluir. Tente novamente.',
    'avisos.confirmar': 'Confirmar',
    'avisos.cancelar': 'Cancelar',
    'avisos.confirmar_titulo': 'Confirmação',
    'avisos.confirmar_envio': 'Confirma o envio?',
}

/**
 * Módulo opcional de avisos.
 *   ESM:    import avisos from 'alpine-form/avisos'; AlpineForm.use(avisos)
 *   script: <script src="alpine-form-avisos.min.js"></script> (após alpine-form.min.js, antes do Alpine)
 */
export default function avisosPlugin(AlpineForm) {
    for (const [chave, texto] of Object.entries(MENSAGENS)) if (!AlpineForm.messages[chave]) AlpineForm.messages[chave] = texto
    const avisos = new Avisos(AlpineForm)
    const api = {
        mostrar: (texto, opcoes) => avisos.mostrar(texto, opcoes),
        sucesso: (texto, opcoes = {}) => avisos.mostrar(texto, { ...opcoes, tipo: 'sucesso' }),
        erro: (texto, opcoes = {}) => avisos.mostrar(texto, { ...opcoes, tipo: 'erro' }),
        aviso: (texto, opcoes = {}) => avisos.mostrar(texto, { ...opcoes, tipo: 'aviso' }),
        info: (texto, opcoes = {}) => avisos.mostrar(texto, { ...opcoes, tipo: 'info' }),
        fechar: id => avisos.fechar(id),
        limpar: () => avisos.limpar(),
        confirmar: (texto, opcoes) => avisos.confirmar(texto, opcoes),
    }
    AlpineForm.avisos = api
    // sempre ativa (é leve): o form pode ganhar depois botões com data-form-confirmar (x-if, x-for)
    AlpineForm.formHook(controller => new AvisosDoForm(controller, avisos))
    AlpineForm.alpine(Alpine => {
        Alpine.magic('avisos', () => api)
        Alpine.magic('confirmar', () => (texto, opcoes) => avisos.confirmar(texto, opcoes))
    })
}
