/**
 * Módulo opcional de autocompletar (combobox acessível com sugestões vindas da API).
 *
 *   <div data-form-component="autocompletar" data-form-name="cliente_id" data-form-label="Cliente"
 *        data-form-v="required"
 *        data-form-autocompletar="/api/clientes?busca={termo}"
 *        data-form-autocompletar-texto="nome" data-form-autocompletar-descricao="email">
 *       <input type="text" placeholder="Digite o nome">           visível, sem name
 *   </div>
 *
 * O valor enviado (cliente_id) é o do item escolhido; digitar de novo limpa a escolha (o "required" pega
 * texto digitado sem escolher). Teclado: ↓ ↑ navegam, Enter escolhe, Esc fecha/limpa. Padrão WAI-ARIA 1.2
 * (role=combobox + listbox, aria-activedescendant, região viva com a quantidade de resultados).
 * Edição: data-form-autocompletar-inicial="7" + value do input com o texto ("Maria Silva").
 * Ao escolher, data-form-autocompletar-campos copia dados do item para outros campos (como o autopreenchimento:
 * só campos vazios ou preenchidos por ele). URL só da mesma origem. Usa só a API recebida no plugin.
 */

export const AUTOCOMPLETAR_EVENTOS = {
    selecionado: 'form:autocompletar-selecionado',
    erro: 'form:autocompletar-erro',
}

const ATRIBUTOS = [
    'data-form-autocompletar',
    'data-form-autocompletar-valor',
    'data-form-autocompletar-texto',
    'data-form-autocompletar-descricao',
    'data-form-autocompletar-minimo',
    'data-form-autocompletar-debounce',
    'data-form-autocompletar-limite',
    'data-form-autocompletar-livre',
    'data-form-autocompletar-campos',
    'data-form-autocompletar-inicial',
    'data-form-autocompletar-vazio',
]

const CHAVES_VALOR = ['value', 'id', 'codigo', 'sigla', 'key']
const CHAVES_TEXTO = ['label', 'text', 'nome', 'name', 'descricao', 'titulo']
const PROIBIDAS = new Set(['__proto__', 'prototype', 'constructor'])
const CACHE_MAX = 50
const TIMEOUT_MS = 10000
const cache = new Map()
let sequencia = 0

const isObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const proprio = (obj, chave) => (isObjeto(obj) && Object.prototype.hasOwnProperty.call(obj, chave) ? obj[chave] : undefined)
const primeiro = (obj, chaves) => {
    for (const k of chaves) {
        const v = proprio(obj, k)
        if (v !== undefined && v !== null) return v
    }
    return undefined
}
const lerCaminho = (obj, caminho) => caminho.split('.').reduce((atual, parte) => proprio(atual, parte), obj)

/** Lista de itens de formatos comuns: [..], { data }, { success, data }, { itens|items|results }. */
export function extrairLista(json) {
    let corpo = json
    if (isObjeto(corpo) && typeof corpo.success === 'boolean') {
        if (!corpo.success) return null
        corpo = corpo.data
    }
    if (Array.isArray(corpo)) return corpo
    const lista = primeiro(corpo, ['data', 'itens', 'items', 'results', 'opcoes', 'options'])
    return Array.isArray(lista) ? lista : null
}

function lerDuracao(texto, padrao) {
    if (texto === null || texto === undefined) return padrao
    const m = /^(\d+)\s*(ms|s)?$/.exec(String(texto).trim())
    if (!m) return NaN
    return Number(m[1]) * (m[2] === 's' ? 1000 : 1)
}

class Autocompletar {
    constructor(el, AlpineForm) {
        this.el = el
        this.AlpineForm = AlpineForm
        this.input = el.querySelector('input:not([type=hidden])')
        this.valor = ''
        this.textoEscolhido = ''
        this.itens = []
        this.ativo = -1
        this.aberto = false
        this.timer = null
        this.abort = null
        this.token = 0
        this.notificar = () => {}
        this.textos = new Map()          // valor → texto (para setValue/reset)
        this.preenchidos = new Map()     // campo → valor que este componente colocou
        this.removers = []
        this.erro = null
        try {
            this.cfg = this.config()
        } catch (error) {
            this.erro = error
            return
        }
        this.montar()
    }

    /** Lê e valida a configuração; lança ConfigError (o formHook transforma em erro de configuração do campo). */
    config() {
        const { ConfigError } = this.AlpineForm.errors
        const el = this.el
        const nome = el.getAttribute('data-form-name') || '?'
        if (!this.input) throw new ConfigError(`Autocompletar "${nome}" precisa de um <input type="text"> dentro do elemento.`)
        if (this.input.hasAttribute('name')) throw new ConfigError(`O <input> do autocompletar "${nome}" não deve ter name: o valor enviado é o de data-form-name.`)
        const url = (el.getAttribute('data-form-autocompletar') || '').trim()
        if (!url.includes('{termo}')) throw new ConfigError(`data-form-autocompletar do campo "${nome}" precisa de uma URL com {termo} (ex.: /api/clientes?busca={termo}).`)
        const outros = Array.from(url.matchAll(/\{([^{}]+)\}/g), m => m[1]).filter(p => p !== 'termo')
        if (outros.length) throw new ConfigError(`data-form-autocompletar do campo "${nome}" só aceita {termo} (encontrado {${outros[0]}}).`)
        const inteiro = (attr, padrao, min, max) => {
            const v = el.getAttribute(attr)
            if (v === null) return padrao
            if (!/^\d+$/.test(v.trim()) || Number(v) < min || Number(v) > max) throw new ConfigError(`${attr}="${v}" inválido no campo "${nome}" (use ${min} a ${max}).`)
            return Number(v)
        }
        const espera = lerDuracao(el.getAttribute('data-form-autocompletar-debounce'), 250)
        if (Number.isNaN(espera)) throw new ConfigError(`Duração inválida em data-form-autocompletar-debounce no campo "${nome}". Use 250, 250ms ou 1s.`)
        const livre = el.getAttribute('data-form-autocompletar-livre')
        if (livre !== null && !['', 'true', 'false', 'data-form-autocompletar-livre'].includes(livre)) {
            throw new ConfigError(`Valor booleano inválido em data-form-autocompletar-livre="${livre}".`)
        }
        const mapa = []
        for (const parte of (el.getAttribute('data-form-autocompletar-campos') || '').split(',')) {
            const item = parte.trim()
            if (!item) continue
            const pedacos = item.split(':').map(t => t.trim())
            if (pedacos.length > 2 || !pedacos[0] || pedacos[1] === '') throw new ConfigError(`data-form-autocompletar-campos do campo "${nome}" tem um item inválido: "${item}". Use "chave:campo".`)
            if (pedacos[0].split('.').some(p => PROIBIDAS.has(p))) throw new ConfigError(`data-form-autocompletar-campos do campo "${nome}" usa uma chave proibida: "${pedacos[0]}".`)
            mapa.push([pedacos[0], pedacos[1] ?? pedacos[0]])
        }
        const absoluta = new URL(url.replace('{termo}', 'x'), document.baseURI)
        if (absoluta.origin !== location.origin) throw new ConfigError(`data-form-autocompletar do campo "${nome}" aponta para outra origem (${absoluta.origin}). Use um endpoint do próprio site.`)
        return {
            url,
            nome,
            chaveValor: el.getAttribute('data-form-autocompletar-valor'),
            chaveTexto: el.getAttribute('data-form-autocompletar-texto'),
            chaveDescricao: el.getAttribute('data-form-autocompletar-descricao'),
            minimo: inteiro('data-form-autocompletar-minimo', 2, 0, 50),
            limite: inteiro('data-form-autocompletar-limite', 10, 1, 100),
            espera,
            livre: livre !== null && livre !== 'false',
            mapa,
            vazio: el.getAttribute('data-form-autocompletar-vazio') || this.AlpineForm.messages['autocompletar.vazio'],
        }
    }

    montar() {
        const id = `af-ac-${++sequencia}`
        const input = this.input
        this.idLista = `${id}-lista`
        this.atributosOriginais = ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'autocomplete', 'aria-invalid', 'aria-describedby']
            .map(a => [a, input.getAttribute(a)])
        input.setAttribute('role', 'combobox')
        input.setAttribute('aria-autocomplete', 'list')
        input.setAttribute('aria-expanded', 'false')
        input.setAttribute('aria-controls', this.idLista)
        input.setAttribute('autocomplete', 'off')
        if (!input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby') && !input.id) {
            const rotulo = this.el.getAttribute('data-form-label')
            if (rotulo) {
                input.setAttribute('aria-label', rotulo)
                this.atributosOriginais.push(['aria-label', null])
            }
        }
        this.lista = document.createElement('ul')
        this.lista.id = this.idLista
        this.lista.className = 'af-autocompletar-lista'
        this.lista.setAttribute('role', 'listbox')
        this.lista.setAttribute('data-form-generated', 'autocompletar')
        this.lista.hidden = true
        this.status = document.createElement('span')
        this.status.className = 'af-autocompletar-status af-sr-only'
        this.status.setAttribute('role', 'status')
        this.status.setAttribute('data-form-generated', 'autocompletar-status')
        input.after(this.lista, this.status)

        const inicial = this.el.getAttribute('data-form-autocompletar-inicial')
        this.inicial = inicial || ''
        if (inicial) {
            this.valor = inicial
            this.textoEscolhido = input.defaultValue
            this.textos.set(inicial, input.defaultValue)
        }

        const on = (alvo, tipo, fn) => {
            alvo.addEventListener(tipo, fn)
            this.removers.push(() => alvo.removeEventListener(tipo, fn))
        }
        // reset do formulário: o núcleo usa o reset nativo (o texto volta ao value do HTML); o valor
        // escolhido volta ao inicial já aqui, antes de o núcleo reler os campos
        const form = this.el.closest('form')
        if (form) {
            on(form, 'reset', e => {
                if (e.defaultPrevented) return
                clearTimeout(this.timer)
                this.abort?.abort()
                this.fechar()
                this.valor = this.inicial
                this.textoEscolhido = input.defaultValue
            })
        }
        on(input, 'input', () => this.aoDigitar())
        on(input, 'keydown', e => this.teclado(e))
        on(input, 'blur', () => setTimeout(() => this.aoSair(), 0))
        on(this.lista, 'mousedown', e => e.preventDefault())   // não tira o foco do input
        on(this.lista, 'click', e => {
            const li = e.target.closest?.('[role=option]')
            if (li) this.escolher(Number(li.getAttribute('data-indice')))
        })
        // o núcleo foca o contêiner ao levar a pessoa ao erro: repassa o foco para o input
        this.tabindexOriginal = this.el.getAttribute('tabindex')
        if (this.tabindexOriginal === null) this.el.setAttribute('tabindex', '-1')
        on(this.el, 'focus', e => {
            if (e.target === this.el) input.focus()
        })
        // erros de validação marcados no contêiner também valem para o input (leitores de tela)
        this.espelho = new MutationObserver(() => this.espelharAria())
        this.espelho.observe(this.el, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] })
        this.espelharAria()
    }

    espelharAria() {
        for (const a of ['aria-invalid', 'aria-describedby']) {
            const v = this.el.getAttribute(a)
            if (v === null) this.input.removeAttribute(a)
            else if (this.input.getAttribute(a) !== v) this.input.setAttribute(a, v)
        }
    }

    msg(chave, vars = {}) {
        return String(this.AlpineForm.messages[chave] || '').replace(/:(\w+)/g, (m, k) => (k in vars ? String(vars[k]) : m))
    }

    aoDigitar() {
        const texto = this.input.value
        // digitou depois de escolher: a escolha deixa de valer
        if (this.valor !== '' && texto !== this.textoEscolhido) this.definirValor('')
        if (this.cfg.livre) this.definirValor(texto.trim(), { livre: true })
        clearTimeout(this.timer)
        this.abort?.abort()
        if (texto.trim().length < this.cfg.minimo) {
            this.fechar()
            return
        }
        this.timer = setTimeout(() => this.buscar(texto.trim()), this.cfg.espera)
    }

    async buscar(termo) {
        const AF = this.AlpineForm
        const url = new URL(this.cfg.url.replace('{termo}', encodeURIComponent(termo)), document.baseURI).href
        const token = ++this.token
        if (cache.has(url)) return this.mostrar(cache.get(url), termo)
        const controle = new AbortController()
        this.abort = controle
        this.el.setAttribute('aria-busy', 'true')
        this.status.textContent = this.msg('autocompletar.carregando')
        const registro = AF.registry
        const transporte = registro.get('transport', registro.has('transport', 'autocompletar') ? 'autocompletar' : 'fetch')
        let itens
        try {
            const raw = await transporte({
                url,
                method: 'GET',
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: null,
                credentials: 'same-origin',
                timeout: TIMEOUT_MS,
                signal: controle.signal,
            })
            if (token !== this.token) return
            if (raw.status < 200 || raw.status >= 300) throw Object.assign(new Error(`HTTP ${raw.status}`), { status: raw.status })
            const corpo = AF.internals.parseBody(raw)
            const lista = corpo.type === 'json' ? extrairLista(corpo.json) : null
            if (!lista) throw Object.assign(new Error('Formato de resposta não reconhecido.'), { status: raw.status })
            itens = this.normalizar(lista)
            if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
            cache.set(url, itens)
        } catch (error) {
            if (token !== this.token || error?.name === 'AbortError' || error?.kind === 'abort') return
            this.el.removeAttribute('aria-busy')
            this.fechar()
            this.status.textContent = this.msg('autocompletar.erro')
            this.el.dispatchEvent(new CustomEvent(AUTOCOMPLETAR_EVENTOS.erro, { bubbles: true, detail: { name: this.cfg.nome, status: error?.status ?? null } }))
            return
        }
        if (token !== this.token) return
        this.el.removeAttribute('aria-busy')
        this.mostrar(itens, termo)
    }

    normalizar(lista) {
        const { chaveValor, chaveTexto, chaveDescricao } = this.cfg
        const saida = []
        const vistos = new Set()
        for (const item of lista) {
            let valor
            let texto
            let descricao = null
            if (typeof item === 'string' || typeof item === 'number') valor = texto = String(item)
            else if (isObjeto(item)) {
                valor = chaveValor ? lerCaminho(item, chaveValor) : primeiro(item, CHAVES_VALOR)
                texto = chaveTexto ? lerCaminho(item, chaveTexto) : primeiro(item, CHAVES_TEXTO)
                if (texto === undefined || texto === null) texto = valor
                if (chaveDescricao) {
                    const d = lerCaminho(item, chaveDescricao)
                    if (typeof d === 'string' || typeof d === 'number') descricao = String(d)
                }
            } else continue
            if ((typeof valor !== 'string' && typeof valor !== 'number') || (typeof texto !== 'string' && typeof texto !== 'number')) continue
            valor = String(valor)
            if (vistos.has(valor)) continue
            vistos.add(valor)
            saida.push({ valor, texto: String(texto), descricao, dados: isObjeto(item) ? item : null })
            if (saida.length >= this.cfg.limite) break
        }
        return saida
    }

    mostrar(itens, termo) {
        if (this.input.value.trim() !== termo || document.activeElement !== this.input) return
        this.itens = itens
        this.ativo = -1
        while (this.lista.firstChild) this.lista.firstChild.remove()
        itens.forEach((item, i) => {
            const li = document.createElement('li')
            li.id = `${this.idLista}-${i}`
            li.className = 'af-autocompletar-opcao'
            li.setAttribute('role', 'option')
            li.setAttribute('aria-selected', 'false')
            li.setAttribute('data-indice', String(i))
            li.setAttribute('data-form-generated', 'autocompletar-opcao')
            const t = document.createElement('span')
            t.className = 'af-autocompletar-texto'
            t.textContent = item.texto
            li.appendChild(t)
            if (item.descricao) {
                const d = document.createElement('small')
                d.className = 'af-autocompletar-descricao'
                d.textContent = item.descricao
                li.appendChild(d)
            }
            this.lista.appendChild(li)
        })
        if (!itens.length) {
            const li = document.createElement('li')
            li.className = 'af-autocompletar-vazio'
            li.setAttribute('data-form-generated', 'autocompletar-vazio')
            li.setAttribute('aria-disabled', 'true')
            li.textContent = this.cfg.vazio
            this.lista.appendChild(li)
        }
        this.status.textContent = itens.length ? this.msg('autocompletar.resultados', { total: itens.length }) : this.cfg.vazio
        this.abrir()
    }

    abrir() {
        this.lista.hidden = false
        this.aberto = true
        this.input.setAttribute('aria-expanded', 'true')
    }

    fechar() {
        this.lista.hidden = true
        this.aberto = false
        this.ativo = -1
        this.input.setAttribute('aria-expanded', 'false')
        this.input.removeAttribute('aria-activedescendant')
    }

    marcar(indice) {
        if (!this.itens.length) return
        const total = this.itens.length
        this.ativo = (indice + total) % total
        for (const li of this.lista.querySelectorAll('[role=option]')) {
            const atual = Number(li.getAttribute('data-indice')) === this.ativo
            li.setAttribute('aria-selected', atual ? 'true' : 'false')
            li.classList.toggle('af-autocompletar-ativo', atual)
            if (atual) {
                this.input.setAttribute('aria-activedescendant', li.id)
                li.scrollIntoView?.({ block: 'nearest' })
            }
        }
    }

    teclado(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!this.aberto && this.itens.length) this.abrir()
            this.marcar(this.ativo + 1)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (!this.aberto && this.itens.length) this.abrir()
            this.marcar(this.ativo - 1)
        } else if (e.key === 'Enter' && this.aberto && this.ativo >= 0) {
            e.preventDefault()     // não envia o formulário: só escolhe
            this.escolher(this.ativo)
        } else if (e.key === 'Escape') {
            if (this.aberto) {
                e.preventDefault()
                this.fechar()
            } else if (this.input.value) {
                e.preventDefault()
                this.input.value = ''
                this.definirValor('')
            }
        } else if (e.key === 'Tab' && this.aberto) {
            this.fechar()
        }
    }

    escolher(indice) {
        const item = this.itens[indice]
        if (!item) return
        this.input.value = item.texto
        this.textoEscolhido = item.texto
        this.textos.set(item.valor, item.texto)
        this.fechar()
        this.status.textContent = this.msg('autocompletar.escolhido', { texto: item.texto })
        this.definirValor(item.valor)
        if (item.dados) this.preencherOutros(item.dados)
        this.el.dispatchEvent(new CustomEvent(AUTOCOMPLETAR_EVENTOS.selecionado, { bubbles: true, detail: { name: this.cfg.nome, valor: item.valor, texto: item.texto, item: item.dados } }))
    }

    preencherOutros(dados) {
        if (!this.cfg.mapa.length) return
        const form = this.el.closest('form') || (this.el.getAttribute('form') && document.getElementById(this.el.getAttribute('form')))
        const api = form ? this.AlpineForm.get(form) : null
        if (!api) return
        for (const [chave, campo] of this.cfg.mapa) {
            const v = lerCaminho(dados, chave)
            if (v === undefined || v === null || typeof v === 'object') continue
            if (!api.has(campo)) continue
            const atual = api.getValue(campo, { as: 'display' })
            const texto = atual === null || atual === undefined ? '' : String(atual)
            if (texto !== '' && texto !== this.preenchidos.get(campo)) continue    // a pessoa digitou: não mexe
            try {
                api.setValue(campo, String(v))
                this.preenchidos.set(campo, String(v))
            } catch {
                /* campo incompatível (arquivo etc.): ignora */
            }
        }
    }

    aoSair() {
        // saiu com texto sem escolher: o texto fica (a pessoa vê o que digitou) e o valor continua vazio,
        // então a validação (required) avisa
        if (document.activeElement !== this.input) this.fechar()
    }

    definirValor(valor, { livre = false } = {}) {
        if (valor === this.valor) return
        this.valor = valor
        if (!livre) this.textoEscolhido = valor === '' ? '' : this.textoEscolhido
        this.notificar()
    }

    /** setValue do controlador (reset, rascunho, $form.setValue). */
    aplicarValor(valor) {
        const v = valor === null || valor === undefined ? '' : String(valor)
        this.valor = v
        const texto = v === '' ? '' : this.textos.get(v) ?? (this.cfg?.livre ? v : this.input?.value ?? '')
        if (this.input) this.input.value = texto
        this.textoEscolhido = texto
        if (!this.erro) this.fechar()
    }

    destroy() {
        clearTimeout(this.timer)
        this.abort?.abort()
        this.token++
        this.espelho?.disconnect()
        for (const remove of this.removers) remove()
        this.removers = []
        this.lista?.remove()
        this.status?.remove()
        this.el.removeAttribute('aria-busy')
        if (this.atributosOriginais && this.tabindexOriginal === null) this.el.removeAttribute('tabindex')
        if (this.input && this.atributosOriginais) {
            for (const [a, v] of this.atributosOriginais) {
                if (v === null) this.input.removeAttribute(a)
                else this.input.setAttribute(a, v)
            }
        }
    }
}

const MENSAGENS = {
    'autocompletar.carregando': 'Buscando…',
    'autocompletar.resultados': ':total resultado(s). Use as setas para escolher.',
    'autocompletar.vazio': 'Nenhum resultado encontrado.',
    'autocompletar.erro': 'Não foi possível buscar agora.',
    'autocompletar.escolhido': ':texto selecionado.',
}

/**
 * Módulo opcional de autocompletar.
 *   ESM:    import autocompletar from 'alpine-form/autocompletar'; AlpineForm.use(autocompletar)
 *   script: <script src="alpine-form-autocompletar.min.js"></script> (após alpine-form.min.js, antes do Alpine)
 */
export default function autocompletarPlugin(AlpineForm) {
    for (const [chave, texto] of Object.entries(MENSAGENS)) if (!AlpineForm.messages[chave]) AlpineForm.messages[chave] = texto
    const instancias = new WeakMap()
    const instancia = el => {
        let i = instancias.get(el)
        if (!i) {
            i = new Autocompletar(el, AlpineForm)
            instancias.set(el, i)
        }
        return i
    }
    AlpineForm.fieldAttributes(ATRIBUTOS)
    AlpineForm.component('autocompletar', {
        getValue: el => instancia(el).valor,
        setValue: (el, valor) => instancia(el).aplicarValor(valor),
        subscribe(el, notify) {
            const i = instancia(el)
            i.notificar = notify
            return () => {
                i.destroy()
                instancias.delete(el)
            }
        },
    })
    // erros de configuração viram erro do campo (bloqueiam o envio), como no núcleo
    AlpineForm.formHook(controller => {
        const conferir = () => {
            for (const field of controller.fields.values()) {
                if (field.kind !== 'component' || field.primary.getAttribute('data-form-component') !== 'autocompletar') continue
                const erro = instancias.get(field.primary)?.erro
                if (!erro || field.configError?.message === erro.message) continue
                field.configError = erro
                field.state.configError = erro.message
                controller.state.configErrors = [...controller.state.configErrors.filter(e => e.field !== field.key), { field: field.key, message: erro.message }]
                controller.log('error', `Campo "${field.name}":`, erro.message, field.primary)
                controller.form.dispatchEvent(new CustomEvent('form:config-error', { bubbles: true, detail: { errors: controller.state.configErrors.slice() } }))
            }
        }
        controller.form.addEventListener('form:ready', conferir)
        controller.form.addEventListener('form:field-added', conferir)
        return {
            destroy() {
                controller.form.removeEventListener('form:ready', conferir)
                controller.form.removeEventListener('form:field-added', conferir)
            },
        }
    })
    AlpineForm.autocompletar = {
        limparCache() {
            cache.clear()
        },
        extrairLista,
    }
}
