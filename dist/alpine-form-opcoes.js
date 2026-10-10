/*! AlpineForm v1.0.0 | MIT */
(() => {
  // src/opcoes/index.js
  var OPCOES_EVENTOS = {
    carregadas: "form:opcoes-carregadas",
    erro: "form:opcoes-erro"
  };
  var ATRIBUTOS = [
    "data-form-opcoes",
    "data-form-opcoes-valor",
    "data-form-opcoes-texto",
    "data-form-opcoes-grupo",
    "data-form-opcoes-selecionado",
    "data-form-opcoes-cache",
    "data-form-opcoes-debounce",
    "data-form-opcoes-vazio",
    "data-form-opcoes-manter-habilitado",
    "data-form-opcoes-estado"
    // escrito pelo módulo (aguardando|carregando|pronto|erro), para CSS
  ];
  var CHAVES_VALOR = ["value", "id", "codigo", "sigla", "key"];
  var CHAVES_TEXTO = ["label", "text", "nome", "name", "descricao", "titulo"];
  var ESPERA_PADRAO = 250;
  var TIMEOUT_MS = 15e3;
  var CACHE_MAX = 100;
  var PLACEHOLDER = /\{([^{}]+)\}/g;
  var cache = /* @__PURE__ */ new Map();
  function guardarCache(url, opcoes) {
    if (cache.has(url)) cache.delete(url);
    cache.set(url, opcoes);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  var isObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var primeiro = (obj, chaves) => {
    for (const k of chaves) if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null && obj[k] !== void 0) return obj[k];
    return void 0;
  };
  function extrairItens(json) {
    let corpo = json;
    if (isObjeto(corpo) && typeof corpo.success === "boolean") {
      if (!corpo.success) return null;
      corpo = corpo.data;
    }
    if (Array.isArray(corpo)) return corpo;
    if (!isObjeto(corpo)) return null;
    const lista = primeiro(corpo, ["data", "itens", "items", "opcoes", "options", "results"]);
    if (Array.isArray(lista)) return lista;
    const pares = Object.entries(corpo);
    if (pares.length && pares.every(([, v]) => typeof v === "string" || typeof v === "number")) return pares.map(([valor, texto]) => ({ value: valor, label: texto }));
    return null;
  }
  function normalizarOpcoes(itens, { campoValor = null, campoTexto = null, campoGrupo = null } = {}) {
    const vistos = /* @__PURE__ */ new Set();
    const saida = [];
    for (const item of itens) {
      let valor;
      let texto;
      let grupo = null;
      if (typeof item === "string" || typeof item === "number") {
        valor = texto = String(item);
      } else if (isObjeto(item)) {
        valor = campoValor ? item[campoValor] : primeiro(item, CHAVES_VALOR);
        texto = campoTexto ? item[campoTexto] : primeiro(item, CHAVES_TEXTO);
        if (texto === void 0 || texto === null) texto = valor;
        if (campoGrupo && item[campoGrupo] !== void 0 && item[campoGrupo] !== null) grupo = String(item[campoGrupo]);
      } else continue;
      if (valor === void 0 || valor === null || typeof valor !== "string" && typeof valor !== "number") continue;
      valor = String(valor);
      if (vistos.has(valor)) continue;
      vistos.add(valor);
      saida.push({ valor, texto: String(texto), grupo });
    }
    return saida;
  }
  function lerDuracao(texto, padrao, ConfigError, attr) {
    if (texto === null || texto === void 0) return padrao;
    const m = /^(\d+)\s*(ms|s)?$/.exec(String(texto).trim());
    if (!m) throw new ConfigError(`Dura\xE7\xE3o inv\xE1lida em ${attr}="${texto}". Use 300, 300ms ou 1s.`);
    return Number(m[1]) * (m[2] === "s" ? 1e3 : 1);
  }
  function lerBooleano(el, attr, padrao, ConfigError) {
    const v = el.getAttribute(attr);
    if (v === null) return padrao;
    if (v === "" || v === "true" || v === attr) return true;
    if (v === "false") return false;
    throw new ConfigError(`Valor booleano inv\xE1lido em ${attr}="${v}". Use o atributo sem valor, "true" ou "false".`);
  }
  var SelectRemoto = class {
    constructor(ext, field) {
      this.ext = ext;
      this.controller = ext.controller;
      this.field = field;
      this.select = field.primary;
      this.urlAtual = void 0;
      this.abort = null;
      this.timer = null;
      this.token = 0;
      this.carregando = false;
      this.erro = null;
      this.desabilitadoPorMim = false;
      const inicial = this.select.getAttribute("data-form-opcoes-selecionado");
      this.desejado = inicial !== null ? inicial : this.select.value || "";
      this.validarConfig();
    }
    validarConfig() {
      const { ConfigError } = this.ext;
      if (this.field.kind !== "select" && this.field.kind !== "select-multiple") {
        throw new ConfigError(`data-form-opcoes s\xF3 \xE9 aceito em <select> (campo "${this.field.name}").`);
      }
      this.config();
    }
    config() {
      const { ConfigError } = this.ext;
      const s = this.select;
      const modelo = (s.getAttribute("data-form-opcoes") || "").trim();
      if (!modelo) throw new ConfigError(`data-form-opcoes vazio no campo "${this.field.name}". Informe a URL, ex.: /api/cidades?uf={uf}.`);
      return {
        modelo,
        campoValor: s.getAttribute("data-form-opcoes-valor") || null,
        campoTexto: s.getAttribute("data-form-opcoes-texto") || null,
        campoGrupo: s.getAttribute("data-form-opcoes-grupo") || null,
        cache: lerBooleano(s, "data-form-opcoes-cache", true, ConfigError),
        espera: lerDuracao(s.getAttribute("data-form-opcoes-debounce"), ESPERA_PADRAO, ConfigError, "data-form-opcoes-debounce"),
        vazio: s.getAttribute("data-form-opcoes-vazio"),
        manterHabilitado: lerBooleano(s, "data-form-opcoes-manter-habilitado", false, ConfigError)
      };
    }
    /** Campos citados no modelo da URL. */
    dependencias(modelo = this.config().modelo) {
      return Array.from(modelo.matchAll(PLACEHOLDER), (m) => m[1].trim());
    }
    /** URL final ou null quando algum campo citado está vazio. */
    montarUrl() {
      const { ConfigError } = this.ext;
      const { modelo } = this.config();
      let faltando = false;
      const url = modelo.replace(PLACEHOLDER, (_, nome) => {
        const campo = this.controller.resolveField(nome.trim());
        if (!campo) throw new ConfigError(`data-form-opcoes do campo "${this.field.name}" cita {${nome}}, que n\xE3o existe neste formul\xE1rio.`);
        if (campo === this.field) throw new ConfigError(`data-form-opcoes do campo "${this.field.name}" n\xE3o pode depender dele mesmo.`);
        let valor = campo.disabled ? "" : campo.getValue("submit");
        if (Array.isArray(valor)) valor = valor.join(",");
        valor = valor === null || valor === void 0 || valor === false ? "" : String(valor);
        if (valor === "") faltando = true;
        return encodeURIComponent(valor);
      });
      if (faltando) return null;
      const absoluta = new URL(url, document.baseURI);
      if (absoluta.origin !== location.origin) {
        throw new ConfigError(`data-form-opcoes do campo "${this.field.name}" aponta para outra origem (${absoluta.origin}). Use um endpoint do pr\xF3prio site (proxy no servidor).`);
      }
      return absoluta.href;
    }
    /** Algo mudou no formulário: recalcula a URL e carrega se ela mudou. */
    avaliar({ imediato = false, forcar = false } = {}) {
      let url;
      try {
        url = this.montarUrl();
      } catch (error) {
        this.ext.falhaConfig(error, this.field);
        return;
      }
      if (!forcar && url === this.urlAtual) return;
      clearTimeout(this.timer);
      this.abort?.abort();
      this.urlAtual = url;
      if (url === null) {
        this.aplicar([], { aguardando: true });
        return;
      }
      const { cache: usarCache, espera } = this.config();
      if (usarCache && !forcar && cache.has(url)) {
        this.aplicar(cache.get(url));
        return;
      }
      if (this.desejado === null || this.desejado === "") {
        const atual = this.field.getValue("display");
        if (Array.isArray(atual) ? atual.length : atual) this.desejado = atual;
      }
      this.limparOpcoes();
      this.definirEstado("carregando");
      this.atualizarDisabled(true);
      if (imediato || espera === 0) this.carregar(url);
      else this.timer = setTimeout(() => this.carregar(url), espera);
    }
    async carregar(url) {
      const token = ++this.token;
      const controle = new AbortController();
      this.abort = controle;
      this.carregando = true;
      const AF = this.ext.AlpineForm;
      const registro = AF.registry;
      const transporte = registro.get("transport", registro.has("transport", "opcoes") ? "opcoes" : "fetch");
      let opcoes;
      try {
        const raw = await transporte({
          url,
          method: "GET",
          headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: null,
          credentials: "same-origin",
          timeout: TIMEOUT_MS,
          signal: controle.signal
        });
        if (token !== this.token) return;
        if (raw.status < 200 || raw.status >= 300) throw Object.assign(new Error(`HTTP ${raw.status}`), { status: raw.status });
        const corpo = AF.internals.parseBody(raw);
        if (corpo.type !== "json") throw Object.assign(new Error("Resposta n\xE3o \xE9 JSON."), { status: raw.status });
        const itens = extrairItens(corpo.json);
        if (!itens) throw Object.assign(new Error("Formato de resposta n\xE3o reconhecido para op\xE7\xF5es."), { status: raw.status });
        const { campoValor, campoTexto, campoGrupo, cache: usarCache } = this.config();
        opcoes = normalizarOpcoes(itens, { campoValor, campoTexto, campoGrupo });
        if (usarCache) guardarCache(url, opcoes);
      } catch (error) {
        if (token !== this.token || this.ext.destruido) return;
        if (error?.name === "AbortError" || error?.kind === "abort") return;
        this.carregando = false;
        this.erro = { status: error?.status ?? null, message: AF.messages["opcoes.erro"] };
        this.definirEstado("erro");
        this.atualizarDisabled(false);
        this.controller.log("error", `Falha ao carregar op\xE7\xF5es de "${this.field.name}" (${url}):`, error?.message);
        this.ext.form.dispatchEvent(new CustomEvent(OPCOES_EVENTOS.erro, { bubbles: true, detail: { name: this.field.name, url, status: this.erro.status } }));
        return;
      }
      if (token !== this.token || this.ext.destruido || url !== this.urlAtual) return;
      this.carregando = false;
      this.aplicar(opcoes);
    }
    limparOpcoes() {
      for (const el of Array.from(this.select.querySelectorAll("[data-form-generated]"))) el.remove();
      for (const opcao of Array.from(this.select.options)) {
        if (opcao.value !== "" && !opcao.hasAttribute("data-form-generated")) opcao.remove();
      }
    }
    aplicar(opcoes, { aguardando = false } = {}) {
      this.carregando = false;
      const anterior = this.field.getValue("display");
      const atual = Array.isArray(anterior) ? anterior : anterior ? [anterior] : [];
      const desejado = this.desejado;
      const temDesejado = Array.isArray(desejado) ? desejado.length > 0 : desejado !== null && desejado !== "";
      const queridos = temDesejado ? [].concat(desejado).map(String) : atual.map(String);
      this.limparOpcoes();
      const { vazio } = this.config();
      const fragmento = document.createDocumentFragment();
      const grupos = /* @__PURE__ */ new Map();
      for (const { valor, texto, grupo } of opcoes) {
        const opcao = document.createElement("option");
        opcao.setAttribute("data-form-generated", "opcao");
        opcao.value = valor;
        opcao.textContent = texto;
        if (grupo !== null) {
          let og = grupos.get(grupo);
          if (!og) {
            og = document.createElement("optgroup");
            og.setAttribute("data-form-generated", "opcoes-grupo");
            og.label = grupo;
            grupos.set(grupo, og);
            fragmento.appendChild(og);
          }
          og.appendChild(opcao);
        } else fragmento.appendChild(opcao);
      }
      if (!opcoes.length && !aguardando && vazio) {
        const opcao = document.createElement("option");
        opcao.setAttribute("data-form-generated", "opcoes-vazio");
        opcao.value = "";
        opcao.disabled = true;
        opcao.textContent = vazio;
        fragmento.appendChild(opcao);
      }
      this.select.appendChild(fragmento);
      this.erro = null;
      const existentes = new Set(opcoes.map((o) => o.valor));
      const manter = queridos.filter((v) => existentes.has(v));
      const novo = this.field.kind === "select-multiple" ? manter : manter[0] ?? "";
      const mudou = JSON.stringify(novo) !== JSON.stringify(this.field.kind === "select-multiple" ? atual : atual[0] ?? "");
      if (!aguardando) this.desejado = null;
      this.definirEstado(aguardando ? "aguardando" : "pronto");
      this.atualizarDisabled(aguardando || opcoes.length === 0);
      if (mudou) this.controller.setValue(this.field, novo, { silent: false });
      else this.controller.setValue(this.field, novo, { silent: true });
      if (!aguardando) {
        this.ext.form.dispatchEvent(new CustomEvent(OPCOES_EVENTOS.carregadas, { bubbles: true, detail: { name: this.field.name, total: opcoes.length, url: this.urlAtual } }));
      }
    }
    definirEstado(estado) {
      if (this.select.getAttribute("data-form-opcoes-estado") !== estado) this.select.setAttribute("data-form-opcoes-estado", estado);
      const ocupado = estado === "carregando" ? "true" : null;
      if (ocupado) {
        if (this.select.getAttribute("aria-busy") !== "true") this.select.setAttribute("aria-busy", "true");
      } else if (this.select.hasAttribute("aria-busy")) this.select.removeAttribute("aria-busy");
    }
    /** Desabilita só o que o próprio módulo desabilitou; nunca reabilita um select desabilitado pelo HTML/Alpine. */
    atualizarDisabled(desabilitar) {
      if (this.config().manterHabilitado) desabilitar = false;
      if (desabilitar) {
        if (!this.select.disabled) {
          this.select.disabled = true;
          this.desabilitadoPorMim = true;
        }
      } else if (this.desabilitadoPorMim) {
        this.select.disabled = false;
        this.desabilitadoPorMim = false;
      }
    }
    /**
     * Seleciona um valor agora, se a lista atual já o tem, ou assim que a próxima lista chegar
     * (útil quando outro código preenche a dependência e o valor ao mesmo tempo, ex.: CEP → UF e cidade).
     */
    selecionar(valor) {
      const v = valor === null || valor === void 0 ? "" : String(valor);
      const pronto = this.select.getAttribute("data-form-opcoes-estado") === "pronto";
      if (pronto) {
        if (v === "" || !Array.from(this.select.options).some((o) => o.value === v)) return false;
        this.desejado = null;
        this.controller.setValue(this.field, v);
        return true;
      }
      if (v === "") return false;
      this.desejado = v;
      return true;
    }
    destroy() {
      clearTimeout(this.timer);
      this.abort?.abort();
      this.token++;
      if (this.desabilitadoPorMim && this.select.isConnected) this.select.disabled = false;
      this.select.removeAttribute("data-form-opcoes-estado");
      this.select.removeAttribute("aria-busy");
    }
  };
  var OpcoesExtension = class {
    constructor(controller, AlpineForm) {
      this.controller = controller;
      this.form = controller.form;
      this.AlpineForm = AlpineForm;
      this.ConfigError = AlpineForm.errors.ConfigError;
      this.selects = /* @__PURE__ */ new Map();
      this.removers = [];
      this.destruido = false;
      const on = (type, handler) => {
        this.form.addEventListener(type, handler);
        this.removers.push(() => this.form.removeEventListener(type, handler));
      };
      on("form:ready", () => this.sincronizar({ imediato: true }));
      on("form:field-added", () => this.sincronizar({ imediato: true }));
      on("form:field-removed", () => this.sincronizar({ imediato: true }));
      on("form:change", (event) => this.aoMudar(event.detail?.name, event.detail?.trigger));
      on(OPCOES_EVENTOS.carregadas, (event) => this.aoMudar(event.detail?.name, "opcoes"));
      on("form:reset", () => setTimeout(() => {
        this.sincronizar({ imediato: true });
        for (const remoto of this.selects.values()) remoto.avaliar({ imediato: true });
      }, 0));
    }
    /** Erro de configuração: como no núcleo, marca o campo, registra no estado (bloqueia o envio) e avisa. */
    falhaConfig(error, field) {
      if (!(error && (error.kind === "config" || error.name === "ConfigError"))) throw error;
      if (field.configError?.message === error.message) return;
      field.configError = error;
      field.state.configError = error.message;
      const erros = this.controller.state.configErrors.filter((e) => e.field !== field.key);
      this.controller.state.configErrors = [...erros, { field: field.key, message: error.message }];
      this.controller.log("error", `Campo "${field.name}":`, error.message, field.primary);
      this.form.dispatchEvent(new CustomEvent("form:config-error", { bubbles: true, detail: { errors: this.controller.state.configErrors.slice() } }));
    }
    /** Cria/remove controladores conforme os selects com data-form-opcoes existentes. */
    sincronizar({ imediato = false, reavaliar = false } = {}) {
      if (this.destruido) return;
      const vivos = /* @__PURE__ */ new Set();
      for (const field of this.controller.fields.values()) {
        if (!field.primary?.hasAttribute?.("data-form-opcoes")) continue;
        vivos.add(field);
        if (!this.selects.has(field)) {
          try {
            this.selects.set(field, new SelectRemoto(this, field));
          } catch (error) {
            this.falhaConfig(error, field);
            continue;
          }
          this.selects.get(field).avaliar({ imediato });
        } else if (reavaliar) this.selects.get(field).avaliar({ imediato, forcar: true });
      }
      for (const [field, remoto] of this.selects) {
        if (!vivos.has(field)) {
          remoto.destroy();
          this.selects.delete(field);
        }
      }
    }
    aoMudar(nome, gatilho) {
      if (!nome) return;
      for (const remoto of this.selects.values()) {
        if (remoto.field.name === nome) continue;
        let deps;
        try {
          deps = remoto.dependencias();
        } catch {
          continue;
        }
        const citado = deps.some((d) => {
          const f = this.controller.resolveField(d);
          return f && f.name === nome;
        });
        if (!citado) continue;
        const campo = this.controller.resolveField(nome);
        const imediato = gatilho === "opcoes" || gatilho === "api" || campo && campo.kind !== "text";
        remoto.avaliar({ imediato });
      }
    }
    recarregar(nome) {
      for (const remoto of this.selects.values()) {
        if (!nome || remoto.field.name === nome) remoto.avaliar({ imediato: true, forcar: true });
      }
    }
    selecionar(nome, valor) {
      for (const remoto of this.selects.values()) {
        if (remoto.field.name === nome) return remoto.selecionar(valor);
      }
      return false;
    }
    estado(nome) {
      for (const remoto of this.selects.values()) {
        if (remoto.field.name === nome) return { carregando: remoto.carregando, erro: remoto.erro, url: remoto.urlAtual };
      }
      return null;
    }
    destroy() {
      this.destruido = true;
      for (const remoto of this.selects.values()) remoto.destroy();
      this.selects.clear();
      for (const remove of this.removers) remove();
      this.removers = [];
    }
  };
  function opcoesPlugin(AlpineForm) {
    const extensoes = /* @__PURE__ */ new WeakMap();
    AlpineForm.fieldAttributes(ATRIBUTOS);
    if (!AlpineForm.messages["opcoes.erro"]) AlpineForm.messages["opcoes.erro"] = "N\xE3o foi poss\xEDvel carregar as op\xE7\xF5es.";
    AlpineForm.formHook((controller) => {
      const ext = new OpcoesExtension(controller, AlpineForm);
      extensoes.set(controller.form, ext);
      return ext;
    });
    const resolver = (formOuId) => typeof formOuId === "string" ? document.getElementById(formOuId) : formOuId;
    AlpineForm.opcoes = {
      /** Busca de novo as opções de um select (ou de todos do formulário), ignorando o cache. */
      recarregar(formOuId, nome) {
        extensoes.get(resolver(formOuId))?.recarregar(nome);
      },
      /** { carregando, erro, url } de um select remoto. */
      estado(formOuId, nome) {
        return extensoes.get(resolver(formOuId))?.estado(nome) ?? null;
      },
      /** Seleciona um valor agora ou quando a lista do select chegar; false se a lista já carregada não o tem. */
      selecionar(formOuId, nome, valor) {
        return extensoes.get(resolver(formOuId))?.selecionar(nome, valor) ?? false;
      },
      /** O campo é um select controlado por este módulo? */
      controla(formOuId, nome) {
        const ext = extensoes.get(resolver(formOuId));
        return !!ext && ext.estado(nome) !== null;
      },
      limparCache() {
        cache.clear();
      },
      extrairItens,
      normalizarOpcoes
    };
  }

  // src/opcoes/cdn.js
  if (!window.AlpineForm) {
    console.error("[AlpineForm] alpine-form-opcoes deve ser carregado depois de alpine-form.");
  } else {
    window.AlpineForm.use(opcoesPlugin);
  }
})();
