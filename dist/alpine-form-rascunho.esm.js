/*! AlpineForm v1.0.0 | MIT */

// src/rascunho/index.js
var RASCUNHO_PREFIXO = "alpineform:rascunho:";
var DIA = 24 * 60 * 60 * 1e3;
var ESPERA_MS = 400;
var DIAS_PADRAO = 7;
var DIAS_MAXIMO = 365;
var RASCUNHO_EVENTOS = {
  restaurado: "form:rascunho-restaurado",
  salvo: "form:rascunho-salvo",
  apagado: "form:rascunho-apagado"
};
function storageDe(sessao) {
  try {
    return sessao ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return null;
  }
}
var RascunhoExtension = class {
  constructor(controller, ConfigError) {
    this.controller = controller;
    this.form = controller.form;
    this.timer = null;
    this.removers = [];
    const attr = this.form.getAttribute("data-form-rascunho");
    if (attr === null) {
      this.ativo = false;
      return;
    }
    const id = this.form.getAttribute("id");
    if (!id) throw new ConfigError("data-form-rascunho exige um id no <form> (o id identifica o rascunho no navegador).");
    const texto = attr.trim();
    if (texto !== "" && !/^\d+$/.test(texto)) {
      throw new ConfigError(`data-form-rascunho="${attr}" inv\xE1lido. Use o atributo sem valor (7 dias) ou um n\xFAmero de dias, ex.: data-form-rascunho="2".`);
    }
    const dias = texto === "" ? DIAS_PADRAO : Number(texto);
    if (dias < 1 || dias > DIAS_MAXIMO) throw new ConfigError(`data-form-rascunho="${attr}" fora do intervalo permitido (1 a ${DIAS_MAXIMO} dias).`);
    const sessao = this.form.getAttribute("data-form-rascunho-sessao");
    if (sessao !== null && !["", "true", "false", "data-form-rascunho-sessao"].includes(sessao)) {
      throw new ConfigError(`Valor booleano inv\xE1lido em data-form-rascunho-sessao="${sessao}". Use o atributo sem valor, "true" ou "false".`);
    }
    this.ativo = true;
    this.chave = RASCUNHO_PREFIXO + id;
    this.validadeMs = dias * DIA;
    this.sessao = sessao !== null && sessao !== "false";
    const on = (type, handler) => {
      this.form.addEventListener(type, handler);
      this.removers.push(() => this.form.removeEventListener(type, handler));
    };
    on("form:ready", () => this.restaurar());
    on("form:change", () => this.agendar());
    on("form:success", () => this.apagar());
    on("form:reset", () => this.apagar());
  }
  get storage() {
    if (!this.controller.storageAllowed) return null;
    return storageDe(this.sessao);
  }
  /** Campos que podem ir para o rascunho: nunca senha/sensível, arquivo ou marcado para ignorar. */
  guardavel(field) {
    if (!field || field.kind === "file" || field.sensitive) return false;
    return !field.controls.some((control) => control.hasAttribute("data-form-rascunho-ignorar"));
  }
  agendar() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.salvar(), ESPERA_MS);
  }
  salvar() {
    const storage = this.storage;
    if (!storage || this.controller.destroyed) return;
    const valores = {};
    for (const field of this.controller.fields.values()) {
      if (this.guardavel(field) && !field.disabled) valores[field.name] = field.getValue("display");
    }
    try {
      storage.setItem(this.chave, JSON.stringify({ salvoEm: Date.now(), valores }));
    } catch {
      return;
    }
    this.form.dispatchEvent(new CustomEvent(RASCUNHO_EVENTOS.salvo, { bubbles: true, detail: { campos: Object.keys(valores) } }));
  }
  ler() {
    const storage = this.storage;
    if (!storage) return null;
    try {
      const salvo = JSON.parse(storage.getItem(this.chave) || "null");
      return salvo && typeof salvo === "object" && salvo.valores && typeof salvo.valores === "object" ? salvo : null;
    } catch {
      return null;
    }
  }
  restaurar() {
    const salvo = this.ler();
    if (!salvo) return;
    if (!(Number(salvo.salvoEm) > 0) || Date.now() - salvo.salvoEm > this.validadeMs) {
      this.apagar();
      return;
    }
    const restaurados = [];
    for (const [nome, valor] of Object.entries(salvo.valores)) {
      const field = this.controller.resolveField(nome);
      if (!this.guardavel(field) || field.disabled) continue;
      try {
        this.controller.setValue(field, valor, { silent: true });
        restaurados.push(field.name);
      } catch {
      }
    }
    if (restaurados.length) {
      this.form.dispatchEvent(new CustomEvent(RASCUNHO_EVENTOS.restaurado, { bubbles: true, detail: { salvoEm: salvo.salvoEm, campos: restaurados } }));
    }
  }
  apagar() {
    clearTimeout(this.timer);
    const storage = this.storage;
    if (!storage) return;
    try {
      if (storage.getItem(this.chave) === null) return;
      storage.removeItem(this.chave);
    } catch {
      return;
    }
    this.form.dispatchEvent(new CustomEvent(RASCUNHO_EVENTOS.apagado, { bubbles: true, detail: {} }));
  }
  destroy() {
    clearTimeout(this.timer);
    for (const remove of this.removers) remove();
    this.removers = [];
  }
};
function rascunhoPlugin(AlpineForm) {
  const { ConfigError } = AlpineForm.errors;
  const extensoes = /* @__PURE__ */ new WeakMap();
  AlpineForm.fieldAttributes(["data-form-rascunho-ignorar"]);
  AlpineForm.formHook((controller) => {
    const ext = new RascunhoExtension(controller, ConfigError);
    if (!ext.ativo) return null;
    extensoes.set(controller.form, ext);
    return ext;
  });
  AlpineForm.rascunho = {
    salvar(formOuId) {
      extensoes.get(resolverForm(formOuId))?.salvar();
    },
    descartar(formOuId) {
      extensoes.get(resolverForm(formOuId))?.apagar();
    },
    ler(formOuId) {
      return extensoes.get(resolverForm(formOuId))?.ler() ?? null;
    }
  };
}
function resolverForm(formOuId) {
  return typeof formOuId === "string" ? document.getElementById(formOuId) : formOuId;
}
export {
  RASCUNHO_EVENTOS,
  RASCUNHO_PREFIXO,
  rascunhoPlugin as default
};
