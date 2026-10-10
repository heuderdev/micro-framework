/*! AlpineForm v1.0.0 | MIT */

// src/lista/index.js
var MENSAGENS = {
  "lista.carregando": "Carregando\u2026",
  "lista.vazio": "Nenhum resultado encontrado.",
  "lista.resumo": "Mostrando :de\u2013:ate de :total",
  "lista.resumo_sem_total": "Mostrando :de\u2013:ate",
  "lista.erro": "N\xE3o foi poss\xEDvel carregar a lista.",
  "lista.erro_contrato": "A resposta do servidor n\xE3o est\xE1 no formato de lista esperado.",
  "lista.anterior": "Anterior",
  "lista.proxima": "Pr\xF3xima",
  "lista.pagina": "P\xE1gina :pagina",
  "lista.navegacao": "Pagina\xE7\xE3o",
  "lista.selecionados": ":total selecionado(s)"
};
var PARAMETROS_PADRAO = { pagina: "page", porPagina: "per_page", ordem: "sort", direcao: "direction" };
var TIPOS_SEM_DIGITACAO = /* @__PURE__ */ new Set(["checkbox", "radio", "date", "month", "week", "time", "datetime-local", "range", "color", "file"]);
var listas = /* @__PURE__ */ new WeakMap();
var ativas = /* @__PURE__ */ new Set();
function atualizarListas(alvos, { registro = null, origem = null, podeLogar = () => true } = {}) {
  const tokens = (Array.isArray(alvos) ? alvos : String(alvos || "").split(/[\s,]+/)).map(String).filter(Boolean);
  const atendidas = /* @__PURE__ */ new Set();
  for (const alvo of tokens) {
    let encontrou = false;
    for (const lista of ativas) {
      if (!lista.atende(alvo)) continue;
      encontrou = true;
      atendidas.add(lista);
    }
    if (!encontrou && podeLogar(origem)) console.warn(`[AlpineForm] Nenhuma lista com id ou data-lista-grupo "${alvo}" para atualizar.`, origem || "");
  }
  for (const lista of atendidas) lista.atualizarExterno({ registro });
  return atendidas.size;
}
var adaptadores = /* @__PURE__ */ new Map();
var isObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var primeiro = (...valores) => valores.find((v) => v !== void 0 && v !== null);
var inteiro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};
function interpolar(texto, vars) {
  return String(texto).replace(/:([a-z_]+)/g, (m, chave) => Object.prototype.hasOwnProperty.call(vars, chave) ? String(vars[chave] ?? "") : m);
}
function adaptadorPadrao(json, { porPagina, pagina }) {
  let corpo = json;
  if (isObjeto(json) && typeof json.success === "boolean") {
    if (!json.success) return { erro: json.message || json.mensagem || null };
    corpo = json.data;
  }
  if (Array.isArray(corpo)) {
    return { itens: corpo, total: null, pagina, porPagina, ultimaPagina: null, temProxima: corpo.length >= porPagina ? null : false };
  }
  if (!isObjeto(corpo)) return null;
  const itens = primeiro(corpo.data, corpo.itens, corpo.items, corpo.results, corpo.registros);
  if (!Array.isArray(itens)) return null;
  const meta = isObjeto(corpo.meta) ? corpo.meta : isObjeto(corpo.paginacao) ? corpo.paginacao : isObjeto(corpo.pagination) ? corpo.pagination : corpo;
  const paginaAtual = inteiro(primeiro(meta.current_page, meta.pagina, meta.page)) || pagina;
  const tamanho = inteiro(primeiro(meta.per_page, meta.por_pagina, meta.perPage, meta.limit)) || porPagina;
  const total = inteiro(primeiro(meta.total, meta.total_registros));
  let ultima = inteiro(primeiro(meta.last_page, meta.ultima_pagina, meta.lastPage, meta.total_paginas));
  if (!ultima && total !== null && tamanho) ultima = Math.max(1, Math.ceil(total / tamanho));
  let temProxima;
  if (ultima) temProxima = paginaAtual < ultima;
  else {
    const proximaUrl = primeiro(corpo.next_page_url, meta.next_page_url, isObjeto(corpo.links) ? corpo.links.next : void 0);
    temProxima = proximaUrl !== void 0 ? !!proximaUrl : itens.length >= tamanho ? null : false;
  }
  return { itens, total, pagina: paginaAtual, porPagina: tamanho, ultimaPagina: ultima, temProxima };
}
adaptadores.set("padrao", adaptadorPadrao);
function janelaDePaginas(atual, ultima, vizinhos = 2) {
  if (!ultima || ultima < 1) return [];
  const paginas = [];
  const inicio = Math.max(2, atual - vizinhos);
  const fim = Math.min(ultima - 1, atual + vizinhos);
  paginas.push({ numero: 1, atual: atual === 1 });
  if (inicio === 3) paginas.push({ numero: 2, atual: atual === 2 });
  else if (inicio > 3) paginas.push({ reticencias: true, chave: "r1" });
  for (let n = inicio; n <= fim; n++) paginas.push({ numero: n, atual: n === atual });
  if (fim === ultima - 2) paginas.push({ numero: ultima - 1, atual: atual === ultima - 1 });
  else if (fim < ultima - 2) paginas.push({ reticencias: true, chave: "r2" });
  if (ultima > 1) paginas.push({ numero: ultima, atual: atual === ultima });
  return paginas.map((p) => ({ chave: p.reticencias ? p.chave : `p${p.numero}`, ...p }));
}
function lerDuracao(texto, padrao, ConfigError, attr) {
  if (texto === null || texto === void 0) return padrao;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|min)?$/.exec(String(texto).trim());
  if (!m) throw new ConfigError(`Dura\xE7\xE3o inv\xE1lida em ${attr}="${texto}". Use 300, 300ms, 2s ou 1min.`);
  return Math.round(Number(m[1]) * (m[2] === "s" ? 1e3 : m[2] === "min" ? 6e4 : 1));
}
function lerInteiro(texto, padrao, ConfigError, attr, min, max) {
  if (texto === null || texto === void 0) return padrao;
  if (!/^\d+$/.test(String(texto).trim())) throw new ConfigError(`N\xFAmero inteiro inv\xE1lido em ${attr}="${texto}".`);
  const n = Number(texto);
  if (n < min || n > max) throw new ConfigError(`${attr}="${texto}" fora do intervalo permitido (${min} a ${max}).`);
  return n;
}
var Lista = class {
  constructor(el, opcoes, Alpine, AlpineForm) {
    const { ConfigError } = AlpineForm.errors;
    this.el = el;
    this.Alpine = Alpine;
    this.AlpineForm = AlpineForm;
    this.ConfigError = ConfigError;
    this.removers = [];
    this.requisicao = null;
    this.sequencia = 0;
    this.timerFiltro = null;
    this.timerAtualizar = null;
    this.observadorSentinela = null;
    this.destruida = false;
    const attr = (nome) => Object.prototype.hasOwnProperty.call(opcoes, nome) ? opcoes[nome] : el.getAttribute(`data-lista-${nome}`);
    const url = attr("url");
    if (!url || !String(url).trim()) throw new ConfigError("x-lista exige data-lista-url com o endere\xE7o da listagem.");
    const modo = attr("modo") || "paginas";
    if (!["paginas", "acumular"].includes(modo)) throw new ConfigError(`data-lista-modo="${modo}" inv\xE1lido. Use "paginas" ou "acumular".`);
    const direcao = (attr("direcao") || "asc").toLowerCase();
    if (!["asc", "desc"].includes(direcao)) throw new ConfigError(`data-lista-direcao="${direcao}" inv\xE1lido. Use "asc" ou "desc".`);
    const adaptadorNome = attr("adaptador") || "padrao";
    const adaptador = adaptadores.get(adaptadorNome);
    if (!adaptador) throw new ConfigError(`Adaptador de lista "${adaptadorNome}" n\xE3o registrado (AlpineForm.lista.adaptador).`);
    const carregar = attr("carregar") || "automatico";
    if (!["automatico", "manual"].includes(carregar)) throw new ConfigError(`data-lista-carregar="${carregar}" inv\xE1lido. Use "automatico" ou "manual".`);
    this.config = {
      url: String(url),
      modo,
      adaptador,
      carregar,
      porPagina: lerInteiro(attr("por-pagina"), 20, ConfigError, "data-lista-por-pagina", 1, 1e3),
      debounce: lerDuracao(attr("debounce"), 300, ConfigError, "data-lista-debounce"),
      timeout: lerDuracao(attr("timeout"), 15e3, ConfigError, "data-lista-timeout"),
      atualizar: lerDuracao(attr("atualizar"), 0, ConfigError, "data-lista-atualizar"),
      chave: attr("chave") || "id",
      sincronizarUrl: attr("url-sincronizar") !== null && attr("url-sincronizar") !== "false" && attr("url-sincronizar") !== false,
      prefixo: attr("url-prefixo") || "",
      parametros: {
        pagina: attr("param-pagina") || PARAMETROS_PADRAO.pagina,
        porPagina: attr("param-por-pagina") || PARAMETROS_PADRAO.porPagina,
        ordem: attr("param-ordem") || PARAMETROS_PADRAO.ordem,
        direcao: attr("param-direcao") || PARAMETROS_PADRAO.direcao
      }
    };
    const aoAtualizar = attr("ao-atualizar") || "recarregar";
    if (!["recarregar", "inicio"].includes(aoAtualizar)) throw new ConfigError(`data-lista-ao-atualizar="${aoAtualizar}" inv\xE1lido. Use "recarregar" ou "inicio".`);
    this.config.grupos = String(attr("grupo") || "").split(/[\s,]+/).filter(Boolean);
    this.config.aoAtualizar = aoAtualizar;
    const destacar = attr("destacar");
    this.config.destacar = destacar === null || destacar === void 0 || destacar === false || destacar === "false" ? 0 : destacar === "" || destacar === true || destacar === "true" ? 4e3 : lerDuracao(destacar, 4e3, ConfigError, "data-lista-destacar");
    this.timerDestaque = null;
    this.ordemInicial = attr("ordem") || "";
    this.direcaoInicial = direcao;
    this.state = Alpine.reactive(this.estadoInicial());
    listas.set(el, this);
    ativas.add(this);
  }
  /** Este alvo (id ou grupo) se refere a esta lista? */
  atende(alvo) {
    return this.el.id && this.el.id === alvo || this.config.grupos.includes(alvo);
  }
  /**
   * Atualização pedida de fora (formulário salvo, exclusão, outra tela): busca de novo na API.
   * "recarregar" mantém página, filtros e ordenação; "inicio" volta para a página 1.
   * No modo acumular sempre recomeça da página 1 (as páginas acrescentadas seriam perdidas de qualquer forma).
   * Com data-lista-destacar, o registro salvo (pela chave) fica em $lista.destaque por alguns segundos.
   */
  async atualizarExterno({ registro = null } = {}) {
    if (this.destruida) return false;
    if (this.config.aoAtualizar === "inicio" || this.config.modo === "acumular") this.state.pagina = 1;
    const ok = await this.carregar({ historico: "substituir", reiniciar: true });
    const chave = isObjeto(registro) ? registro[this.config.chave] : null;
    if (ok && this.config.destacar > 0 && chave !== null && chave !== void 0) {
      clearTimeout(this.timerDestaque);
      this.state.destaque = this.normalizarChave(chave);
      this.timerDestaque = setTimeout(() => {
        this.state.destaque = null;
      }, this.config.destacar);
    }
    this.disparar("lista:atualizada", { origem: "externa", registro: chave ?? null });
    return ok;
  }
  estadoInicial() {
    const self = this;
    return {
      itens: [],
      carregando: false,
      carregado: false,
      erro: null,
      pagina: 1,
      porPagina: this.config.porPagina,
      total: null,
      ultimaPagina: null,
      temProxima: false,
      ordem: this.ordemInicial,
      direcao: this.direcaoInicial,
      filtros: {},
      selecionados: [],
      destaque: null,
      get vazio() {
        return this.carregado && !this.carregando && !this.erro && this.itens.length === 0;
      },
      get temAnterior() {
        return self.config.modo === "paginas" && this.pagina > 1;
      },
      get de() {
        if (!this.itens.length) return 0;
        return self.config.modo === "acumular" ? 1 : (this.pagina - 1) * this.porPagina + 1;
      },
      get ate() {
        if (!this.itens.length) return 0;
        return self.config.modo === "acumular" ? this.itens.length : (this.pagina - 1) * this.porPagina + this.itens.length;
      },
      get paginas() {
        return janelaDePaginas(this.pagina, this.ultimaPagina);
      },
      get resumo() {
        return self.textoStatus();
      },
      get quantidadeSelecionada() {
        return this.selecionados.length;
      },
      get todosSelecionados() {
        return this.itens.length > 0 && this.itens.every((item) => this.selecionados.includes(self.chaveDe(item)));
      },
      get algunsSelecionados() {
        return this.selecionados.length > 0 && !this.todosSelecionados;
      },
      get parametros() {
        return self.parametros();
      },
      get queryString() {
        return self.queryString(false);
      },
      irPara: (n) => this.irPara(n),
      proxima: () => this.irPara(this.state.pagina + 1),
      anterior: () => this.irPara(this.state.pagina - 1),
      ordenar: (campo, direcao) => this.ordenar(campo, direcao),
      direcaoDe: (campo) => this.state.ordem === campo ? this.state.direcao : null,
      filtrar: (nome, valor) => this.definirFiltros({ [nome]: valor }),
      definirFiltros: (filtros) => this.definirFiltros(filtros),
      limparFiltros: () => this.limparFiltros(),
      definirPorPagina: (n) => this.definirPorPagina(n),
      recarregar: () => this.carregar(),
      maisItens: () => this.maisItens(),
      alternar: (chave) => this.alternarSelecao(chave),
      alternarTodos: () => this.alternarTodos(),
      limparSelecao: () => this.limparSelecao(),
      selecionado: (chave) => this.state.selecionados.includes(this.normalizarChave(chave)),
      itensSelecionados: () => this.state.itens.filter((item) => this.state.selecionados.includes(this.chaveDe(item))),
      urlCom: (base) => this.urlCom(base)
    };
  }
  mensagem(chave, vars = {}) {
    const texto = this.AlpineForm.messages[chave] ?? MENSAGENS[chave] ?? chave;
    return interpolar(texto, vars);
  }
  normalizarChave(valor) {
    return valor === null || valor === void 0 ? "" : String(valor);
  }
  chaveDe(item) {
    return this.normalizarChave(isObjeto(item) ? item[this.config.chave] : item);
  }
  podeLogar() {
    const local = this.el.getAttribute("data-form-log");
    const global = this.AlpineForm.internals.globalOption?.("log");
    return (local ?? global) !== "none";
  }
  /* ------------------------------------------------------------ inicialização */
  iniciar() {
    if (this.config.sincronizarUrl) this.lerUrl();
    this.lerFiltrosDoDom(true);
    this.instalarEventos();
    this.observarSentinela();
    this.renderizarDom();
    if (this.config.carregar === "automatico") this.carregar({ historico: "nenhum" });
    if (this.config.atualizar > 0) this.agendarAtualizacao();
  }
  on(alvo, tipo, handler, opcoes) {
    alvo.addEventListener(tipo, handler, opcoes);
    this.removers.push(() => alvo.removeEventListener(tipo, handler, opcoes));
  }
  instalarEventos() {
    const el = this.el;
    this.on(el, "input", (e) => this.aoMudarFiltro(e, true));
    this.on(el, "change", (e) => this.aoMudar(e));
    this.on(el, "submit", (e) => {
      if (!e.target.closest?.("[data-lista-filtros]") || this.donoDe(e.target) !== this) return;
      e.preventDefault();
      clearTimeout(this.timerFiltro);
      this.aplicarFiltrosDoDom();
    });
    this.on(el, "click", (e) => this.aoClicar(e));
    if (this.config.sincronizarUrl) this.on(window, "popstate", () => this.aoVoltarHistorico());
    if (typeof document !== "undefined") {
      this.on(document, "visibilitychange", () => {
        if (document.visibilityState === "visible" && this.config.atualizar > 0) this.agendarAtualizacao(true);
      });
    }
  }
  /** O evento pertence a esta lista (e não a uma lista aninhada)? */
  donoDe(alvo) {
    const raiz = alvo.closest?.("[x-lista]");
    return raiz ? listas.get(raiz) : null;
  }
  /* ------------------------------------------------------------ filtros */
  controlesDeFiltro() {
    return Array.from(this.el.querySelectorAll("[data-lista-filtro], [data-lista-filtros] [name]")).filter((c) => this.donoDe(c) === this && c.name && !c.disabled && !c.hasAttribute("data-lista-ignorar"));
  }
  lerFiltrosDoDom(inicial = false) {
    const filtros = {};
    for (const controle of this.controlesDeFiltro()) {
      const nome = controle.name;
      if (inicial && Object.prototype.hasOwnProperty.call(this.state.filtros, nome)) {
        this.escreverControle(controle, this.state.filtros[nome]);
        continue;
      }
      const valor = this.lerControle(controle);
      if (valor === void 0) continue;
      if (Array.isArray(valor)) filtros[nome] = [...Array.isArray(filtros[nome]) ? filtros[nome] : [], ...valor];
      else if (filtros[nome] === void 0 || valor !== "") filtros[nome] = valor;
    }
    if (inicial) this.state.filtros = { ...filtros, ...this.state.filtros };
    return filtros;
  }
  lerControle(controle) {
    if (controle.type === "checkbox") {
      const grupo = this.controlesDeFiltro().filter((c) => c.name === controle.name && c.type === "checkbox");
      if (grupo.length > 1 || /\[\]$/.test(controle.name)) return controle.checked ? [controle.value] : [];
      return controle.checked ? controle.value : "";
    }
    if (controle.type === "radio") return controle.checked ? controle.value : void 0;
    if (controle.tagName === "SELECT" && controle.multiple) return Array.from(controle.selectedOptions).map((o) => o.value);
    const form = controle.form;
    const estado = form ? this.AlpineForm.get(form) : null;
    if (estado && estado.has(controle.name)) {
      const valor = estado.getValue(controle.name, { as: "submit" });
      return valor === null || valor === void 0 ? "" : typeof valor === "string" ? valor.trim() : valor;
    }
    return String(controle.value ?? "").trim();
  }
  escreverControle(controle, valor) {
    const lista = Array.isArray(valor) ? valor.map(String) : [String(valor ?? "")];
    if (controle.type === "checkbox" || controle.type === "radio") controle.checked = lista.includes(controle.value);
    else if (controle.tagName === "SELECT" && controle.multiple) for (const o of controle.options) o.selected = lista.includes(o.value);
    else controle.value = lista[0] ?? "";
  }
  aoMudarFiltro(evento, digitando) {
    const controle = evento.target;
    if (!controle.matches?.("[data-lista-filtro], [data-lista-filtros] [name]") || this.donoDe(controle) !== this) return;
    if (controle.hasAttribute("data-lista-ignorar")) return;
    if (controle.closest("[data-lista-filtros]") && controle.closest("[data-lista-filtros]").hasAttribute("data-lista-aplicar-ao-enviar")) return;
    const texto = controle.tagName === "TEXTAREA" || controle.tagName === "INPUT" && !TIPOS_SEM_DIGITACAO.has(controle.type);
    if (texto !== digitando) return;
    clearTimeout(this.timerFiltro);
    const minimo = Number(controle.getAttribute("data-lista-minimo") || 0);
    const valor = String(controle.value ?? "").trim();
    if (texto && minimo > 0 && valor.length > 0 && valor.length < minimo) return;
    if (texto) this.timerFiltro = setTimeout(() => this.aplicarFiltrosDoDom(), this.config.debounce);
    else this.aplicarFiltrosDoDom();
  }
  aplicarFiltrosDoDom() {
    this.state.filtros = this.lerFiltrosDoDom();
    this.state.pagina = 1;
    this.carregar({ historico: "substituir", reiniciar: true });
  }
  definirFiltros(filtros) {
    if (!isObjeto(filtros)) throw new this.ConfigError("definirFiltros espera um objeto { nome: valor }.");
    const novos = { ...this.state.filtros, ...filtros };
    for (const [nome, valor] of Object.entries(novos)) if (valor === null || valor === void 0) delete novos[nome];
    this.state.filtros = novos;
    for (const controle of this.controlesDeFiltro()) {
      if (Object.prototype.hasOwnProperty.call(filtros, controle.name)) this.escreverControle(controle, filtros[controle.name] ?? "");
    }
    this.state.pagina = 1;
    return this.carregar({ historico: "substituir", reiniciar: true });
  }
  limparFiltros() {
    for (const controle of this.controlesDeFiltro()) {
      if (controle.type === "checkbox" || controle.type === "radio") controle.checked = controle.defaultChecked;
      else if (controle.tagName === "SELECT") for (const o of controle.options) o.selected = o.defaultSelected;
      else controle.value = controle.defaultValue;
    }
    clearTimeout(this.timerFiltro);
    this.state.filtros = this.lerFiltrosDoDom();
    this.state.pagina = 1;
    return this.carregar({ historico: "substituir", reiniciar: true });
  }
  /* ------------------------------------------------------------ navegação */
  irPara(n) {
    const pagina = inteiro(n);
    if (!pagina || pagina < 1) return Promise.resolve(false);
    if (this.state.ultimaPagina && pagina > this.state.ultimaPagina) return Promise.resolve(false);
    if (pagina === this.state.pagina && this.state.carregado) return Promise.resolve(false);
    this.state.pagina = pagina;
    return this.carregar({ historico: "empilhar" });
  }
  ordenar(campo, direcao) {
    if (!campo) return Promise.resolve(false);
    const nova = direcao ? String(direcao).toLowerCase() : this.state.ordem === campo ? this.state.direcao === "asc" ? "desc" : "asc" : "asc";
    if (!["asc", "desc"].includes(nova)) throw new this.ConfigError(`Dire\xE7\xE3o de ordena\xE7\xE3o inv\xE1lida: "${direcao}". Use "asc" ou "desc".`);
    this.state.ordem = campo;
    this.state.direcao = nova;
    this.state.pagina = 1;
    return this.carregar({ historico: "empilhar", reiniciar: true });
  }
  definirPorPagina(n) {
    const valor = inteiro(n);
    if (!valor || valor < 1 || valor > 1e3) return Promise.resolve(false);
    this.state.porPagina = valor;
    this.state.pagina = 1;
    return this.carregar({ historico: "empilhar", reiniciar: true });
  }
  maisItens() {
    if (this.state.carregando || this.state.temProxima === false) return Promise.resolve(false);
    this.state.pagina += 1;
    return this.carregar({ historico: "substituir", acumular: true });
  }
  aoClicar(evento) {
    const alvo = evento.target.closest?.("[data-lista-ordenar], [data-lista-pagina], [data-lista-anterior], [data-lista-proxima], [data-lista-mais], [data-lista-recarregar], [data-lista-limpar]");
    if (!alvo || this.donoDe(alvo) !== this) return;
    if (alvo.hasAttribute("data-lista-ordenar")) {
      evento.preventDefault();
      this.ordenar(alvo.getAttribute("data-lista-ordenar"));
    } else if (alvo.hasAttribute("data-lista-pagina")) {
      evento.preventDefault();
      this.irPara(alvo.getAttribute("data-lista-pagina"));
    } else if (alvo.hasAttribute("data-lista-anterior")) {
      evento.preventDefault();
      this.irPara(this.state.pagina - 1);
    } else if (alvo.hasAttribute("data-lista-proxima")) {
      evento.preventDefault();
      this.irPara(this.state.pagina + 1);
    } else if (alvo.hasAttribute("data-lista-mais")) {
      evento.preventDefault();
      this.maisItens();
    } else if (alvo.hasAttribute("data-lista-recarregar")) {
      evento.preventDefault();
      this.carregar();
    } else if (alvo.hasAttribute("data-lista-limpar")) {
      evento.preventDefault();
      this.limparFiltros();
    }
  }
  aoMudar(evento) {
    const alvo = evento.target;
    if (this.donoDe(alvo) !== this) return;
    if (alvo.matches?.("[data-lista-tamanho]")) {
      this.definirPorPagina(alvo.value);
      return;
    }
    if (alvo.matches?.("[data-lista-selecionar-todos]")) {
      this.alternarTodos(alvo.checked);
      return;
    }
    if (alvo.matches?.("[data-lista-selecionar]")) {
      this.alternarSelecao(alvo.getAttribute("data-lista-selecionar"), alvo.checked);
      return;
    }
    this.aoMudarFiltro(evento, false);
  }
  /* ------------------------------------------------------------ seleção */
  alternarSelecao(chave, marcado) {
    const id = this.normalizarChave(chave);
    const atual = this.state.selecionados.includes(id);
    const deve = marcado === void 0 ? !atual : !!marcado;
    if (deve === atual) return;
    this.state.selecionados = deve ? [...this.state.selecionados, id] : this.state.selecionados.filter((s) => s !== id);
    this.aposSelecao();
  }
  alternarTodos(marcado) {
    const chaves = this.state.itens.map((item) => this.chaveDe(item));
    const deve = marcado === void 0 ? !this.state.todosSelecionados : !!marcado;
    const resto = this.state.selecionados.filter((s) => !chaves.includes(s));
    this.state.selecionados = deve ? [...resto, ...chaves] : resto;
    this.aposSelecao();
  }
  limparSelecao() {
    this.state.selecionados = [];
    this.aposSelecao();
  }
  aposSelecao() {
    this.sincronizarSelecaoNoDom();
    this.disparar("lista:selecao", { selecionados: this.state.selecionados.slice() });
  }
  /* ------------------------------------------------------------ requisição */
  parametros() {
    const p = this.config.parametros;
    const params = {};
    params[p.pagina] = String(this.state.pagina);
    params[p.porPagina] = String(this.state.porPagina);
    if (this.state.ordem) {
      params[p.ordem] = this.state.ordem;
      params[p.direcao] = this.state.direcao;
    }
    for (const [nome, valor] of Object.entries(this.state.filtros)) {
      if (valor === "" || valor === null || valor === void 0 || Array.isArray(valor) && !valor.length) continue;
      params[nome] = valor;
    }
    return params;
  }
  queryString(comPrefixo) {
    const busca = new URLSearchParams();
    for (const [nome, valor] of Object.entries(this.parametros())) {
      const chave = (comPrefixo ? this.config.prefixo : "") + nome;
      if (Array.isArray(valor)) for (const v of valor) busca.append(chave, v);
      else busca.append(chave, valor);
    }
    return busca.toString();
  }
  /** URL de exportação/relatório com os mesmos filtros e ordenação (sem paginação). */
  urlCom(base) {
    const url = new URL(base, globalThis.location?.href);
    const p = this.config.parametros;
    for (const [nome, valor] of Object.entries(this.parametros())) {
      if (nome === p.pagina || nome === p.porPagina) continue;
      if (Array.isArray(valor)) for (const v of valor) url.searchParams.append(nome, v);
      else url.searchParams.set(nome, valor);
    }
    return url.pathname + url.search;
  }
  transporte() {
    const registro = this.AlpineForm.registry;
    return registro.get("transport", registro.has("transport", "lista") ? "lista" : "fetch");
  }
  cabecalhos(url) {
    const headers = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
    try {
      if (new URL(url, globalThis.location.href).origin !== globalThis.location.origin) return { Accept: "application/json" };
    } catch {
      return headers;
    }
    return headers;
  }
  async carregar({ historico = "nenhum", acumular = false, reiniciar = false } = {}) {
    if (this.destruida) return false;
    this.requisicao?.abort();
    const controller = new AbortController();
    this.requisicao = controller;
    const numero = ++this.sequencia;
    const state = this.state;
    state.carregando = true;
    state.erro = null;
    this.el.setAttribute("aria-busy", "true");
    this.renderizarDom();
    if (historico !== "nenhum") this.escreverUrl(historico);
    const url = new URL(this.config.url, globalThis.location?.href);
    for (const [nome, valor] of Object.entries(this.parametros())) {
      if (Array.isArray(valor)) {
        url.searchParams.delete(nome);
        for (const v of valor) url.searchParams.append(nome, v);
      } else url.searchParams.set(nome, valor);
    }
    let resposta;
    try {
      const raw = await this.transporte()({
        url: url.href,
        method: "GET",
        headers: this.cabecalhos(url.href),
        body: null,
        credentials: "same-origin",
        timeout: this.config.timeout,
        signal: controller.signal
      });
      if (numero !== this.sequencia) return false;
      resposta = this.interpretar(raw);
    } catch (error) {
      if (numero !== this.sequencia) return false;
      const abortado = error?.name === "AbortError" || error?.kind === "abort";
      if (abortado) return false;
      resposta = { erro: { kind: error?.kind || "network", message: this.AlpineForm.messages["submit.network"] || this.mensagem("lista.erro") } };
    }
    if (numero !== this.sequencia || this.destruida) return false;
    this.requisicao = null;
    state.carregando = false;
    this.el.removeAttribute("aria-busy");
    if (resposta.erro) {
      state.erro = resposta.erro;
      if (acumular) state.pagina = Math.max(1, state.pagina - 1);
      if (this.podeLogar()) console.error("[AlpineForm] lista:", resposta.erro.message);
      this.renderizarDom();
      this.disparar("lista:erro", { erro: { ...resposta.erro } });
      return false;
    }
    const dados = resposta.dados;
    state.itens = acumular ? [...state.itens, ...dados.itens] : dados.itens;
    state.total = dados.total;
    state.pagina = dados.pagina || state.pagina;
    state.porPagina = dados.porPagina || state.porPagina;
    state.ultimaPagina = dados.ultimaPagina;
    state.temProxima = dados.temProxima === null ? dados.itens.length >= state.porPagina : dados.temProxima;
    state.carregado = true;
    if (reiniciar && this.config.modo === "acumular") this.state.selecionados = this.state.selecionados.filter((s) => state.itens.some((i) => this.chaveDe(i) === s));
    this.Alpine.nextTick(() => {
      this.renderizarDom();
      this.sincronizarSelecaoNoDom();
      this.reavaliarSentinela();
    });
    this.renderizarDom();
    this.disparar("lista:carregada", { itens: state.itens.length, total: state.total, pagina: state.pagina });
    if (!dados.itens.length && state.ultimaPagina && state.pagina > state.ultimaPagina && !acumular) {
      state.pagina = state.ultimaPagina;
      return this.carregar({ historico: "substituir" });
    }
    return true;
  }
  interpretar(raw) {
    const parse = this.AlpineForm.internals.parseBody;
    const corpo = parse(raw);
    const m = (chave) => this.AlpineForm.messages[chave];
    if (raw.status < 200 || raw.status >= 300) {
      const mapa = { 401: "submit.auth", 403: "submit.forbidden", 419: "submit.csrf", 429: "submit.rate_limited" };
      const chave = mapa[raw.status] || (raw.status >= 500 ? "submit.server" : "submit.http");
      const doServidor = corpo.type === "json" && isObjeto(corpo.json) ? corpo.json.message || corpo.json.mensagem : null;
      return { erro: { kind: "http", status: raw.status, message: doServidor || interpolar(m(chave) || this.mensagem("lista.erro"), { status: raw.status }) } };
    }
    if (corpo.type === "html") return { erro: { kind: "html", status: raw.status, message: m("submit.html") || this.mensagem("lista.erro") } };
    if (corpo.type !== "json") return { erro: { kind: "parse", status: raw.status, message: this.mensagem("lista.erro_contrato") } };
    let dados;
    try {
      dados = this.config.adaptador(corpo.json, { porPagina: this.state.porPagina, pagina: this.state.pagina, raw });
    } catch (error) {
      return { erro: { kind: "adapter", status: raw.status, message: error?.message || this.mensagem("lista.erro_contrato") } };
    }
    if (dados && dados.erro !== void 0 && !dados.itens) return { erro: { kind: "logical", status: raw.status, message: dados.erro || this.mensagem("lista.erro") } };
    if (!dados || !Array.isArray(dados.itens)) return { erro: { kind: "contract", status: raw.status, message: this.mensagem("lista.erro_contrato") } };
    return { dados };
  }
  disparar(nome, detalhe) {
    this.el.dispatchEvent(new CustomEvent(nome, { bubbles: true, detail: detalhe }));
  }
  /* ------------------------------------------------------------ URL */
  lerUrl() {
    const busca = new URLSearchParams(globalThis.location?.search || "");
    const p = this.config.parametros;
    const pre = this.config.prefixo;
    const pagina = inteiro(busca.get(pre + p.pagina));
    if (pagina && pagina >= 1) this.state.pagina = pagina;
    const tamanho = inteiro(busca.get(pre + p.porPagina));
    if (tamanho && tamanho >= 1 && tamanho <= 1e3) this.state.porPagina = tamanho;
    const ordem = busca.get(pre + p.ordem);
    if (ordem) this.state.ordem = ordem;
    const direcao = (busca.get(pre + p.direcao) || "").toLowerCase();
    if (["asc", "desc"].includes(direcao)) this.state.direcao = direcao;
    const nomes = new Set(this.controlesDeFiltro().map((c) => c.name));
    const filtros = {};
    for (const nome of nomes) {
      const valores = busca.getAll(pre + nome);
      if (!valores.length) continue;
      filtros[nome] = /\[\]$/.test(nome) || this.controlesDeFiltro().some((c) => c.name === nome && (c.multiple || c.type === "checkbox")) ? valores : valores[0];
    }
    this.state.filtros = filtros;
  }
  escreverUrl(modo) {
    if (!this.config.sincronizarUrl || typeof history === "undefined") return;
    const url = new URL(globalThis.location.href);
    const pre = this.config.prefixo;
    const nossos = new Set([...Object.values(this.config.parametros), ...this.controlesDeFiltro().map((c) => c.name)].map((n) => pre + n));
    for (const chave of Array.from(url.searchParams.keys())) if (nossos.has(chave)) url.searchParams.delete(chave);
    const p = this.config.parametros;
    for (const [nome, valor] of Object.entries(this.parametros())) {
      if (nome === p.pagina && valor === "1") continue;
      if (nome === p.porPagina && Number(valor) === this.config.porPagina) continue;
      if (Array.isArray(valor)) for (const v of valor) url.searchParams.append(pre + nome, v);
      else url.searchParams.set(pre + nome, valor);
    }
    if (url.href === globalThis.location.href) return;
    if (modo === "empilhar") history.pushState({ alpineformLista: true }, "", url);
    else history.replaceState(history.state, "", url);
  }
  aoVoltarHistorico() {
    this.lerUrl();
    if (!new URLSearchParams(globalThis.location.search).get(this.config.prefixo + this.config.parametros.pagina)) this.state.pagina = 1;
    for (const controle of this.controlesDeFiltro()) {
      const valor = this.state.filtros[controle.name];
      if (valor === void 0) {
        if (controle.type === "checkbox" || controle.type === "radio") controle.checked = controle.defaultChecked;
        else controle.value = controle.defaultValue;
      } else this.escreverControle(controle, valor);
    }
    this.carregar({ historico: "nenhum" });
  }
  /* ------------------------------------------------------------ DOM auxiliar */
  textoStatus() {
    const s = this.state;
    if (s.carregando && !s.itens.length) return this.mensagem("lista.carregando");
    if (s.erro) return s.erro.message;
    if (s.carregando) return this.mensagem("lista.carregando");
    if (!s.carregado) return "";
    if (!s.itens.length) return this.mensagem("lista.vazio");
    return s.total !== null ? this.mensagem("lista.resumo", { de: s.de, ate: s.ate, total: s.total }) : this.mensagem("lista.resumo_sem_total", { de: s.de, ate: s.ate });
  }
  elementos(seletor) {
    return Array.from(this.el.querySelectorAll(seletor)).filter((e) => this.donoDe(e) === this);
  }
  renderizarDom() {
    if (this.destruida) return;
    const s = this.state;
    const status = this.textoStatus();
    for (const el of this.elementos("[data-lista-status]")) {
      if (!el.hasAttribute("role")) el.setAttribute("role", "status");
      if (!el.hasAttribute("aria-live")) el.setAttribute("aria-live", "polite");
      if (el.textContent !== status) el.textContent = status;
    }
    for (const botao of this.elementos("[data-lista-ordenar]")) {
      const campo = botao.getAttribute("data-lista-ordenar");
      const alvo = botao.closest("th") || botao;
      const valor = s.ordem === campo ? s.direcao === "asc" ? "ascending" : "descending" : "none";
      if (alvo.getAttribute("aria-sort") !== valor) alvo.setAttribute("aria-sort", valor);
      const ativo = s.ordem === campo ? s.direcao : "";
      if ((botao.getAttribute("data-lista-direcao-atual") || "") !== ativo) {
        if (ativo) botao.setAttribute("data-lista-direcao-atual", ativo);
        else botao.removeAttribute("data-lista-direcao-atual");
      }
    }
    const desabilitar = (seletor, condicao) => {
      for (const el of this.elementos(seletor)) if (el.disabled !== condicao) el.disabled = condicao;
    };
    desabilitar("[data-lista-anterior]", s.carregando || !s.temAnterior);
    desabilitar("[data-lista-proxima]", s.carregando || !s.temProxima);
    desabilitar("[data-lista-mais]", s.carregando || !s.temProxima);
    for (const el of this.elementos("[data-lista-mais]")) {
      const ocultar = s.carregado && !s.temProxima;
      if (el.hidden !== ocultar) el.hidden = ocultar;
    }
    for (const select of this.elementos("[data-lista-tamanho]")) if (select.value !== String(s.porPagina)) select.value = String(s.porPagina);
    for (const nav of this.elementos("[data-lista-paginacao]")) this.renderizarPaginacao(nav);
  }
  renderizarPaginacao(nav) {
    const s = this.state;
    const assinatura = `${s.pagina}|${s.ultimaPagina}|${s.carregando}|${s.temProxima}|${this.config.modo}`;
    if (nav.getAttribute("data-lista-assinatura") === assinatura) return;
    nav.setAttribute("data-lista-assinatura", assinatura);
    if (!nav.hasAttribute("aria-label")) nav.setAttribute("aria-label", this.mensagem("lista.navegacao"));
    nav.textContent = "";
    if (this.config.modo !== "paginas" || !s.ultimaPagina && !s.temProxima && s.pagina <= 1) return;
    const lista = document.createElement("ul");
    lista.className = "af-paginacao";
    lista.setAttribute("data-form-generated", "paginacao");
    const botao = (texto, atributos, desabilitado, atual) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = texto;
      for (const [k, v] of Object.entries(atributos)) b.setAttribute(k, v);
      if (desabilitado) b.disabled = true;
      if (atual) b.setAttribute("aria-current", "page");
      li.appendChild(b);
      lista.appendChild(li);
    };
    botao(this.mensagem("lista.anterior"), { "data-lista-anterior": "" }, s.carregando || s.pagina <= 1);
    for (const p of s.paginas) {
      if (p.reticencias) {
        const li = document.createElement("li");
        li.className = "af-paginacao__reticencias";
        li.textContent = "\u2026";
        li.setAttribute("aria-hidden", "true");
        lista.appendChild(li);
      } else {
        botao(String(p.numero), { "data-lista-pagina": String(p.numero), "aria-label": this.mensagem("lista.pagina", { pagina: p.numero }) }, s.carregando && !p.atual, p.atual);
      }
    }
    botao(this.mensagem("lista.proxima"), { "data-lista-proxima": "" }, s.carregando || !s.temProxima);
    nav.appendChild(lista);
  }
  sincronizarSelecaoNoDom() {
    if (this.destruida) return;
    for (const caixa of this.elementos("[data-lista-selecionar]")) {
      const marcado = this.state.selecionados.includes(this.normalizarChave(caixa.getAttribute("data-lista-selecionar")));
      if (caixa.checked !== marcado) caixa.checked = marcado;
    }
    for (const caixa of this.elementos("[data-lista-selecionar-todos]")) {
      if (caixa.checked !== this.state.todosSelecionados) caixa.checked = this.state.todosSelecionados;
      if (caixa.indeterminate !== this.state.algunsSelecionados) caixa.indeterminate = this.state.algunsSelecionados;
    }
  }
  observarSentinela() {
    const sentinelas = this.elementos("[data-lista-sentinela]");
    if (!sentinelas.length || typeof IntersectionObserver !== "function") return;
    this.observadorSentinela = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting) && this.state.carregado && !this.state.erro) this.maisItens();
    }, { rootMargin: "200px" });
    for (const s of sentinelas) this.observadorSentinela.observe(s);
  }
  /**
   * O IntersectionObserver só avisa quando a visibilidade MUDA. Se o sentinela continua visível depois
   * de uma carga (tela alta, poucos itens), observá-lo de novo gera um aviso novo e carrega a próxima
   * página — até o sentinela sair da área visível.
   */
  reavaliarSentinela() {
    if (!this.observadorSentinela || this.destruida) return;
    for (const s of this.elementos("[data-lista-sentinela]")) {
      this.observadorSentinela.unobserve(s);
      this.observadorSentinela.observe(s);
    }
  }
  agendarAtualizacao(imediato = false) {
    clearTimeout(this.timerAtualizar);
    if (this.destruida || this.config.atualizar <= 0) return;
    const executar = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!this.state.carregando) this.carregar();
      this.agendarAtualizacao();
    };
    if (imediato) executar();
    else this.timerAtualizar = setTimeout(executar, this.config.atualizar);
  }
  destroy() {
    this.destruida = true;
    this.requisicao?.abort();
    clearTimeout(this.timerFiltro);
    clearTimeout(this.timerAtualizar);
    this.observadorSentinela?.disconnect();
    for (const remover of this.removers) remover();
    this.removers = [];
    for (const nav of this.elementos("[data-lista-paginacao]")) {
      nav.textContent = "";
      nav.removeAttribute("data-lista-assinatura");
    }
    this.el.removeAttribute("aria-busy");
    clearTimeout(this.timerDestaque);
    listas.delete(this.el);
    ativas.delete(this);
  }
};
function listaDe(el) {
  let atual = el;
  while (atual) {
    const lista = listas.get(atual);
    if (lista) return lista;
    const alvo = atual.getAttribute?.("data-lista-para");
    if (alvo) {
      const raiz = document.getElementById(alvo);
      if (raiz && listas.get(raiz)) return listas.get(raiz);
    }
    atual = atual.parentElement;
  }
  return null;
}
function listaPlugin(AlpineForm) {
  for (const [chave, texto] of Object.entries(MENSAGENS)) if (!(chave in AlpineForm.messages)) AlpineForm.messages[chave] = texto;
  AlpineForm.alpine((Alpine) => {
    Alpine.directive("lista", (el, { expression }, { evaluate, cleanup }) => {
      try {
        const opcoes = expression ? evaluate(expression) : {};
        if (opcoes !== void 0 && opcoes !== null && !isObjeto(opcoes)) throw new AlpineForm.errors.ConfigError("A express\xE3o de x-lista deve resultar em um objeto simples.");
        const lista = new Lista(el, opcoes || {}, Alpine, AlpineForm);
        Alpine.nextTick(() => lista.iniciar());
        cleanup(() => lista.destroy());
      } catch (error) {
        el.setAttribute("data-lista-estado", "config-error");
        const local = el.getAttribute("data-form-log");
        if ((local ?? AlpineForm.internals.globalOption?.("log")) !== "none") console.error("[AlpineForm] x-lista:", error.message, el);
      }
    });
    Alpine.magic("lista", (el) => listaDe(el)?.state ?? null);
  });
  const podeLogar = (origem) => {
    const local = origem?.getAttribute?.("data-form-log");
    return (local ?? AlpineForm.internals.globalOption?.("log")) !== "none";
  };
  if (typeof document !== "undefined") {
    document.addEventListener("form:success", (evento) => {
      const form = evento.target;
      const alvos = form?.getAttribute?.("data-form-lista");
      if (!alvos) return;
      const resultado = evento.detail?.result;
      atualizarListas(alvos, { registro: isObjeto(resultado?.data) ? resultado.data : null, origem: form, podeLogar });
    });
    document.addEventListener("lista:atualizar", (evento) => {
      const detalhe = evento.detail || {};
      atualizarListas(detalhe.alvos, { registro: detalhe.registro ?? null, origem: evento.target, podeLogar });
    });
  }
  AlpineForm.lista = {
    /** Atualiza listas por id ou data-lista-grupo; devolve quantas listas foram atualizadas. */
    atualizar(alvos, { registro = null } = {}) {
      return atualizarListas(alvos, { registro, podeLogar });
    },
    get(elOuId) {
      const el = typeof elOuId === "string" ? document.getElementById(elOuId) : elOuId;
      return el ? listas.get(el)?.state ?? null : null;
    },
    adaptador(nome, fn, { replace = false } = {}) {
      if (typeof fn !== "function") throw new AlpineForm.errors.ConfigError(`Adaptador de lista "${nome}" precisa ser uma fun\xE7\xE3o (json, ctx) => { itens, total, ... }.`);
      if (adaptadores.has(nome) && !replace) throw new AlpineForm.errors.ConfigError(`Adaptador de lista "${nome}" j\xE1 registrado. Use { replace: true } para substituir conscientemente.`);
      adaptadores.set(nome, fn);
    },
    janelaDePaginas,
    adaptadorPadrao
  };
}
export {
  adaptadorPadrao,
  listaPlugin as default,
  janelaDePaginas
};
