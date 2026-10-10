/*! AlpineForm v1.0.0 | MIT */

// src/core/errors.js
var AlpineFormError = class extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AlpineFormError";
    this.details = details;
  }
};
var ConfigError = class extends AlpineFormError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "ConfigError";
    this.kind = "config";
  }
};
var OperationalError = class extends AlpineFormError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "OperationalError";
    this.kind = details.kind || "operational";
  }
};
var StateError = class extends AlpineFormError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "StateError";
    this.kind = "state";
  }
};
var SerializationError = class extends AlpineFormError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "SerializationError";
    this.kind = "serialization";
  }
};
var AbortError = class extends AlpineFormError {
  constructor(message = "Opera\xE7\xE3o cancelada.", details = {}) {
    super(message, details);
    this.name = "AbortError";
    this.kind = "abort";
  }
};
function isConfigError(error) {
  return !!error && (error.kind === "config" || error.name === "ConfigError");
}
function isSerializationError(error) {
  return !!error && (error.kind === "serialization" || error.name === "SerializationError");
}
function isAbort(error) {
  return !!error && (error.name === "AbortError" || error.kind === "abort");
}

// src/core/registry.js
var stores = {
  validator: /* @__PURE__ */ new Map(),
  normalizer: /* @__PURE__ */ new Map(),
  mask: /* @__PURE__ */ new Map(),
  transport: /* @__PURE__ */ new Map(),
  responseAdapter: /* @__PURE__ */ new Map(),
  remoteAdapter: /* @__PURE__ */ new Map(),
  uiAdapter: /* @__PURE__ */ new Map(),
  fileInspector: /* @__PURE__ */ new Map(),
  component: /* @__PURE__ */ new Map()
};
var fieldAttributes = /* @__PURE__ */ new Set();
var fieldAttributePrefixes = /* @__PURE__ */ new Set();
var formHooks = [];
var plugins = /* @__PURE__ */ new Set();
var NAME_RE = /^[a-z][a-z0-9_-]*$/i;
function register(kind, name, definition, { replace = false } = {}) {
  if (!NAME_RE.test(name)) throw new ConfigError(`Nome inv\xE1lido para ${kind}: "${name}". Use letras, n\xFAmeros, "_" ou "-".`);
  const store = stores[kind];
  if (store.has(name) && !replace) {
    throw new ConfigError(`${kind} "${name}" j\xE1 registrado. Use { replace: true } para substituir conscientemente.`);
  }
  store.set(name, definition);
  return definition;
}
function registerValidator(name, definition, options) {
  if (typeof definition === "function") definition = { validate: definition };
  if (!definition || typeof definition.validate !== "function") {
    throw new ConfigError(`Validador "${name}" precisa de uma fun\xE7\xE3o validate(value, ctx).`);
  }
  return register("validator", name, { name, params: [], presence: false, async: false, ...definition }, options);
}
function registerNormalizer(name, fn, options) {
  if (typeof fn !== "function") throw new ConfigError(`Normalizador "${name}" precisa ser uma fun\xE7\xE3o.`);
  return register("normalizer", name, fn, options);
}
function registerMask(name, factory, options) {
  if (typeof factory !== "function") throw new ConfigError(`M\xE1scara "${name}" precisa ser uma f\xE1brica (config) => mask.`);
  return register("mask", name, factory, options);
}
function registerTransport(name, fn, options) {
  if (typeof fn !== "function") throw new ConfigError(`Transporte "${name}" precisa ser uma fun\xE7\xE3o.`);
  return register("transport", name, fn, options);
}
function registerResponseAdapter(name, fn, options) {
  if (typeof fn !== "function") throw new ConfigError(`Adaptador de resposta "${name}" precisa ser uma fun\xE7\xE3o.`);
  return register("responseAdapter", name, fn, options);
}
function registerRemoteAdapter(name, fn, options) {
  if (typeof fn !== "function") throw new ConfigError(`Adaptador remoto "${name}" precisa ser uma fun\xE7\xE3o.`);
  return register("remoteAdapter", name, fn, options);
}
function registerUiAdapter(name, factory, options) {
  if (typeof factory !== "function") throw new ConfigError(`Adaptador de UI "${name}" precisa ser uma f\xE1brica (ctx) => adapter.`);
  return register("uiAdapter", name, factory, options);
}
function registerFileInspector(name, definition, options) {
  if (typeof definition === "function") definition = { inspect: definition };
  if (!definition || typeof definition.inspect !== "function") throw new ConfigError(`Inspetor "${name}" precisa de inspect(file, ctx).`);
  return register("fileInspector", name, definition, options);
}
function registerComponent(name, definition, options) {
  const required = ["getValue", "setValue", "subscribe"];
  for (const method of required) {
    if (!definition || typeof definition[method] !== "function") {
      throw new ConfigError(`Adaptador de componente "${name}" precisa implementar ${required.join(", ")}.`);
    }
  }
  return register("component", name, definition, options);
}
function get(kind, name) {
  return stores[kind].get(name);
}
function has(kind, name) {
  return stores[kind].has(name);
}
function names(kind) {
  return Array.from(stores[kind].keys());
}
function unregister(kind, name) {
  return stores[kind].delete(name);
}
function registerFieldAttributes(list = [], prefixes = []) {
  for (const attr of list) fieldAttributes.add(attr);
  for (const prefix of prefixes) fieldAttributePrefixes.add(prefix);
}
function isKnownFieldAttribute(name) {
  if (fieldAttributes.has(name)) return true;
  for (const prefix of fieldAttributePrefixes) if (name.startsWith(prefix)) return true;
  return false;
}
function registerFormHook(hook) {
  formHooks.push(hook);
  return () => {
    const index = formHooks.indexOf(hook);
    if (index >= 0) formHooks.splice(index, 1);
  };
}
function getFormHooks() {
  return formHooks.slice();
}
var alpineSetups = [];
function registerAlpineSetup(setup) {
  if (typeof setup !== "function") throw new ConfigError("AlpineForm.alpine() espera uma fun\xE7\xE3o (Alpine) => void.");
  if (!alpineSetups.includes(setup)) alpineSetups.push(setup);
}
function getAlpineSetups() {
  return alpineSetups.slice();
}
function usePlugin(plugin, api) {
  if (typeof plugin !== "function") throw new ConfigError("AlpineForm.use() espera uma fun\xE7\xE3o (AlpineForm) => void.");
  if (plugins.has(plugin)) return;
  plugins.add(plugin);
  plugin(api);
}

// src/lib/size.js
var UNITS = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4
};
var SIZE_RE = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i;
function parseSize(input) {
  const text2 = String(input ?? "").trim();
  const match = SIZE_RE.exec(text2);
  if (!match) throw new ConfigError(`Tamanho inv\xE1lido: "${text2}". Use, por exemplo, 500KB, 10MB ou 2MiB.`);
  const unit = (match[2] || "b").toLowerCase();
  const factor = UNITS[unit];
  if (!factor) {
    throw new ConfigError(`Unidade de tamanho "${match[2]}" n\xE3o reconhecida em "${text2}". Use B, KB, MB, GB, KiB, MiB ou GiB.`);
  }
  const bytes = Math.floor(Number(match[1]) * factor);
  if (!Number.isSafeInteger(bytes)) throw new ConfigError(`Tamanho fora do limite suportado: "${text2}".`);
  return bytes;
}
function isBinaryUnit(input) {
  return /i\s*b$/i.test(String(input ?? "").trim());
}
var DECIMAL_STEPS = [["TB", 1e12], ["GB", 1e9], ["MB", 1e6], ["KB", 1e3]];
var BINARY_STEPS = [["TiB", 1024 ** 4], ["GiB", 1024 ** 3], ["MiB", 1024 ** 2], ["KiB", 1024]];
function formatBytes(bytes, { binary = false, locale = "pt-BR", maxFractionDigits = 1 } = {}) {
  if (!Number.isFinite(bytes)) return "";
  const steps = binary ? BINARY_STEPS : DECIMAL_STEPS;
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits });
  for (const [unit, size] of steps) {
    if (Math.abs(bytes) >= size) return `${fmt.format(bytes / size)} ${unit}`;
  }
  return `${fmt.format(bytes)} B`;
}

// src/lib/utils.js
var uidCounter = 0;
function uid(prefix = "af") {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}
function randomId(bytes = 16) {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint8Array(bytes);
    c.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("crypto.getRandomValues indispon\xEDvel: n\xE3o \xE9 poss\xEDvel gerar identificadores imprevis\xEDveis.");
}
function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto2 = Object.getPrototypeOf(value);
  return proto2 === Object.prototype || proto2 === null;
}
function debounce(fn, wait) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  debounced.flush = (...args) => {
    debounced.cancel();
    fn(...args);
  };
  debounced.pending = () => timer !== null;
  return debounced;
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function cssEscape(value) {
  if (globalThis.CSS && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch.codePointAt(0).toString(16)} `);
}
function isEmptyValue(value) {
  if (value === null || value === void 0) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
function textLength(value) {
  let count = 0;
  for (const _ of String(value)) count += 1;
  return count;
}
function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => valuesEqual(item, b[index]));
}
function valuesEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return arraysEqual(a, b);
  if (a && b && typeof a === "object" && typeof b === "object" && "id" in a && "id" in b) return a.id === b.id;
  return a === b;
}
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return el.getClientRects().length > 0;
}
function truncate(text2, max = 60) {
  const chars = Array.from(String(text2));
  return chars.length > max ? chars.slice(0, max - 1).join("") + "\u2026" : chars.join("");
}

// src/core/config.js
var OPTION_SPECS = {
  validation: { attr: "data-form-validation", type: "enum", values: ["live", "input", "blur", "change", "submit"], default: "live", inherit: true },
  debounce: { attr: "data-form-debounce", type: "duration", default: 200, max: 6e4, inherit: true },
  errors: { attr: "data-form-errors", type: "enum", values: ["first", "all"], default: "first", inherit: true },
  showValid: { attr: "data-form-show-valid", type: "bool", default: false, inherit: true },
  hidden: { attr: "data-form-hidden", type: "enum", values: ["validate", "skip"], default: "validate", inherit: true },
  serverErrors: { attr: "data-form-server-errors", type: "enum", values: ["clear-on-change", "keep"], default: "clear-on-change", inherit: true },
  dateFormat: { attr: "data-form-date-format", type: "enum", values: ["iso", "br"], default: "iso", inherit: true },
  ui: { attr: "data-form-ui", type: "string", default: "default" },
  summary: { attr: "data-form-summary", type: "enum", values: ["general", "all", "none"], default: "general" },
  focus: { attr: "data-form-focus", type: "enum", values: ["first", "none"], default: "first" },
  scroll: { attr: "data-form-scroll", type: "enum", values: ["smooth", "instant", "none"], default: "smooth" },
  transport: { attr: "data-form-transport", type: "string", default: "xhr" },
  encoding: { attr: "data-form-encoding", type: "enum", values: ["multipart", "urlencoded", "json"], default: "multipart" },
  jsonFiles: { attr: "data-form-json-files", type: "enum", values: ["error", "metadata"], default: "error" },
  nesting: { attr: "data-form-nesting", type: "enum", values: ["brackets", "dots", "flat"], default: "brackets" },
  timeout: { attr: "data-form-timeout", type: "duration", default: 0, max: 24 * 3600 * 1e3 },
  credentials: { attr: "data-form-credentials", type: "enum", values: ["same-origin", "include", "omit"], default: "same-origin" },
  endpoint: { attr: "data-form-endpoint", type: "string", default: null },
  method: { attr: "data-form-method", type: "enum", values: ["get", "post", "put", "patch", "delete"], default: null },
  responseAdapter: { attr: "data-form-response-adapter", type: "string", default: "default" },
  resetOnSuccess: { attr: "data-form-reset-on-success", type: "bool", default: false },
  redirect: { attr: "data-form-redirect", type: "enum", values: ["none", "response"], default: "none" },
  redirectOrigins: { attr: "data-form-redirect-origins", type: "list", default: [] },
  idempotency: { attr: "data-form-idempotency", type: "bool", default: false },
  jobUrl: { attr: "data-form-job-url", type: "string", default: null },
  jobCancelUrl: { attr: "data-form-job-cancel-url", type: "string", default: null },
  jobInterval: { attr: "data-form-job-interval", type: "duration", default: 1500, min: 250, max: 6e5 },
  jobMaxInterval: { attr: "data-form-job-max-interval", type: "duration", default: 1e4, min: 250, max: 36e5 },
  jobTimeout: { attr: "data-form-job-timeout", type: "duration", default: 6e5, max: 24 * 3600 * 1e3 },
  jobPersist: { attr: "data-form-job-persist", type: "bool", default: false },
  debug: { attr: "data-form-debug", type: "bool", default: false },
  // "none": a biblioteca não escreve nada no console (ambientes regulados); prevalece sobre debug
  log: { attr: "data-form-log", type: "enum", values: ["errors", "none"], default: "errors" },
  // "none": nada é gravado em localStorage/sessionStorage (desativa chunk-persist e job-persist)
  storage: { attr: "data-form-storage", type: "enum", values: ["allow", "none"], default: "allow" }
};
var NON_ATTRIBUTE_DEFAULTS = {
  headers: {},
  csrf: { meta: "csrf-token", header: "X-CSRF-TOKEN" },
  messages: {},
  locale: "pt-BR",
  remote: { debounce: 400, timeout: 8e3, cache: 20, cacheTtl: 6e4, method: "post", inconclusive: "allow", retries: 1 },
  files: { duplicates: "ignore", preview: true, append: false, previewMaxBytes: 20 * 1024 * 1024 },
  patternMaxLength: 500,
  patternMaxInput: 2e3,
  hooks: {},
  clock: null
};
var globalConfig = { options: {}, extra: {} };
function configure(options = {}) {
  if (!isPlainObject(options)) throw new ConfigError("AlpineForm.configure() espera um objeto simples.");
  for (const [key, value] of Object.entries(options)) {
    if (key in OPTION_SPECS) globalConfig.options[key] = validateOption(key, value, "AlpineForm.configure");
    else if (key in NON_ATTRIBUTE_DEFAULTS) globalConfig.extra[key] = mergeExtra(key, globalConfig.extra[key], value);
    else throw new ConfigError(`Op\xE7\xE3o global desconhecida: "${key}".`);
  }
}
function globalOption(key) {
  return key in globalConfig.options ? globalConfig.options[key] : OPTION_SPECS[key]?.default;
}
function resetGlobalConfig() {
  globalConfig.options = {};
  globalConfig.extra = {};
}
function mergeExtra(key, current, value) {
  const base = current ?? NON_ATTRIBUTE_DEFAULTS[key];
  if (isPlainObject(base) && isPlainObject(value)) return { ...base, ...value };
  return value;
}
function parseBool(raw, attr) {
  if (raw === "" || raw === "true" || raw === attr) return true;
  if (raw === "false") return false;
  throw new ConfigError(`Valor booleano inv\xE1lido em ${attr}="${raw}". Use o atributo sem valor, "true" ou "false".`, { attr });
}
function parseInteger(raw, attr, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text2 = String(raw).trim();
  if (!/^-?\d+$/.test(text2)) throw new ConfigError(`N\xFAmero inteiro inv\xE1lido em ${attr}="${raw}".`, { attr });
  const value = Number(text2);
  if (value < min || value > max) throw new ConfigError(`${attr}="${raw}" fora do intervalo permitido (${min} a ${max}).`, { attr });
  return value;
}
function parseDuration(raw, attr, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text2 = String(raw).trim();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|min)?$/.exec(text2);
  if (!match) throw new ConfigError(`Dura\xE7\xE3o inv\xE1lida em ${attr}="${raw}". Use 250, 250ms, 2s ou 1min.`, { attr });
  const factor = match[2] === "s" ? 1e3 : match[2] === "min" ? 6e4 : 1;
  const value = Math.round(Number(match[1]) * factor);
  if (value < min || value > max) throw new ConfigError(`${attr}="${raw}" fora do intervalo permitido (${min}ms a ${max}ms).`, { attr });
  return value;
}
function parseList(raw) {
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}
function parseOptionValue(spec, raw, attr) {
  switch (spec.type) {
    case "bool":
      return parseBool(raw, attr);
    case "int":
      return parseInteger(raw, attr, spec);
    case "duration":
      return parseDuration(raw, attr, spec);
    case "size":
      return parseSize(raw);
    case "list":
      return parseList(raw);
    case "enum": {
      const value = String(raw).trim().toLowerCase();
      if (!spec.values.includes(value)) {
        throw new ConfigError(`Valor "${raw}" inv\xE1lido em ${attr}. Valores aceitos: ${spec.values.join(", ")}.`, { attr });
      }
      return value;
    }
    default: {
      const value = String(raw).trim();
      if (!value) throw new ConfigError(`${attr} n\xE3o pode ser vazio.`, { attr });
      return value;
    }
  }
}
function validateOption(key, value, source) {
  const spec = OPTION_SPECS[key];
  if (value === null && spec.default === null) return null;
  if (typeof value === "string" || spec.type !== "list" && typeof value !== "boolean" && typeof value !== "number") {
    return parseOptionValue(spec, value, `${source}.${key}`);
  }
  if (spec.type === "bool" && typeof value !== "boolean") throw new ConfigError(`${source}.${key} deve ser booleano.`);
  if ((spec.type === "int" || spec.type === "duration") && !Number.isFinite(value)) throw new ConfigError(`${source}.${key} deve ser num\xE9rico.`);
  if (spec.type === "list") {
    if (!Array.isArray(value)) throw new ConfigError(`${source}.${key} deve ser uma lista.`);
    return [...value];
  }
  return value;
}
function readFormConfig(form, jsOptions = {}) {
  if (jsOptions != null && !isPlainObject(jsOptions)) throw new ConfigError("A express\xE3o de x-form deve resultar em um objeto simples.");
  const config = {};
  for (const [key, spec] of Object.entries(OPTION_SPECS)) {
    let value = spec.default;
    if (key in globalConfig.options) value = globalConfig.options[key];
    if (jsOptions && key in jsOptions) value = validateOption(key, jsOptions[key], "x-form");
    if (form.hasAttribute(spec.attr)) value = parseOptionValue(spec, form.getAttribute(spec.attr), spec.attr);
    config[key] = value;
  }
  for (const key of Object.keys(NON_ATTRIBUTE_DEFAULTS)) {
    let value = globalConfig.extra[key] ?? NON_ATTRIBUTE_DEFAULTS[key];
    if (jsOptions && key in jsOptions) value = mergeExtra(key, value, jsOptions[key]);
    config[key] = value;
  }
  if (jsOptions) {
    for (const key of Object.keys(jsOptions)) {
      if (!(key in OPTION_SPECS) && !(key in NON_ATTRIBUTE_DEFAULTS)) throw new ConfigError(`Op\xE7\xE3o desconhecida em x-form: "${key}".`);
    }
  }
  config.headers = { ...config.headers, ...readDotAttributes(form, "data-form-header.") };
  return config;
}
function readDotAttributes(el, prefix) {
  const out = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith(prefix)) {
      const key = attr.name.slice(prefix.length);
      if (!key) throw new ConfigError(`Atributo "${attr.name}" sem sufixo.`, { attr: attr.name });
      out[key] = attr.value;
    }
  }
  return out;
}
function resolveFieldOption(controls, form, formConfig, key) {
  const spec = OPTION_SPECS[key];
  for (const control of controls) {
    if (control.hasAttribute(spec.attr)) return parseOptionValue(spec, control.getAttribute(spec.attr), spec.attr);
  }
  const first = controls[0];
  if (first && form.contains(first)) {
    let node = first.parentElement;
    while (node && node !== form) {
      if (node.hasAttribute(spec.attr)) return parseOptionValue(spec, node.getAttribute(spec.attr), spec.attr);
      node = node.parentElement;
    }
  }
  return formConfig[key];
}

// src/lib/paths.js
var FORBIDDEN_SEGMENTS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var BRACKET_NAME = /^([^[\]]+)((?:\[[^[\]]*\])*)$/;
function splitName(name, mode = "brackets") {
  if (mode === "flat") return [name];
  const match = BRACKET_NAME.exec(name);
  let segments;
  if (!match) {
    segments = [name];
  } else {
    segments = [match[1]];
    const brackets = match[2].match(/\[[^[\]]*\]/g) || [];
    for (const part of brackets) segments.push(part.slice(1, -1));
  }
  if (mode === "dots") {
    segments = segments.flatMap((segment, index) => segment === "" && index > 0 ? [""] : segment.split("."));
  }
  return segments;
}
function nameToKey(name) {
  const segments = splitName(name, "brackets");
  if (segments.length > 1 && segments[segments.length - 1] === "") segments.pop();
  return segments.join(".");
}
function normalizeErrorKey(key) {
  if (!/[[\]]/.test(key)) return key;
  return nameToKey(key);
}
function assertSafeSegments(segments, name) {
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new SerializationError(`O campo "${name}" usa o segmento proibido "${segment}" e n\xE3o pode ser convertido em objeto.`, { name, segment });
    }
  }
}
function isIndex(segment) {
  return /^(0|[1-9]\d{0,8})$/.test(segment);
}
function setPath(target, segments, value, name) {
  assertSafeSegments(segments, name);
  let node = target;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const last = i === segments.length - 1;
    const nextSegment = segments[i + 1];
    const wantsArray = !last && (nextSegment === "" || isIndex(nextSegment));
    if (Array.isArray(node)) {
      if (segment !== "" && !isIndex(segment)) {
        throw new SerializationError(`Conflito de estrutura em "${name}": "${segment}" n\xE3o \xE9 \xEDndice de lista.`, { name });
      }
      const index = segment === "" ? node.length : Number(segment);
      if (last) {
        node[index] = value;
        return;
      }
      if (node[index] == null) node[index] = wantsArray ? [] : /* @__PURE__ */ Object.create(null);
      node = node[index];
    } else {
      if (segment === "") throw new SerializationError(`Nome inv\xE1lido "${name}": "[]" s\xF3 \xE9 permitido ap\xF3s um nome.`, { name });
      if (last) {
        if (Object.prototype.hasOwnProperty.call(node, segment)) {
          const existing = node[segment];
          node[segment] = Array.isArray(existing) ? [...existing, value] : [existing, value];
        } else {
          node[segment] = value;
        }
        return;
      }
      if (node[segment] == null) node[segment] = wantsArray ? [] : /* @__PURE__ */ Object.create(null);
      else if (typeof node[segment] !== "object") {
        throw new SerializationError(`Conflito de estrutura em "${name}": "${segment}" j\xE1 possui um valor simples.`, { name });
      }
      node = node[segment];
    }
  }
}
function toPlain(value) {
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) out.push(i in value ? toPlain(value[i]) : null);
    return out;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === null) {
    const out = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(out, key, { value: toPlain(value[key]), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
}

// src/transport/response.js
var UNSAFE_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
function parseBody(raw) {
  const text2 = raw.text ?? "";
  const contentType = (raw.headers?.get("content-type") || "").toLowerCase();
  if (raw.status === 204 || text2.trim() === "") return { type: "empty", json: null, text: "", contentType };
  const looksJson = contentType.includes("json") || /^\s*[{[]/.test(text2);
  if (looksJson) {
    try {
      return { type: "json", json: JSON.parse(text2), text: text2, contentType };
    } catch (error) {
      return { type: "invalid-json", json: null, text: text2, contentType, error: error.message };
    }
  }
  if (contentType.includes("html") || /^\s*</.test(text2)) return { type: "html", json: null, text: text2, contentType };
  return { type: "text", json: null, text: text2, contentType };
}
function normalizeErrors(source) {
  const errors = {};
  const general = [];
  if (Array.isArray(source)) {
    for (const item of source) if (typeof item === "string" && item) general.push(item);
    return { errors, general };
  }
  if (!isPlainObject(source)) return { errors, general };
  for (const [rawKey, value] of Object.entries(source)) {
    const messages = (Array.isArray(value) ? value : [value]).filter((m) => typeof m === "string" && m.length > 0);
    if (!messages.length) continue;
    if (rawKey === "" || rawKey === "_" || rawKey === "_general" || rawKey === "*") {
      general.push(...messages);
      continue;
    }
    const key = normalizeErrorKey(rawKey);
    if (key.split(".").some((segment) => UNSAFE_KEYS.has(segment))) {
      general.push(...messages);
      continue;
    }
    errors[key] = [...errors[key] || [], ...messages];
  }
  return { errors, general };
}
function retryAfterSeconds(raw) {
  const header = raw.headers?.get("retry-after");
  if (!header) return null;
  if (/^\d+$/.test(header.trim())) return Number(header.trim());
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - Date.now()) / 1e3)) : null;
}
function statusKind(status) {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 419) return "csrf";
  if (status === 413) return "too_large";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  if (status >= 400) return "http";
  return null;
}
function jobFrom(json, status) {
  if (!json || typeof json !== "object") return null;
  const job = isPlainObject(json.job) ? json.job : json;
  const id = job.id ?? job.job_id ?? job.jobId ?? json.job_id ?? json.jobId;
  if (id == null || status !== 202 && !json.job) return null;
  return {
    id: String(id),
    statusUrl: job.status_url ?? job.statusUrl ?? null,
    cancelUrl: job.cancel_url ?? job.cancelUrl ?? null
  };
}
function defaultResponseAdapter(raw) {
  const body = parseBody(raw);
  const status = raw.status;
  const httpOk = status >= 200 && status < 300;
  const requestId = raw.headers?.get("x-request-id") || null;
  const base = {
    ok: false,
    status,
    kind: null,
    message: null,
    errors: {},
    generalErrors: [],
    data: null,
    redirect: null,
    requestId,
    job: null,
    retryAfter: retryAfterSeconds(raw),
    diagnostic: { contentType: body.contentType, redirected: !!raw.redirected, url: raw.url, bodyType: body.type }
  };
  if (body.type === "html") {
    const looksLikeLogin = /<input[^>]+type\s*=\s*["']?password/i.test(body.text) || /login|entrar|acesso/i.test(raw.url || "");
    return {
      ...base,
      kind: "html",
      diagnostic: { ...base.diagnostic, looksLikeLogin, snippet: truncate(body.text.replace(/\s+/g, " "), 160) }
    };
  }
  if (body.type === "invalid-json" || body.type === "text") {
    return {
      ...base,
      kind: statusKind(status) || "parse",
      diagnostic: { ...base.diagnostic, parseError: body.error || "Resposta n\xE3o \xE9 JSON.", snippet: truncate(body.text, 160) }
    };
  }
  if (body.type === "empty") {
    return { ...base, ok: httpOk, kind: httpOk ? "success" : statusKind(status) };
  }
  const json = body.json;
  const isObject = isPlainObject(json);
  const { errors, general } = normalizeErrors(isObject ? json.errors : null);
  const message = isObject ? typeof json.message === "string" ? json.message : typeof json.mensagem === "string" ? json.mensagem : null : null;
  const logical = isObject && typeof json.success === "boolean" ? json.success : httpOk;
  const job = httpOk ? jobFrom(json, status) : null;
  let kind;
  if (!httpOk) kind = statusKind(status);
  else if (job) kind = "accepted";
  else if (!logical) kind = Object.keys(errors).length ? "validation" : "logical";
  else kind = "success";
  return {
    ...base,
    ok: httpOk && logical,
    kind,
    message,
    errors,
    generalErrors: general,
    data: isObject && "data" in json ? json.data : json,
    redirect: isObject ? json.redirect ?? json.redirect_url ?? null : null,
    requestId: isObject && (json.request_id ?? json.requestId) || requestId,
    job
  };
}
function laravelResponseAdapter(raw, ctx) {
  const result = defaultResponseAdapter(raw, ctx);
  if (result.kind === "validation" && Object.keys(result.errors).length) result.message = null;
  return result;
}
function joomlaResponseAdapter(raw, ctx) {
  const result = defaultResponseAdapter(raw, ctx);
  const body = parseBody(raw);
  const json = body.type === "json" && isPlainObject(body.json) ? body.json : null;
  if (!json) return result;
  if (isPlainObject(json.messages)) {
    for (const level of ["error", "warning"]) {
      const list = json.messages[level];
      if (Array.isArray(list)) result.generalErrors.push(...list.filter((m) => typeof m === "string"));
    }
  }
  if (isPlainObject(json.data) && json.data.errors) {
    const { errors, general } = normalizeErrors(json.data.errors);
    Object.assign(result.errors, errors);
    result.generalErrors.push(...general);
    if (!result.ok && Object.keys(errors).length) result.kind = result.kind === "logical" ? "validation" : result.kind;
  }
  return result;
}

// src/transport/retry.js
function backoffDelay(attempt, { baseDelay = 500, maxDelay = 15e3, random = Math.random } = {}) {
  const ceiling = Math.min(maxDelay, baseDelay * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504]);
function isRetryableError(error) {
  if (isAbort(error)) return false;
  return error?.kind === "network" || error?.kind === "timeout";
}
async function withRetry(operation, { retries = 3, baseDelay = 500, maxDelay = 15e3, signal, shouldRetry, onRetry, random } = {}) {
  let attempt = 0;
  for (; ; ) {
    try {
      const result = await operation(attempt);
      const decision = shouldRetry?.(null, result, attempt);
      if (decision && attempt < retries) {
        const wait = typeof decision === "number" ? decision : backoffDelay(attempt, { baseDelay, maxDelay, random });
        onRetry?.({ attempt, wait, result });
        await sleep(wait, signal);
        attempt += 1;
        continue;
      }
      return result;
    } catch (error) {
      const decision = shouldRetry ? shouldRetry(error, null, attempt) : isRetryableError(error);
      if (!decision || attempt >= retries) throw error;
      const wait = typeof decision === "number" ? decision : backoffDelay(attempt, { baseDelay, maxDelay, random });
      onRetry?.({ attempt, wait, error });
      await sleep(wait, signal);
      attempt += 1;
    }
  }
}

// src/lib/dom.js
var proto = () => HTMLFormElement.prototype;
function formId(form) {
  return Element.prototype.getAttribute.call(form, "id") || "";
}
function formElements(form) {
  return Array.from(Object.getOwnPropertyDescriptor(proto(), "elements").get.call(form));
}
function formReset(form) {
  proto().reset.call(form);
}
function formSubmit(form) {
  proto().submit.call(form);
}
function formRequestSubmit(form, submitter) {
  if (typeof proto().requestSubmit !== "function") {
    formSubmit(form);
    return;
  }
  if (submitter) proto().requestSubmit.call(form, submitter);
  else proto().requestSubmit.call(form);
}

// src/jobs/poller.js
var JOB_STATUSES = ["queued", "processing", "succeeded", "failed", "canceled"];
var TERMINAL = /* @__PURE__ */ new Set(["succeeded", "failed", "canceled"]);
var JobPoller = class {
  constructor({ job, url, transport, headers = {}, credentials = "same-origin", interval = 1500, maxInterval = 1e4, timeout = 6e5, maxNetworkFailures = 5, onUpdate = () => {
  }, now: now2 = () => Date.now() }) {
    this.job = job;
    this.url = url;
    this.transport = transport;
    this.headers = headers;
    this.credentials = credentials;
    this.interval = interval;
    this.maxInterval = maxInterval;
    this.timeout = timeout;
    this.maxNetworkFailures = maxNetworkFailures;
    this.onUpdate = onUpdate;
    this.now = now2;
    this.controller = new AbortController();
    this.inFlight = false;
  }
  stop() {
    this.controller.abort(new AbortError("Observa\xE7\xE3o do processamento encerrada."));
  }
  normalize(json) {
    const status = String(json?.status ?? "").toLowerCase();
    if (!JOB_STATUSES.includes(status)) {
      throw new OperationalError(`Status de processamento desconhecido: "${json?.status}".`, { kind: "job-contract" });
    }
    const progress = typeof json.progress === "number" && json.progress >= 0 && json.progress <= 100 ? json.progress : null;
    return {
      id: this.job.id,
      status,
      progress,
      message: typeof json.message === "string" ? json.message : typeof json.mensagem === "string" ? json.mensagem : null,
      result: json.result ?? null,
      error: json.error ?? null
    };
  }
  async poll() {
    const signal = this.controller.signal;
    this.inFlight = true;
    try {
      const raw = await this.transport({ url: this.url, method: "GET", headers: { Accept: "application/json", ...this.headers }, credentials: this.credentials, timeout: Math.min(3e4, this.timeout), signal });
      const retryAfter = Number(raw.headers?.get("retry-after"));
      if (raw.status === 404 || raw.status === 410) throw new OperationalError("Processamento n\xE3o encontrado ou expirado no servidor.", { kind: "job-missing", status: raw.status });
      if (raw.status === 429 || raw.status >= 500) return { transient: true, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null };
      if (raw.status < 200 || raw.status >= 300) throw new OperationalError(`Consulta de status falhou (HTTP ${raw.status}).`, { kind: "job-http", status: raw.status });
      const body = parseBody(raw);
      if (body.type !== "json") throw new OperationalError("Resposta de status n\xE3o \xE9 JSON.", { kind: "job-contract" });
      return { update: this.normalize(body.json), retryAfter: Number.isFinite(retryAfter) ? retryAfter : null };
    } finally {
      this.inFlight = false;
    }
  }
  async run() {
    const signal = this.controller.signal;
    const started = this.now();
    let delay = this.interval;
    let failures = 0;
    let last = null;
    for (; ; ) {
      if (this.now() - started > this.timeout) {
        throw new OperationalError("Tempo de observa\xE7\xE3o do processamento excedido.", { kind: "job-timeout", last });
      }
      await sleep(delay, signal);
      let outcome;
      try {
        outcome = await this.poll();
      } catch (error) {
        if (isAbort(error) || signal.aborted) throw new AbortError("Observa\xE7\xE3o do processamento encerrada.");
        if (error.kind === "network" || error.kind === "timeout") {
          failures += 1;
          if (failures > this.maxNetworkFailures) throw error;
          delay = backoffDelay(failures, { baseDelay: this.interval, maxDelay: this.maxInterval });
          continue;
        }
        throw error;
      }
      failures = 0;
      if (outcome.transient) {
        delay = outcome.retryAfter != null ? outcome.retryAfter * 1e3 : Math.min(this.maxInterval, delay * 2);
        continue;
      }
      const changed = !last || last.status !== outcome.update.status || last.progress !== outcome.update.progress;
      last = outcome.update;
      this.onUpdate(last);
      if (TERMINAL.has(last.status)) return last;
      delay = outcome.retryAfter != null ? outcome.retryAfter * 1e3 : changed ? this.interval : Math.min(this.maxInterval, Math.round(delay * 1.5));
    }
  }
};
function jobStorageKey(form) {
  const id = formId(form) || form.getAttribute("action") || "form";
  return `alpineform:job:${id}`;
}
function saveJob(form, job) {
  try {
    sessionStorage.setItem(jobStorageKey(form), JSON.stringify({ id: job.id, statusUrl: job.statusUrl || null, savedAt: Date.now() }));
  } catch {
  }
}
function loadJob(form) {
  try {
    const raw = sessionStorage.getItem(jobStorageKey(form));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data.id === "string" ? data : null;
  } catch {
    return null;
  }
}
function clearJob(form) {
  try {
    sessionStorage.removeItem(jobStorageKey(form));
  } catch {
  }
}

// src/lib/decimal.js
var CANONICAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;
function parseDecimal(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    value = numberToPlainString(value);
  }
  if (typeof value === "bigint") value = value.toString();
  if (typeof value !== "string") return null;
  const match = CANONICAL_RE.exec(value.trim());
  if (!match) return null;
  const negative = match[1] === "-";
  const intPart = match[2].replace(/^0+(?=\d)/, "");
  const fracPart = (match[3] || "").replace(/0+$/, "");
  const digits = BigInt(intPart + fracPart || "0");
  return { sign: negative && digits !== 0n ? -1n : 1n, digits, scale: fracPart.length };
}
function numberToPlainString(number) {
  const text2 = String(number);
  if (!/e/i.test(text2)) return text2;
  return number.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}
function align(a, b) {
  const scale = Math.max(a.scale, b.scale);
  const av = a.sign * a.digits * 10n ** BigInt(scale - a.scale);
  const bv = b.sign * b.digits * 10n ** BigInt(scale - b.scale);
  return [av, bv, scale];
}
function compareDecimal(a, b) {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  if (!pa || !pb) return null;
  const [av, bv] = align(pa, pb);
  return av < bv ? -1 : av > bv ? 1 : 0;
}
function isMultipleOf(value, step) {
  const pv = parseDecimal(value);
  const ps = parseDecimal(step);
  if (!pv || !ps || ps.digits === 0n) return null;
  const [av, bv] = align(pv, ps);
  return av % bv === 0n;
}
function decimalScale(value) {
  const match = CANONICAL_RE.exec(String(value).trim());
  return match ? (match[3] || "").length : null;
}
function toFixedScale(value, scale) {
  const match = CANONICAL_RE.exec(String(value).trim());
  if (!match) return null;
  const negative = match[1] === "-";
  let intPart = match[2].replace(/^0+(?=\d)/, "");
  let frac = match[3] || "";
  if (frac.length > scale) frac = frac.slice(0, scale);
  frac = frac.padEnd(scale, "0");
  const isZero = /^0*$/.test(intPart + frac);
  return `${negative && !isZero ? "-" : ""}${intPart}${scale > 0 ? "." + frac : ""}`;
}

// src/core/rule-parser.js
var MAX_RULES_LENGTH = 2e3;
var SPECIAL = /* @__PURE__ */ new Set(["|", ":", ",", "\\"]);
var RULE_NAME_RE = /^[a-z][a-z0-9_]*$/;
function tokenize(source) {
  const text2 = String(source ?? "");
  if (text2.length > MAX_RULES_LENGTH) throw new ConfigError(`data-form-v excede ${MAX_RULES_LENGTH} caracteres.`);
  const rules = [];
  let current = { name: null, params: [], buffer: "" };
  let escaped = false;
  const pushBuffer = () => {
    if (current.name === null) current.name = current.buffer;
    else current.params.push(current.buffer);
    current.buffer = "";
  };
  for (let i = 0; i < text2.length; i++) {
    const ch = text2[i];
    if (escaped) {
      if (!SPECIAL.has(ch)) throw new ConfigError(`Escape inv\xE1lido "\\${ch}" em data-form-v="${text2}". Escapes aceitos: \\| \\: \\, \\\\`);
      current.buffer += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "|") {
      pushBuffer();
      rules.push(current);
      current = { name: null, params: [], buffer: "" };
      continue;
    }
    if (ch === ":" && current.name === null) {
      current.name = current.buffer;
      current.buffer = "";
      current.hasParams = true;
      continue;
    }
    if (ch === "," && current.name !== null) {
      current.params.push(current.buffer);
      current.buffer = "";
      continue;
    }
    current.buffer += ch;
  }
  if (escaped) throw new ConfigError(`data-form-v="${text2}" termina com "\\" sem caractere escapado.`);
  pushBuffer();
  rules.push(current);
  if (rules.length === 1 && rules[0].name.trim() === "" && !rules[0].hasParams) return [];
  return rules.map((rule, index) => {
    const name = rule.name.trim();
    if (!name) throw new ConfigError(`Regra vazia na posi\xE7\xE3o ${index + 1} de data-form-v="${text2}".`);
    return { name, args: rule.params.map((p) => p.trim()), hasParams: !!rule.hasParams };
  });
}
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}
function suggestRule(name) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of names("validator")) {
    const distance = levenshtein(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 ? best : null;
}
var DATE_KEYWORDS = /* @__PURE__ */ new Set(["today", "now"]);
var DATE_LITERAL = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?)?$|^\d{2}:\d{2}(:\d{2})?$|^\d{4}-W\d{2}$/;
function convertParam(type, raw, ruleName, spec = {}) {
  const fail = (msg) => {
    throw new ConfigError(`Par\xE2metro inv\xE1lido "${raw}" na regra "${ruleName}": ${msg}`, { rule: ruleName });
  };
  if (raw === "" && type !== "string-or-empty") fail("par\xE2metro vazio.");
  switch (type) {
    case "number": {
      if (!parseDecimal(raw)) fail("esperado n\xFAmero com ponto decimal, ex.: 10 ou 0.01.");
      return raw;
    }
    case "integer": {
      if (!/^\d+$/.test(raw)) fail("esperado inteiro n\xE3o negativo.");
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) fail("inteiro grande demais.");
      if (spec.min != null && value < spec.min) fail(`m\xEDnimo ${spec.min}.`);
      return value;
    }
    case "size": {
      try {
        return { bytes: parseSize(raw), text: formatBytes(parseSize(raw), { binary: isBinaryUnit(raw) }) };
      } catch (error) {
        fail(error.message);
      }
      break;
    }
    case "field":
      if (!/^[^\s]+$/.test(raw)) fail("refer\xEAncia de campo n\xE3o pode conter espa\xE7os.");
      return { ref: raw };
    case "date-or-field":
      if (DATE_KEYWORDS.has(raw)) return { keyword: raw };
      if (DATE_LITERAL.test(raw)) return { literal: raw };
      if (/^[^\s]+$/.test(raw)) return { ref: raw };
      return fail('esperado data ISO, "today", "now" ou nome de campo.');
    case "enum":
      if (!spec.values.includes(raw)) fail(`valores aceitos: ${spec.values.join(", ")}.`);
      return raw;
    case "ratio": {
      const m = /^(\d+(?:\.\d+)?)(?:[/:](\d+(?:\.\d+)?))?$/.exec(raw);
      if (!m) fail("esperado propor\xE7\xE3o como 16/9, 4:3 ou 1.5.");
      const value = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
      if (!(value > 0)) fail("propor\xE7\xE3o deve ser positiva.");
      return { value, text: raw };
    }
    case "dimensions": {
      const m = /^(\d+)x(\d+)$/i.exec(raw);
      if (!m) fail("esperado LARGURAxALTURA, ex.: 800x600.");
      return { width: Number(m[1]), height: Number(m[2]), text: raw };
    }
    case "string":
    case "string-or-empty":
    default:
      return raw;
  }
}
function convertArgs(def, ruleName, args, hasParams) {
  const fixed = def.params || [];
  const rest = def.rest || null;
  const values = {};
  const positional = [];
  const refs = [];
  const required = fixed.filter((p) => !p.optional).length;
  if (hasParams && args.length === 0) throw new ConfigError(`A regra "${ruleName}" foi declarada com ":" mas sem par\xE2metros.`);
  if (args.length < required) {
    throw new ConfigError(`A regra "${ruleName}" exige ${required} par\xE2metro(s): ${fixed.map((p) => p.name).join(", ")}.`, { rule: ruleName });
  }
  if (!rest && args.length > fixed.length) {
    throw new ConfigError(`A regra "${ruleName}" aceita no m\xE1ximo ${fixed.length} par\xE2metro(s), recebeu ${args.length}.`, { rule: ruleName });
  }
  fixed.forEach((spec, index) => {
    if (index >= args.length) return;
    const converted = convertParam(spec.type, args[index], ruleName, spec);
    values[spec.name] = converted;
    positional.push(converted);
    if (converted && typeof converted === "object" && converted.ref) refs.push(converted.ref);
  });
  if (rest) {
    const extra = args.slice(fixed.length);
    if (extra.length < (rest.min ?? 0)) throw new ConfigError(`A regra "${ruleName}" exige ao menos ${rest.min} valor(es) em ${rest.name}.`, { rule: ruleName });
    const converted = extra.map((arg) => convertParam(rest.type || "string", arg, ruleName, rest));
    values[rest.name] = converted;
    positional.push(...converted);
    for (const c of converted) if (c && typeof c === "object" && c.ref) refs.push(c.ref);
  }
  return { values, positional, refs };
}
function parseRules(source) {
  const tokens = tokenize(source);
  const seen = /* @__PURE__ */ new Set();
  const rules = [];
  for (const token of tokens) {
    if (!RULE_NAME_RE.test(token.name)) {
      throw new ConfigError(`Nome de regra inv\xE1lido "${token.name}". Use min\xFAsculas, n\xFAmeros e "_".`, { rule: token.name });
    }
    if (seen.has(token.name)) throw new ConfigError(`Regra "${token.name}" repetida em data-form-v.`, { rule: token.name });
    seen.add(token.name);
    const def = get("validator", token.name);
    if (!def) {
      const suggestion = suggestRule(token.name);
      throw new ConfigError(
        `Regra desconhecida "${token.name}"${suggestion ? `. Voc\xEA quis dizer "${suggestion}"?` : "."}`,
        { rule: token.name, suggestion }
      );
    }
    const { values, positional, refs } = convertArgs(def, token.name, token.args, token.hasParams);
    rules.push({ name: token.name, def, args: token.args, params: values, positional, refs });
  }
  if (seen.has("required") && (seen.has("optional") || seen.has("nullable"))) {
    throw new ConfigError('Combina\xE7\xE3o contradit\xF3ria: "required" com "optional"/"nullable".');
  }
  return rules;
}
var MAX_PATTERN_FLAGS = /^[imsu]*$/;
function compilePattern(source, flags = "", maxLength = 500) {
  if (source == null) throw new ConfigError('A regra "pattern" exige o atributo data-form-pattern.');
  if (source.length === 0) throw new ConfigError("data-form-pattern est\xE1 vazio.");
  if (source.length > maxLength) throw new ConfigError(`data-form-pattern excede ${maxLength} caracteres.`);
  if (!MAX_PATTERN_FLAGS.test(flags) || new Set(flags).size !== flags.length) {
    throw new ConfigError(`data-form-pattern-flags="${flags}" inv\xE1lido. Flags aceitas: i, m, s, u (sem g/y).`);
  }
  try {
    return new RegExp(source, flags);
  } catch (error) {
    throw new ConfigError(`Express\xE3o regular inv\xE1lida em data-form-pattern: ${error.message}`);
  }
}

// src/core/normalizers.js
function decimalFromLocale(value, locale = "pt-BR") {
  const text2 = String(value ?? "").trim();
  if (text2 === "") return "";
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find((p) => p.type === "group")?.value ?? "";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  let body = text2.replace(/\s| | /g, "");
  if (group) body = body.split(group).join("");
  if (decimal !== ".") body = body.replace(decimal, ".");
  return /^[+-]?\d+(\.\d+)?$/.test(body) ? body : text2;
}
var BUILTIN = {
  trim: (value) => typeof value === "string" ? value.trim() : value,
  lowercase: (value) => typeof value === "string" ? value.toLowerCase() : value,
  uppercase: (value) => typeof value === "string" ? value.toUpperCase() : value,
  digits: (value) => typeof value === "string" ? value.replace(/\D+/g, "") : value,
  collapse_spaces: (value) => typeof value === "string" ? value.replace(/\s+/g, " ") : value,
  decimal: (value, { args }) => decimalFromLocale(value, args[0] || "pt-BR")
};
function registerBuiltinNormalizers() {
  for (const [name, fn] of Object.entries(BUILTIN)) if (!has("normalizer", name)) registerNormalizer(name, fn);
}
function parseNormalizers(source) {
  if (!source) return [];
  return source.split("|").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...rest] = part.split(":");
    const fn = get("normalizer", name.trim());
    if (!fn) throw new ConfigError(`Normalizador desconhecido "${name}" em data-form-normalize.`);
    const args = rest.length ? rest.join(":").split(",").map((s) => s.trim()) : [];
    return { name: name.trim(), fn, args };
  });
}
function applyNormalizers(value, normalizers, context) {
  let out = value;
  for (const n of normalizers) {
    out = Array.isArray(out) ? out.map((v) => n.fn(v, { ...context, args: n.args })) : n.fn(out, { ...context, args: n.args });
  }
  return out;
}

// src/core/field.js
var DATE_TYPES = { date: "date", "datetime-local": "datetime", time: "time", month: "month", week: "week" };
var NUMERIC_RULES = /* @__PURE__ */ new Set(["numeric", "integer", "decimal", "min_value", "max_value", "positive", "negative", "multiple_of"]);
var REPRESENTATIONS = ["raw", "formatted", "canonical"];
registerFieldAttributes([
  "data-form-v",
  "data-form-msg",
  "data-form-label",
  "data-form-error-target",
  "data-form-pattern",
  "data-form-pattern-flags",
  "data-form-normalize",
  "data-form-submit-value",
  "data-form-sensitive",
  "data-form-ignore",
  "data-form-name",
  "data-form-component",
  "data-form-unchecked-value",
  "data-form-date-kind",
  "data-form-remote",
  "data-form-remote-method",
  "data-form-remote-debounce",
  "data-form-remote-timeout",
  "data-form-remote-fields",
  "data-form-remote-param",
  "data-form-remote-cache",
  "data-form-remote-cache-ttl",
  "data-form-remote-inconclusive",
  "data-form-remote-adapter",
  "data-form-remote-allow-query",
  "data-form-files-append",
  "data-form-files-duplicates",
  "data-form-preview",
  "data-form-existing-remove-name",
  "data-form-mask",
  "data-form-mask-validation-value",
  "data-form-chunked",
  ...Object.values(OPTION_SPECS).filter((s) => s.inherit).map((s) => s.attr)
], ["data-form-msg."]);
function controlKind(control, groupSize, name) {
  if (control.hasAttribute("data-form-component")) return "component";
  const tag = control.tagName;
  if (tag === "SELECT") return control.multiple ? "select-multiple" : "select";
  if (tag === "TEXTAREA") return "text";
  const type = (control.getAttribute("type") || "text").toLowerCase();
  if (type === "checkbox") return groupSize > 1 || /\[\]$/.test(name) ? "checkbox-group" : "checkbox";
  if (type === "radio") return "radio";
  if (type === "file") return "file";
  if (type === "hidden") return "hidden";
  return "text";
}
var Field = class {
  constructor(controller, { key, name, controls, companions = [] }) {
    this.id = uid("f");
    this.controller = controller;
    this.form = controller.form;
    this.key = key;
    this.name = name;
    this.controls = controls;
    this.companions = companions;
    this.kind = controlKind(controls[0], controls.length, name);
    const first = controls[0];
    this.inputType = first.tagName === "TEXTAREA" ? "textarea" : first.tagName === "INPUT" ? (first.getAttribute("type") || "text").toLowerCase() : first.tagName.toLowerCase();
    this.runToken = 0;
    this.abort = null;
    this.debouncer = null;
    this.composing = false;
    this.mask = null;
    this.files = null;
    this.remote = null;
    this.component = null;
    this.configError = null;
    this.rules = [];
    this.state = null;
    this.uiState = {};
  }
  get primary() {
    return this.controls[0];
  }
  /** Lê e valida todos os atributos do campo. Erros ficam em this.configError, nunca aprovam o campo. */
  configure() {
    this.configError = null;
    try {
      this.readConfiguration();
    } catch (error) {
      if (!isConfigError(error)) throw error;
      this.configError = error;
      this.rules = [];
    }
  }
  readConfiguration() {
    const controls = this.controls;
    const formConfig = this.controller.config;
    this.checkUnknownAttributes();
    this.options = {};
    for (const [key, spec] of Object.entries(OPTION_SPECS)) {
      if (spec.inherit) this.options[key] = resolveFieldOption(controls, this.form, formConfig, key);
    }
    const rulesSource = this.groupAttribute("data-form-v");
    this.rules = rulesSource == null ? [] : parseRules(rulesSource);
    this.refs = new Set(this.rules.flatMap((rule) => rule.refs));
    this.messages = {};
    for (const control of controls) Object.assign(this.messages, readDotAttributes(control, "data-form-msg."));
    this.genericMessage = this.groupAttribute("data-form-msg");
    this.label = this.computeLabel();
    this.sensitive = this.inputType === "password" || this.groupAttribute("data-form-sensitive") !== null;
    this.patternRegex = null;
    if (this.rules.some((rule) => rule.name === "pattern")) {
      this.patternRegex = compilePattern(this.groupAttribute("data-form-pattern"), this.groupAttribute("data-form-pattern-flags") || "", formConfig.patternMaxLength);
    } else if (this.groupAttribute("data-form-pattern") !== null) {
      throw new ConfigError('data-form-pattern declarado sem a regra "pattern" em data-form-v.');
    }
    const normalize = this.groupAttribute("data-form-normalize");
    if (normalize && (this.sensitive || this.kind === "file")) {
      throw new ConfigError("Normalizadores n\xE3o s\xE3o aplicados a senhas, campos sens\xEDveis ou arquivos.");
    }
    this.normalizers = parseNormalizers(normalize);
    this.dateKind = DATE_TYPES[this.inputType] || null;
    const dateKindAttr = this.groupAttribute("data-form-date-kind");
    if (dateKindAttr) {
      if (!["date", "datetime", "time", "month", "week"].includes(dateKindAttr)) throw new ConfigError(`data-form-date-kind="${dateKindAttr}" inv\xE1lido.`);
      this.dateKind = dateKindAttr;
    }
    this.dateFormat = DATE_TYPES[this.inputType] ? "iso" : this.options.dateFormat;
    this.mask = null;
    const maskName = this.groupAttribute("data-form-mask");
    if (maskName !== null) {
      const provider = this.controller.services.maskProvider;
      if (!provider) throw new ConfigError("data-form-mask requer o m\xF3dulo de m\xE1scaras (alpine-form-masks).");
      if (this.kind !== "text" || !["text", "tel", "search", "textarea", ""].includes(this.inputType === "textarea" ? "textarea" : this.inputType)) {
        throw new ConfigError(`M\xE1scaras s\xF3 se aplicam a input type="text", "tel" ou "search" (recebido "${this.inputType}"). N\xE3o use type="number" com m\xE1scara.`);
      }
      this.mask = provider.attach(this, maskName);
      if (this.mask.dateKind && !dateKindAttr) this.dateKind = this.mask.dateKind;
    }
    this.numeric = this.inputType === "number" || this.inputType === "range" || !!this.mask?.numeric || this.rules.some((rule) => NUMERIC_RULES.has(rule.name));
    this.validateAs = this.readRepresentation("data-form-mask-validation-value", this.mask?.defaults?.validation);
    this.submitAs = this.readRepresentation("data-form-submit-value", this.mask?.defaults?.submit);
    const uncheckedValue = this.groupAttribute("data-form-unchecked-value");
    if (uncheckedValue !== null && this.kind !== "checkbox") throw new ConfigError("data-form-unchecked-value s\xF3 se aplica a checkbox individual.");
    this.uncheckedValue = uncheckedValue;
    if (this.kind === "component") {
      const name = this.primary.getAttribute("data-form-component");
      this.component = get("component", name);
      if (!this.component) throw new ConfigError(`Componente "${name}" n\xE3o registrado (AlpineForm.component).`);
    }
    if (this.kind === "hidden" && this.mask) throw new ConfigError("M\xE1scara em input hidden n\xE3o \xE9 suportada.");
    if (this.groupAttribute("data-form-chunked") !== null) {
      if (this.kind !== "file") throw new ConfigError('data-form-chunked s\xF3 se aplica a input type="file".');
      if (!this.controller.services.chunks) throw new ConfigError("data-form-chunked requer o m\xF3dulo de chunks (alpine-form-chunks).");
    }
  }
  checkUnknownAttributes() {
    for (const control of this.controls) {
      for (const attr of Array.from(control.attributes)) {
        if (attr.name.startsWith("data-form-") && !isKnownFieldAttribute(attr.name)) {
          throw new ConfigError(`Atributo desconhecido "${attr.name}" no campo "${this.name}". Verifique a grafia ou carregue o m\xF3dulo correspondente.`);
        }
      }
    }
  }
  readRepresentation(attr, fallback) {
    const raw = this.groupAttribute(attr);
    if (raw === null) return fallback || "canonical";
    const value = raw.trim().toLowerCase();
    if (!REPRESENTATIONS.includes(value)) throw new ConfigError(`${attr}="${raw}" inv\xE1lido. Use raw, formatted ou canonical.`);
    return value;
  }
  /** Lê um atributo entre os controles do grupo; valores divergentes geram ConfigError. */
  groupAttribute(attr) {
    let found = null;
    for (const control of this.controls) {
      if (!control.hasAttribute(attr)) continue;
      const value = control.getAttribute(attr);
      if (found !== null && found !== value) {
        throw new ConfigError(`Valores divergentes de ${attr} no grupo "${this.name}". Declare o atributo em apenas um controle ou use o mesmo valor.`);
      }
      found = value;
    }
    return found;
  }
  computeLabel() {
    const explicit = this.groupAttribute("data-form-label");
    if (explicit) return explicit;
    const control = this.primary;
    if (this.controls.length > 1 || this.kind === "radio" || this.kind === "checkbox-group") {
      const fieldset = control.closest("fieldset");
      const legend = fieldset?.querySelector(":scope > legend");
      if (legend && this.controls.every((c) => fieldset.contains(c))) return legend.textContent.trim();
    }
    const labels = control.labels ? Array.from(control.labels) : [];
    if (labels.length) {
      const text2 = labels.map((l) => l.textContent.trim()).filter(Boolean).join(" ");
      if (text2) return text2.replace(/\s*\*\s*$/, "");
    }
    const aria = control.getAttribute("aria-label");
    if (aria) return aria;
    return this.name;
  }
  get disabled() {
    if (this.kind === "component") return this.primary.hasAttribute("data-form-disabled") || this.primary.closest("fieldset:disabled") !== null;
    return this.controls.every((control) => control.disabled || control.matches(":disabled"));
  }
  /** Política de visibilidade: só dispensa validação se data-form-hidden="skip" e o campo não estiver visível. */
  get skipped() {
    if (this.options?.hidden !== "skip") return false;
    if (this.kind === "hidden") return false;
    return !this.controls.some((control) => isVisible(control));
  }
  get enabledControls() {
    return this.controls.filter((control) => !control.disabled && !control.matches(":disabled"));
  }
  /** Valor exibido/selecionado, sem transformação. */
  readDisplay() {
    const controls = this.enabledControls;
    switch (this.kind) {
      case "select-multiple":
        return controls.flatMap((c) => Array.from(c.selectedOptions).filter((o) => !o.disabled).map((o) => o.value));
      case "checkbox": {
        const c = controls[0];
        return c && c.checked ? c.value : null;
      }
      case "checkbox-group":
        return controls.filter((c) => c.checked).map((c) => c.value);
      case "radio":
        return controls.find((c) => c.checked)?.value ?? null;
      case "file":
        return this.files ? this.files.newItems() : [];
      case "component":
        return this.component.getValue(this.primary);
      default:
        return controls[0] ? controls[0].value : null;
    }
  }
  get checked() {
    return this.kind === "checkbox" ? !!this.enabledControls[0]?.checked : void 0;
  }
  /** Separa valor exibido, bruto, formatado e canônico. */
  representations(display = this.readDisplay()) {
    if (this.mask && typeof display === "string") {
      const reps = this.mask.represent(display);
      return { display, raw: reps.raw, formatted: reps.formatted, canonical: applyNormalizers(reps.canonical, this.normalizers, { field: this }) };
    }
    if (this.kind === "file") return { display, raw: display, formatted: display, canonical: display };
    const canonical = display == null ? display : applyNormalizers(display, this.normalizers, { field: this });
    return { display, raw: display, formatted: display, canonical };
  }
  validationValue() {
    return this.representations()[this.validateAs];
  }
  submitValue() {
    return this.representations()[this.submitAs];
  }
  getValue(as = "canonical") {
    if (as === "validation") return this.validationValue();
    if (as === "submit") return this.submitValue();
    const reps = this.representations();
    if (!(as in reps)) throw new ConfigError(`Representa\xE7\xE3o desconhecida "${as}". Use display, raw, formatted, canonical, validation ou submit.`);
    return reps[as];
  }
  /** Valor usado para dirty: bruto da máscara ou valor exibido; arquivos comparados por id. */
  comparableValue() {
    if (this.kind === "file") return { items: this.files ? this.files.newItems().map((i) => i.id) : [], removed: this.files ? this.files.removedExistingIds() : [] };
    const display = this.readDisplay();
    if (this.mask && typeof display === "string") return this.mask.represent(display).raw;
    return display;
  }
  isDirty() {
    const current = this.comparableValue();
    if (this.kind === "file") return current.items.length > 0 || current.removed.length > 0;
    return !valuesEqual(current, this.initialComparable);
  }
  snapshotInitial() {
    this.initialComparable = this.comparableValue();
    this.initialDisplay = this.readDisplay();
  }
  /** Define o valor pela API: aceita representação de entrada (display/raw/formatted/canonical). */
  setValue(value, as = "display") {
    const controls = this.controls;
    switch (this.kind) {
      case "select-multiple": {
        const values = new Set((Array.isArray(value) ? value : [value]).map(String));
        for (const c of controls) for (const option of c.options) option.selected = values.has(option.value);
        break;
      }
      case "checkbox": {
        const c = controls[0];
        c.checked = value === true || value != null && value !== false && String(value) === c.value;
        break;
      }
      case "checkbox-group": {
        const values = new Set((Array.isArray(value) ? value : [value]).filter((v) => v != null).map(String));
        for (const c of controls) c.checked = values.has(c.value);
        break;
      }
      case "radio":
        for (const c of controls) c.checked = value != null && c.value === String(value);
        break;
      case "file":
        throw new ConfigError("Use addFiles()/removeFile() para campos de arquivo; navegadores n\xE3o permitem definir arquivos por valor.");
      case "component":
        this.component.setValue(this.primary, value);
        break;
      default: {
        const text2 = value == null ? "" : String(value);
        if (this.mask) this.mask.setFrom(text2, as);
        else controls[0].value = text2;
      }
    }
  }
  infoForValidators() {
    return {
      key: this.key,
      name: this.name,
      kind: this.kind,
      inputType: this.inputType,
      label: this.label,
      numeric: this.numeric,
      dateKind: this.dateKind,
      dateFormat: this.dateFormat,
      existingCount: this.files ? this.files.keptExistingCount() : 0,
      checked: this.checked,
      sensitive: this.sensitive
    };
  }
  hasRules() {
    return this.rules.length > 0 || !!this.remote || this.configError !== null;
  }
  /** Opção de validação efetiva respeitando sobrescrita por campo. */
  option(key) {
    if (this.options && key in this.options) return this.options[key];
    return this.controller.config[key];
  }
  readOption(attr, spec) {
    const raw = this.groupAttribute(attr);
    return raw === null ? null : parseOptionValue(spec, raw, attr);
  }
};

// src/validators/files.js
var RASTER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"];
function items(value) {
  return toArray(value).filter((item) => item && item.file);
}
function perFile(test, varsFor) {
  return (value, ctx) => {
    const failed = [];
    for (const item of items(value)) {
      if (!test(item, ctx)) failed.push({ id: item.id, vars: { file: item.name, ...varsFor(ctx, item) } });
    }
    return failed.length ? { valid: false, items: failed } : true;
  };
}
function asyncPerFile(test, varsFor) {
  return async (value, ctx) => {
    const failed = [];
    for (const item of items(value)) {
      ctx.signal?.throwIfAborted?.();
      const result = await test(item, ctx);
      if (result !== true) {
        failed.push({ id: item.id, variant: result?.variant ?? null, vars: { file: item.name, ...varsFor(ctx, item) } });
      }
    }
    return failed.length ? { valid: false, items: failed } : true;
  };
}
function extensionMatches(name, allowed) {
  const lower = name.toLowerCase();
  return allowed.some((ext) => lower.endsWith("." + ext.toLowerCase().replace(/^\./, "")));
}
function mimeMatches(type, allowed) {
  if (!type) return false;
  const lower = type.toLowerCase();
  return allowed.some((pattern) => {
    const p = pattern.toLowerCase();
    return p.endsWith("/*") ? lower.startsWith(p.slice(0, -1)) : lower === p;
  });
}
function fileOnly(rule) {
  return {
    ...rule,
    validate(value, ctx) {
      if (ctx.field.kind !== "file") return ctx.configError(`A regra "${ctx.rule.name}" s\xF3 se aplica a campos de arquivo.`);
      return rule.validate(value, ctx);
    }
  };
}
async function decodeImage(item, ctx) {
  if (!RASTER_IMAGE_TYPES.includes((item.type || "").toLowerCase())) return { notImage: true };
  try {
    return await ctx.inspect("image", item);
  } catch (error) {
    if (error?.kind === "abort" || error?.name === "AbortError") throw error;
    return { error: true };
  }
}
function dimensionRule(test, varsFor) {
  return fileOnly({
    async: true,
    params: [{ name: "n", type: "integer" }],
    validate: asyncPerFile(async (item, ctx) => {
      const meta = await decodeImage(item, ctx);
      if (meta.notImage) return true;
      if (meta.error) return { variant: "decode" };
      return test(meta, ctx.params.n) ? true : { variant: null };
    }, varsFor)
  });
}
var files_default = {
  files_min: fileOnly({
    params: [{ name: "min", type: "integer" }],
    validate: (value, ctx) => items(value).length + (ctx.field.existingCount || 0) >= ctx.params.min || { valid: false, vars: { min: ctx.params.min } }
  }),
  files_max: fileOnly({
    params: [{ name: "max", type: "integer" }],
    validate: (value, ctx) => items(value).length + (ctx.field.existingCount || 0) <= ctx.params.max || { valid: false, vars: { max: ctx.params.max } }
  }),
  file_min: fileOnly({
    params: [{ name: "min", type: "size" }],
    validate: perFile((item, ctx) => item.size >= ctx.params.min.bytes, (ctx) => ({ min: ctx.params.min.text }))
  }),
  file_max: fileOnly({
    params: [{ name: "max", type: "size" }],
    validate: perFile((item, ctx) => item.size <= ctx.params.max.bytes, (ctx, item) => ({ max: ctx.params.max.text, size: formatBytes(item.size) }))
  }),
  files_total_max: fileOnly({
    params: [{ name: "max", type: "size" }],
    validate(value, ctx) {
      const total = items(value).reduce((sum, item) => sum + item.size, 0);
      return total <= ctx.params.max.bytes || { valid: false, vars: { max: ctx.params.max.text, size: formatBytes(total) } };
    }
  }),
  ext: fileOnly({
    rest: { name: "values", type: "string", min: 1 },
    validate: perFile((item, ctx) => extensionMatches(item.name, ctx.params.values), (ctx) => ({ allowed: ctx.params.values.join(", ") }))
  }),
  mime: fileOnly({
    rest: { name: "values", type: "string", min: 1 },
    validate: perFile((item, ctx) => mimeMatches(item.type, ctx.params.values), (ctx) => ({ allowed: ctx.params.values.join(", ") }))
  }),
  non_empty_file: fileOnly({
    validate: perFile((item) => item.size > 0, () => ({}))
  }),
  image: fileOnly({
    async: true,
    validate: asyncPerFile(async (item, ctx) => {
      if (!RASTER_IMAGE_TYPES.includes((item.type || "").toLowerCase())) return { variant: null };
      const meta = await decodeImage(item, ctx);
      return meta.error ? { variant: "decode" } : true;
    }, () => ({}))
  }),
  width_min: dimensionRule((m, n) => m.width >= n, (ctx) => ({ min: ctx.params.n })),
  width_max: dimensionRule((m, n) => m.width <= n, (ctx) => ({ max: ctx.params.n })),
  height_min: dimensionRule((m, n) => m.height >= n, (ctx) => ({ min: ctx.params.n })),
  height_max: dimensionRule((m, n) => m.height <= n, (ctx) => ({ max: ctx.params.n })),
  dimensions: fileOnly({
    async: true,
    params: [{ name: "size", type: "dimensions" }],
    validate: asyncPerFile(async (item, ctx) => {
      const meta = await decodeImage(item, ctx);
      if (meta.notImage) return true;
      if (meta.error) return { variant: "decode" };
      return meta.width === ctx.params.size.width && meta.height === ctx.params.size.height ? true : { variant: null };
    }, (ctx) => ({ width: ctx.params.size.width, height: ctx.params.size.height }))
  }),
  aspect_ratio: fileOnly({
    async: true,
    params: [{ name: "ratio", type: "ratio" }, { name: "tolerance", type: "number", optional: true }],
    validate: asyncPerFile(async (item, ctx) => {
      const meta = await decodeImage(item, ctx);
      if (meta.notImage) return true;
      if (meta.error) return { variant: "decode" };
      const tolerance = ctx.params.tolerance != null ? Number(ctx.params.tolerance) : 0.01;
      const actual = meta.width / meta.height;
      return Math.abs(actual - ctx.params.ratio.value) / ctx.params.ratio.value <= tolerance ? true : { variant: null };
    }, (ctx) => ({ ratio: ctx.params.ratio.text }))
  })
};

// src/files/file-manager.js
var FileManager = class {
  constructor(field, { append = false, duplicates = "ignore", preview = true, previewMaxBytes = 20 * 1024 * 1024, removeName = null } = {}) {
    this.field = field;
    this.input = field.primary;
    this.append = append;
    this.duplicates = duplicates;
    this.preview = preview;
    this.previewMaxBytes = previewMaxBytes;
    this.items = [];
    this.inspections = /* @__PURE__ */ new Map();
    this.existing = [];
    this.removeName = removeName || `${field.name.replace(/\[\]$/, "")}_remover[]`;
    this.canSyncInput = typeof DataTransfer === "function";
    this.inputInSync = true;
    this.scanExisting();
  }
  get multiple() {
    return this.input.multiple;
  }
  scanExisting() {
    const root = this.field.form;
    const name = this.field.name;
    const baseName = name.replace(/\[\]$/, "");
    const previous = new Map(this.existing.map((e) => [e.id, e]));
    this.existing = Array.from(root.querySelectorAll("[data-form-existing]")).filter((el) => {
      const target = el.getAttribute("data-form-existing");
      return target === name || target === baseName;
    }).map((el) => {
      const id = el.getAttribute("data-form-existing-id");
      const prev = previous.get(id);
      return { id, element: el, removed: prev ? prev.removed : false, name: el.getAttribute("data-form-existing-name") || "" };
    }).filter((e) => e.id);
  }
  newItems() {
    return this.items.slice();
  }
  keptExistingCount() {
    return this.existing.filter((e) => !e.removed).length;
  }
  removedExistingIds() {
    return this.existing.filter((e) => e.removed).map((e) => e.id);
  }
  fingerprint(file) {
    return `${file.name}\0${file.size}\0${file.lastModified}`;
  }
  makeItem(file) {
    return { id: uid("file"), file, name: file.name, size: file.size, type: file.type || "", lastModified: file.lastModified, previewUrl: null, errors: [] };
  }
  /** Chamado no evento change do input. */
  fromInput() {
    const selected = Array.from(this.input.files || []);
    if (this.append && this.multiple) {
      this.add(selected, { fromInput: true });
    } else {
      this.clearItems();
      this.items = selected.map((file) => this.makeItem(file));
      this.inputInSync = true;
    }
    return this.items;
  }
  add(files, { fromInput = false } = {}) {
    const incoming = Array.from(files || []);
    if (!this.multiple) {
      this.clearItems();
      if (incoming[0]) this.items = [this.makeItem(incoming[0])];
      this.syncInput(fromInput && incoming.length <= 1);
      return this.items;
    }
    const known = new Set(this.items.map((item) => this.fingerprint(item.file)));
    for (const file of incoming) {
      const fp = this.fingerprint(file);
      if (this.duplicates === "ignore" && known.has(fp)) continue;
      known.add(fp);
      this.items.push(this.makeItem(file));
    }
    this.syncInput(false);
    return this.items;
  }
  remove(id) {
    const index = this.items.findIndex((item2) => item2.id === id);
    if (index < 0) return false;
    const [item] = this.items.splice(index, 1);
    this.releaseItem(item);
    this.syncInput(false);
    return true;
  }
  toggleExisting(id, removed) {
    const entry = this.existing.find((e) => e.id === String(id));
    if (!entry) return false;
    entry.removed = removed === void 0 ? !entry.removed : !!removed;
    return true;
  }
  /** Espelha a lista interna no input quando o navegador permite (DataTransfer). */
  syncInput(alreadyInSync) {
    if (alreadyInSync) {
      this.inputInSync = true;
      return;
    }
    if (this.canSyncInput) {
      try {
        const dt = new DataTransfer();
        for (const item of this.items) dt.items.add(item.file);
        this.input.files = dt.files;
        this.inputInSync = true;
        return;
      } catch {
        this.canSyncInput = false;
      }
    }
    if (this.items.length === 0) {
      this.input.value = "";
      this.inputInSync = true;
    } else {
      this.inputInSync = false;
    }
  }
  previewFor(item) {
    if (!this.preview || item.previewUrl) return item.previewUrl;
    if (!RASTER_IMAGE_TYPES.includes(item.type.toLowerCase()) || item.size > this.previewMaxBytes) return null;
    if (typeof URL.createObjectURL !== "function") return null;
    item.previewUrl = URL.createObjectURL(item.file);
    return item.previewUrl;
  }
  releaseItem(item) {
    if (item.previewUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(item.previewUrl);
    item.previewUrl = null;
    const inspection = this.inspections.get(item.id);
    if (inspection) {
      inspection.controller.abort();
      this.inspections.delete(item.id);
    }
  }
  clearItems() {
    for (const item of this.items) this.releaseItem(item);
    this.items = [];
  }
  /** Após reset do formulário: descarta novos arquivos e desfaz pedidos de remoção. */
  reset() {
    this.clearItems();
    for (const entry of this.existing) entry.removed = false;
    this.inputInSync = true;
  }
  /** Executa um inspetor uma vez por arquivo; o resultado fica em cache até o arquivo ser removido. */
  inspect(name, item, run) {
    let entry = this.inspections.get(item.id);
    if (!entry) {
      entry = { controller: new AbortController(), results: /* @__PURE__ */ new Map() };
      this.inspections.set(item.id, entry);
    }
    if (!entry.results.has(name)) {
      const promise = run(item.file, { signal: entry.controller.signal });
      promise.catch(() => entry.results.delete(name));
      entry.results.set(name, promise);
    }
    return entry.results.get(name);
  }
  snapshot() {
    return this.items.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      sizeText: formatBytes(item.size),
      type: item.type,
      previewUrl: item.previewUrl,
      errors: item.errors.slice()
    }));
  }
  existingSnapshot() {
    return this.existing.map((e) => ({ id: e.id, name: e.name, removed: e.removed }));
  }
  destroy() {
    this.clearItems();
    this.inspections.clear();
  }
};

// src/transport/xhr.js
function absoluteUrl(url) {
  try {
    return new URL(url, globalThis.location?.href).href;
  } catch {
    return url;
  }
}
function rawFromXhr(xhr, requestUrl) {
  const finalUrl = xhr.responseURL || absoluteUrl(requestUrl);
  return {
    status: xhr.status,
    statusText: xhr.statusText,
    url: finalUrl,
    redirected: !!xhr.responseURL && xhr.responseURL !== absoluteUrl(requestUrl),
    headers: { get: (name) => xhr.getResponseHeader(name) },
    text: typeof xhr.responseText === "string" ? xhr.responseText : ""
  };
}
function xhrTransport(request) {
  return new Promise((resolve, reject) => {
    const { url, method = "POST", headers = {}, body = null, credentials = "same-origin", timeout = 0, signal } = request;
    if (signal?.aborted) return reject(new AbortError());
    const xhr = new XMLHttpRequest();
    let uploadComplete = !body;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    const markUploaded = () => {
      if (uploadComplete) return;
      uploadComplete = true;
      request.onUploadComplete?.();
    };
    const onAbort = () => xhr.abort();
    xhr.open(method.toUpperCase(), url, true);
    for (const [name, value] of Object.entries(headers)) {
      if (value == null) continue;
      if (body instanceof FormData && name.toLowerCase() === "content-type") continue;
      xhr.setRequestHeader(name, value);
    }
    xhr.withCredentials = credentials === "include";
    xhr.timeout = timeout > 0 ? timeout : 0;
    xhr.responseType = "text";
    if (body && request.onUploadProgress) {
      xhr.upload.onloadstart = (event) => request.onUploadProgress({ loaded: 0, total: event.lengthComputable ? event.total : null, lengthComputable: event.lengthComputable });
      xhr.upload.onprogress = (event) => request.onUploadProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : null, lengthComputable: event.lengthComputable });
      xhr.upload.onload = () => markUploaded();
    }
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) markUploaded();
    };
    xhr.onload = () => finish(resolve, rawFromXhr(xhr, url));
    xhr.onerror = () => finish(reject, new OperationalError("Falha de rede ou requisi\xE7\xE3o bloqueada pelo navegador.", { kind: "network", uploadComplete, crossOrigin: isCrossOrigin(url) }));
    xhr.ontimeout = () => finish(reject, new OperationalError("Tempo limite excedido.", { kind: "timeout", uploadComplete }));
    xhr.onabort = () => finish(reject, new AbortError("Envio cancelado.", { uploadComplete }));
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
}
function isCrossOrigin(url) {
  try {
    return new URL(url, globalThis.location?.href).origin !== globalThis.location?.origin;
  } catch {
    return false;
  }
}

// src/core/remote.js
function defaultRemoteAdapter(json) {
  if (!isPlainObject(json) || typeof json.valid !== "boolean") return { valid: null, reason: "contract" };
  const message = typeof json.message === "string" ? json.message : typeof json.mensagem === "string" ? json.mensagem : null;
  return { valid: json.valid, message };
}
var RemoteValidator = class {
  constructor(field, { config, transport, headersFor }) {
    this.field = field;
    this.transport = transport;
    this.headersFor = headersFor;
    const defaults = config.remote;
    const attr = (name) => field.groupAttribute(name);
    this.url = attr("data-form-remote");
    if (!this.url || !this.url.trim()) throw new ConfigError("data-form-remote n\xE3o pode ser vazio.");
    const method = (attr("data-form-remote-method") || defaults.method).toLowerCase();
    if (!["get", "post"].includes(method)) throw new ConfigError(`data-form-remote-method="${method}" inv\xE1lido. Use get ou post.`);
    this.method = method;
    const allowQuery = attr("data-form-remote-allow-query");
    if (method === "get" && field.sensitive && (allowQuery === null || !parseBool(allowQuery, "data-form-remote-allow-query"))) {
      throw new ConfigError("Campo sens\xEDvel com valida\xE7\xE3o remota via GET exporia o valor na URL. Use POST ou declare data-form-remote-allow-query.");
    }
    const debounceAttr = attr("data-form-remote-debounce");
    this.debounce = debounceAttr === null ? defaults.debounce : parseDuration(debounceAttr, "data-form-remote-debounce", { max: 6e4 });
    const timeoutAttr = attr("data-form-remote-timeout");
    this.timeout = timeoutAttr === null ? defaults.timeout : parseDuration(timeoutAttr, "data-form-remote-timeout", { min: 100, max: 12e4 });
    const fieldsAttr = attr("data-form-remote-fields");
    this.extraFields = fieldsAttr ? parseList(fieldsAttr) : [];
    this.param = attr("data-form-remote-param") || field.name;
    const cacheAttr = attr("data-form-remote-cache");
    this.cacheSize = cacheAttr === null ? defaults.cache : parseInteger(cacheAttr, "data-form-remote-cache", { min: 0, max: 500 });
    const ttlAttr = attr("data-form-remote-cache-ttl");
    this.cacheTtl = ttlAttr === null ? defaults.cacheTtl : parseDuration(ttlAttr, "data-form-remote-cache-ttl");
    const inconclusive = (attr("data-form-remote-inconclusive") || defaults.inconclusive).toLowerCase();
    if (!["allow", "block"].includes(inconclusive)) throw new ConfigError('data-form-remote-inconclusive deve ser "allow" ou "block".');
    this.inconclusivePolicy = inconclusive;
    const adapterName = attr("data-form-remote-adapter") || "default";
    this.adapter = get("remoteAdapter", adapterName);
    if (!this.adapter) throw new ConfigError(`Adaptador remoto "${adapterName}" n\xE3o registrado.`);
    this.retries = defaults.retries ?? 1;
    this.cache = /* @__PURE__ */ new Map();
    this.now = () => Date.now();
  }
  cacheKey(value, extras) {
    return JSON.stringify([this.method, this.url, value, extras]);
  }
  readCache(key) {
    if (this.cacheSize === 0) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.now() - entry.at > this.cacheTtl) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }
  writeCache(key, result) {
    if (this.cacheSize === 0) return;
    this.cache.set(key, { result, at: this.now() });
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
  }
  clearCache() {
    this.cache.clear();
  }
  invalidate(value, extras) {
    this.cache.delete(this.cacheKey(value, extras));
  }
  buildRequest(value, extras) {
    const params = new URLSearchParams();
    params.append(this.param, value == null ? "" : String(value));
    params.append("_field", this.field.name);
    for (const [name, v] of extras) params.append(name, v == null ? "" : String(v));
    const crossOrigin = isCrossOrigin(this.url);
    const headers = { Accept: "application/json", ...crossOrigin ? {} : this.headersFor() };
    if (this.method === "get") {
      const url = new URL(this.url, globalThis.location?.href);
      for (const [k, v] of params) url.searchParams.append(k, v);
      return { url: url.href, method: "GET", headers, body: null };
    }
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    return { url: this.url, method: "POST", headers, body: params.toString() };
  }
  /**
   * Retorna { valid: true } | { valid: false, message } | { valid: null, inconclusive: true, reason }.
   * Lança AbortError quando cancelada.
   */
  async validate(value, extras, { signal } = {}) {
    const key = this.cacheKey(value, extras);
    const cached = this.readCache(key);
    if (cached) return { ...cached, cached: true };
    const request = this.buildRequest(value, extras);
    let raw;
    try {
      raw = await withRetry(() => this.transport({ ...request, timeout: this.timeout, signal, credentials: "same-origin" }), {
        retries: this.retries,
        signal,
        shouldRetry: (error, result2) => {
          if (error) return !isAbort(error) && (error.kind === "network" || error.kind === "timeout");
          if (result2 && RETRYABLE_STATUS.has(result2.status)) {
            const retryAfter = Number(result2.headers?.get("retry-after"));
            return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1e3, 1e4) : true;
          }
          return false;
        }
      });
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw new AbortError();
      return { valid: null, inconclusive: true, reason: error.kind || "network" };
    }
    if (raw.status < 200 || raw.status >= 300) return { valid: null, inconclusive: true, reason: `http-${raw.status}` };
    const body = parseBody(raw);
    if (body.type !== "json") return { valid: null, inconclusive: true, reason: body.type === "html" ? "html" : "contract" };
    let adapted;
    try {
      adapted = this.adapter(body.json, raw);
    } catch (error) {
      throw new OperationalError(`Adaptador remoto falhou: ${error.message}`, { kind: "remote-adapter" });
    }
    if (adapted.valid !== true && adapted.valid !== false) return { valid: null, inconclusive: true, reason: adapted.reason || "contract" };
    const result = { valid: adapted.valid, message: adapted.message || null };
    this.writeCache(key, result);
    return result;
  }
};

// src/core/messages.js
var DEFAULT_MESSAGES = {
  __fallback: "Confira o valor de :field.",
  __config: "Este campo tem uma configura\xE7\xE3o inv\xE1lida e n\xE3o pode ser validado.",
  required: "O campo :field \xE9 obrigat\xF3rio.",
  "required.choice": "Selecione uma op\xE7\xE3o em :field.",
  "required.multiple": "Selecione ao menos uma op\xE7\xE3o em :field.",
  "required.checkbox": "Marque :field para continuar.",
  "required.file": "Selecione um arquivo em :field.",
  accepted: "Voc\xEA precisa aceitar :field.",
  required_if: "O campo :field \xE9 obrigat\xF3rio.",
  required_unless: "O campo :field \xE9 obrigat\xF3rio.",
  required_with: "O campo :field \xE9 obrigat\xF3rio quando :other for informado.",
  required_without: "O campo :field \xE9 obrigat\xF3rio quando :other n\xE3o for informado.",
  min: "Digite pelo menos :min caracteres.",
  "min.numeric": "O valor m\xEDnimo de :field \xE9 :min.",
  "min.array": "Selecione pelo menos :min op\xE7\xF5es.",
  max: "Digite no m\xE1ximo :max caracteres.",
  "max.numeric": "O valor m\xE1ximo de :field \xE9 :max.",
  "max.array": "Selecione no m\xE1ximo :max op\xE7\xF5es.",
  length: ":field deve ter exatamente :length caracteres.",
  "length.array": "Selecione exatamente :length op\xE7\xF5es.",
  min_length: "Digite pelo menos :min caracteres.",
  max_length: "Digite no m\xE1ximo :max caracteres.",
  between: ":field deve ter entre :min e :max caracteres.",
  "between.numeric": ":field deve estar entre :min e :max.",
  "between.array": "Selecione entre :min e :max op\xE7\xF5es.",
  email: "Informe um e-mail v\xE1lido.",
  url: "Informe um endere\xE7o (URL) v\xE1lido.",
  pattern: "O formato de :field \xE9 inv\xE1lido.",
  alpha: "Use apenas letras em :field.",
  alphanumeric: "Use apenas letras e n\xFAmeros em :field.",
  digits: "Use apenas d\xEDgitos em :field.",
  "digits.length": ":field deve conter exatamente :length d\xEDgitos.",
  starts_with: ":field deve come\xE7ar com: :allowed.",
  ends_with: ":field deve terminar com: :allowed.",
  contains: ":field deve conter: :allowed.",
  in: "Selecione um valor v\xE1lido para :field.",
  not_in: "O valor informado em :field n\xE3o \xE9 permitido.",
  numeric: "Informe um n\xFAmero v\xE1lido em :field.",
  integer: "Informe um n\xFAmero inteiro em :field.",
  decimal: ":field deve ter no m\xE1ximo :max casas decimais.",
  "decimal.range": ":field deve ter entre :min e :max casas decimais.",
  positive: ":field deve ser maior que zero.",
  negative: ":field deve ser menor que zero.",
  min_value: "O valor m\xEDnimo de :field \xE9 :min.",
  max_value: "O valor m\xE1ximo de :field \xE9 :max.",
  multiple_of: ":field deve ser m\xFAltiplo de :step.",
  same: ":field deve ser igual a :other.",
  different: ":field deve ser diferente de :other.",
  greater_than: ":field deve ser maior que :other.",
  greater_or_equal: ":field deve ser maior ou igual a :other.",
  less_than: ":field deve ser menor que :other.",
  less_or_equal: ":field deve ser menor ou igual a :other.",
  date: "Informe uma data v\xE1lida em :field.",
  "date.datetime": "Informe data e hora v\xE1lidas em :field.",
  "date.time": "Informe um hor\xE1rio v\xE1lido em :field.",
  "date.month": "Informe um m\xEAs v\xE1lido em :field.",
  "date.week": "Informe uma semana v\xE1lida em :field.",
  before: ":field deve ser anterior a :other.",
  after: ":field deve ser posterior a :other.",
  before_or_equal: ":field deve ser igual ou anterior a :other.",
  after_or_equal: ":field deve ser igual ou posterior a :other.",
  date_between: ":field deve estar entre :min e :max.",
  cpf: "Informe um CPF v\xE1lido.",
  cnpj: "Informe um CNPJ v\xE1lido.",
  cpf_cnpj: "Informe um CPF ou CNPJ v\xE1lido.",
  cep: "Informe um CEP v\xE1lido (8 d\xEDgitos).",
  telefone: "Informe um telefone v\xE1lido com DDD.",
  "telefone.celular": "Informe um celular v\xE1lido com DDD.",
  "telefone.fixo": "Informe um telefone fixo v\xE1lido com DDD.",
  luhn: "N\xFAmero de cart\xE3o inv\xE1lido.",
  card: "N\xFAmero de cart\xE3o inv\xE1lido.",
  files_min: "Envie pelo menos :min arquivo(s).",
  files_max: "Envie no m\xE1ximo :max arquivo(s).",
  file_min: "O arquivo :file deve ter pelo menos :min.",
  file_max: "O arquivo :file excede o limite de :max.",
  files_total_max: "O total dos arquivos excede :max.",
  ext: "O arquivo :file deve ter uma das extens\xF5es: :allowed.",
  mime: "O tipo do arquivo :file n\xE3o \xE9 permitido (:allowed).",
  non_empty_file: "O arquivo :file est\xE1 vazio.",
  image: "O arquivo :file n\xE3o \xE9 uma imagem v\xE1lida.",
  "image.decode": "N\xE3o foi poss\xEDvel ler a imagem :file neste navegador.",
  width_min: "A imagem :file deve ter largura m\xEDnima de :min px.",
  width_max: "A imagem :file deve ter largura m\xE1xima de :max px.",
  height_min: "A imagem :file deve ter altura m\xEDnima de :min px.",
  height_max: "A imagem :file deve ter altura m\xE1xima de :max px.",
  dimensions: "A imagem :file deve ter :width x :height px.",
  aspect_ratio: "A imagem :file deve ter propor\xE7\xE3o :ratio.",
  remote: "Este valor n\xE3o est\xE1 dispon\xEDvel.",
  pending: "Verificando...",
  "remote.inconclusive": "N\xE3o foi poss\xEDvel verificar agora. O valor ser\xE1 conferido no envio.",
  "remote.error": "N\xE3o foi poss\xEDvel verificar este valor agora.",
  "submit.network": "N\xE3o foi poss\xEDvel conectar ao servidor. Verifique sua conex\xE3o e tente novamente.",
  "submit.timeout": "O servidor demorou demais para responder.",
  "submit.unknown": "A conex\xE3o caiu depois do envio. N\xE3o \xE9 poss\xEDvel confirmar se a opera\xE7\xE3o foi conclu\xEDda; verifique antes de enviar novamente.",
  "submit.auth": "Sua sess\xE3o expirou ou voc\xEA n\xE3o tem permiss\xE3o. Entre novamente e tente outra vez.",
  "submit.forbidden": "Voc\xEA n\xE3o tem permiss\xE3o para realizar esta opera\xE7\xE3o.",
  "submit.csrf": "O token de seguran\xE7a expirou. Recarregue a p\xE1gina e tente novamente.",
  "submit.too_large": "Os dados enviados excedem o limite aceito pelo servidor.",
  "submit.rate_limited": "Muitas tentativas. Aguarde um pouco e tente novamente.",
  "submit.server": "O servidor encontrou um erro. Tente novamente mais tarde.",
  "submit.http": "O servidor respondeu com um erro (HTTP :status).",
  "submit.validation": "Confira os campos destacados.",
  "submit.logical": "N\xE3o foi poss\xEDvel concluir a opera\xE7\xE3o.",
  "submit.html": "O servidor respondeu com uma p\xE1gina HTML em vez de dados. Isso costuma indicar sess\xE3o expirada, redirecionamento para login ou erro de proxy.",
  "submit.parse": "A resposta do servidor n\xE3o p\xF4de ser interpretada.",
  "submit.changed": "Os dados foram alterados durante a valida\xE7\xE3o. Revise e envie novamente.",
  "submit.config": "O formul\xE1rio possui erros de configura\xE7\xE3o e n\xE3o pode ser enviado.",
  "submit.serialization": "N\xE3o foi poss\xEDvel preparar os dados para envio.",
  "submit.cors": "A requisi\xE7\xE3o foi bloqueada pelo navegador (poss\xEDvel bloqueio de CORS ou rede).",
  "job.failed": "O processamento no servidor falhou.",
  "job.timeout": "O processamento est\xE1 demorando mais que o esperado. Consulte o status mais tarde.",
  "job.canceled": "O processamento foi cancelado.",
  "status.validating": "Validando\u2026",
  "status.uploading": "Enviando\u2026",
  "status.uploading_percent": "Enviando\u2026 :percent%",
  "status.awaiting": "Envio conclu\xEDdo. Aguardando resposta do servidor\u2026",
  "status.processing": "Processando no servidor\u2026",
  "status.processing_percent": "Processando no servidor\u2026 :percent%",
  "status.success": "Conclu\xEDdo.",
  "status.error": "N\xE3o foi poss\xEDvel concluir o envio.",
  "status.canceled": "Envio cancelado.",
  "status.paused": "Envio pausado.",
  "status.observation_stopped": "Acompanhamento encerrado. O processamento pode continuar no servidor.",
  "summary.title": "Corrija os itens abaixo:",
  "upload.expired": "A sess\xE3o de upload expirou. O envio ser\xE1 reiniciado.",
  "upload.failed": "Falha ao enviar o arquivo :file."
};
function interpolate(template, vars) {
  return String(template).replace(/:([a-z_]+)/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}
function resolveMessage({ rule, variant, fieldMessages = {}, genericMessage = null, configMessages = {}, vars = {} }) {
  const keys = variant ? [`${rule}.${variant}`, rule] : [rule];
  let template = null;
  if (fieldMessages[rule] != null) template = fieldMessages[rule];
  else if (genericMessage != null && rule !== "pending") template = genericMessage;
  else {
    for (const key of keys) {
      if (configMessages[key] != null) {
        template = configMessages[key];
        break;
      }
    }
    if (template == null) {
      for (const key of keys) {
        if (DEFAULT_MESSAGES[key] != null) {
          template = DEFAULT_MESSAGES[key];
          break;
        }
      }
    }
  }
  if (template == null) template = DEFAULT_MESSAGES.__fallback;
  return interpolate(template, vars);
}
function safeValuePlaceholder(value, sensitive) {
  if (sensitive) return "";
  if (value == null) return "";
  if (Array.isArray(value)) return truncate(value.map((v) => typeof v === "object" ? v?.name ?? "" : v).join(", "), 60);
  if (typeof value === "object") return "";
  return truncate(value, 60);
}

// src/validators/presence.js
function requiredVariant(field) {
  switch (field.kind) {
    case "radio":
    case "select":
      return "choice";
    case "checkbox-group":
    case "select-multiple":
      return "multiple";
    case "checkbox":
      return "checkbox";
    case "file":
      return "file";
    default:
      return null;
  }
}
function fieldIsEmpty(value, field) {
  if (field?.kind === "file") return toArray(value).length + (field.existingCount || 0) === 0;
  return isEmptyValue(value);
}
function matchesAny(otherValue, values) {
  const list = toArray(otherValue).map((v) => typeof v === "boolean" ? String(v) : v);
  if (list.length === 0) return values.includes("") || values.includes("null");
  return list.some((v) => values.includes(String(v)));
}
var requirePresence = (value, ctx) => fieldIsEmpty(value, ctx.field) ? { valid: false, variant: requiredVariant(ctx.field) } : true;
var presence_default = {
  required: {
    presence: true,
    validate: requirePresence
  },
  optional: { presence: true, validate: () => true },
  nullable: { presence: true, validate: () => true },
  accepted: {
    presence: true,
    validate(value, ctx) {
      if (ctx.field.kind === "checkbox") return ctx.field.checked === true;
      const accepted = ["1", "on", "yes", "sim", "true"];
      return accepted.includes(String(value ?? "").trim().toLowerCase());
    }
  },
  required_if: {
    presence: true,
    params: [{ name: "other", type: "field" }],
    rest: { name: "values", type: "string-or-empty", min: 1 },
    validate(value, ctx) {
      const other = ctx.other(ctx.params.other.ref);
      if (!matchesAny(other.value, ctx.params.values)) return true;
      return requirePresence(value, ctx);
    }
  },
  required_unless: {
    presence: true,
    params: [{ name: "other", type: "field" }],
    rest: { name: "values", type: "string-or-empty", min: 1 },
    validate(value, ctx) {
      const other = ctx.other(ctx.params.other.ref);
      if (matchesAny(other.value, ctx.params.values)) return true;
      return requirePresence(value, ctx);
    }
  },
  required_with: {
    presence: true,
    params: [],
    rest: { name: "others", type: "field", min: 1 },
    validate(value, ctx) {
      const present = ctx.params.others.find((o) => !fieldIsEmpty(ctx.other(o.ref).value, ctx.other(o.ref)));
      if (!present) return true;
      const result = requirePresence(value, ctx);
      return result === true ? true : { valid: false, vars: { other: ctx.other(present.ref).label } };
    }
  },
  required_without: {
    presence: true,
    params: [],
    rest: { name: "others", type: "field", min: 1 },
    validate(value, ctx) {
      const missing = ctx.params.others.find((o) => fieldIsEmpty(ctx.other(o.ref).value, ctx.other(o.ref)));
      if (!missing) return true;
      const result = requirePresence(value, ctx);
      return result === true ? true : { valid: false, vars: { other: ctx.other(missing.ref).label } };
    }
  }
};

// src/core/services.js
var services = {
  maskProvider: null,
  chunks: null,
  Alpine: null
};
function setMaskProvider(provider) {
  services.maskProvider = provider;
}
function setChunkService(service) {
  services.chunks = service;
}

// src/core/events.js
var EVENTS = {
  ready: "form:ready",
  change: "form:change",
  validating: "form:validating",
  validated: "form:validated",
  invalid: "form:invalid",
  beforeSubmit: "form:before-submit",
  submit: "form:submit",
  progress: "form:progress",
  uploaded: "form:uploaded",
  processing: "form:processing",
  success: "form:success",
  error: "form:error",
  cancel: "form:cancel",
  reset: "form:reset",
  destroy: "form:destroy",
  fieldAdded: "form:field-added",
  fieldRemoved: "form:field-removed",
  reveal: "form:reveal",
  configError: "form:config-error"
};
var CANCELABLE = /* @__PURE__ */ new Set([EVENTS.beforeSubmit, EVENTS.submit, EVENTS.reset, EVENTS.reveal]);
function dispatch(target, name, detail = {}) {
  const event = new CustomEvent(name, { bubbles: true, cancelable: CANCELABLE.has(name), detail });
  return target.dispatchEvent(event);
}

// src/core/serializer.js
var SKIP_INPUT_TYPES = /* @__PURE__ */ new Set(["submit", "button", "reset", "image"]);
function collectEntries(controller, { submitter = null, as = "submit", replacements = /* @__PURE__ */ new Map() } = {}) {
  const form = controller.form;
  const entries = [];
  for (const el of formElements(form)) {
    const tag = el.tagName;
    if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA" && tag !== "BUTTON") continue;
    if (el.matches(":disabled")) continue;
    const name = el.getAttribute("name");
    const type = tag === "INPUT" ? (el.getAttribute("type") || "text").toLowerCase() : tag === "BUTTON" ? (el.getAttribute("type") || "submit").toLowerCase() : tag.toLowerCase();
    if (tag === "BUTTON" || SKIP_INPUT_TYPES.has(type)) {
      if (el === submitter && name) entries.push({ name, value: el.value ?? "", control: el });
      continue;
    }
    if (!name) continue;
    const field = controller.fieldForControl(el);
    if (type === "checkbox" || type === "radio") {
      if (el.checked) entries.push({ name, value: el.value, control: el, field });
      else if (type === "checkbox" && field?.uncheckedValue != null && field.kind === "checkbox") entries.push({ name, value: field.uncheckedValue, control: el, field });
      continue;
    }
    if (tag === "SELECT") {
      for (const option of Array.from(el.options)) {
        if (option.selected && !option.disabled) entries.push({ name, value: option.value, control: el, field });
      }
      continue;
    }
    if (type === "file") {
      if (replacements.has(field)) {
        for (const value2 of replacements.get(field)) entries.push({ name, value: value2, control: el, field });
      } else if (field?.files) {
        const items2 = field.files.newItems();
        if (items2.length === 0) entries.push({ name, value: new File([], "", { type: "application/octet-stream" }), control: el, field, emptyFile: true });
        for (const item of items2) entries.push({ name, value: item.file, control: el, field });
      } else {
        const files = Array.from(el.files || []);
        if (files.length === 0) entries.push({ name, value: new File([], "", { type: "application/octet-stream" }), control: el, emptyFile: true });
        for (const file of files) entries.push({ name, value: file, control: el });
      }
      if (field?.files) {
        for (const id of field.files.removedExistingIds()) entries.push({ name: field.files.removeName, value: id, control: el, field, removal: true });
      }
      continue;
    }
    let value = el.value;
    if (field && field.kind === "text" && field.controls[0] === el) {
      const represented = as === "display" ? field.readDisplay() : field.getValue(as);
      value = represented == null ? "" : String(represented);
    }
    entries.push({ name, value, control: el, field });
    const dirname = el.getAttribute("dirname");
    if (dirname && (type === "text" || type === "search" || tag === "TEXTAREA")) {
      entries.push({ name: dirname, value: el.dir === "rtl" ? "rtl" : "ltr", control: el });
    }
  }
  for (const field of controller.componentFields()) {
    if (field.disabled) continue;
    const value = field.getValue(as === "display" ? "display" : as);
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    for (const v of values) entries.push({ name: field.name, value: typeof v === "string" || v instanceof Blob ? v : String(v), field });
  }
  return entries;
}
function toFormData(entries) {
  const data = new FormData();
  for (const entry of entries) {
    if (entry.value instanceof Blob) data.append(entry.name, entry.value, entry.value.name ?? "blob");
    else data.append(entry.name, entry.value);
  }
  return data;
}
function toUrlSearchParams(entries) {
  const params = new URLSearchParams();
  for (const entry of entries) params.append(entry.name, entry.value instanceof Blob ? entry.value.name ?? "" : entry.value);
  return params;
}
function toJsonObject(entries, { nesting = "brackets", jsonFiles = "error" } = {}) {
  const root = /* @__PURE__ */ Object.create(null);
  for (const entry of entries) {
    let value = entry.value;
    if (value instanceof Blob) {
      if (entry.emptyFile) continue;
      if (jsonFiles !== "metadata") {
        throw new SerializationError(`O campo "${entry.name}" cont\xE9m arquivo e a codifica\xE7\xE3o \xE9 JSON. Use multipart ou data-form-json-files="metadata".`, { name: entry.name });
      }
      value = { name: value.name ?? "", size: value.size, type: value.type };
    }
    setPath(root, splitName(entry.name, nesting), value, entry.name);
  }
  return toPlain(root);
}
function entriesSnapshot(entries) {
  return entries.map((entry) => [entry.name, entry.value instanceof Blob ? `[arquivo ${entry.value.name ?? ""} ${entry.value.size}B]` : entry.value]);
}

// src/transport/progress.js
var ProgressTracker = class {
  constructor({ windowMs = 3e3, now: now2 = () => performance.now() } = {}) {
    this.windowMs = windowMs;
    this.now = now2;
    this.reset();
  }
  reset() {
    this.startedAt = null;
    this.samples = [];
    this.loaded = 0;
    this.total = null;
    this.lengthComputable = false;
    this.uploadedAt = null;
  }
  start() {
    this.reset();
    this.startedAt = this.now();
    this.samples.push({ t: this.startedAt, loaded: 0 });
  }
  update({ loaded, total, lengthComputable }) {
    const t = this.now();
    if (this.startedAt == null) this.start();
    this.loaded = Math.max(0, loaded);
    this.lengthComputable = !!lengthComputable && total > 0;
    this.total = this.lengthComputable ? total : null;
    this.samples.push({ t, loaded: this.loaded });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }
  markUploaded() {
    this.uploadedAt = this.now();
    if (this.lengthComputable) this.loaded = this.total;
  }
  speed() {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = last.t - first.t;
    if (dt < 500) return null;
    return Math.max(0, (last.loaded - first.loaded) / dt * 1e3);
  }
  snapshot() {
    const t = this.now();
    const elapsed = this.startedAt == null ? 0 : Math.max(0, (this.uploadedAt ?? t) - this.startedAt);
    const computable = this.lengthComputable && this.total > 0;
    const percent = computable ? Math.min(100, Math.floor(this.loaded / this.total * 100)) : null;
    const speed = this.uploadedAt ? null : this.speed();
    const eta = computable && speed && speed > 0 && elapsed >= 1e3 && !this.uploadedAt ? Math.max(0, Math.round((this.total - this.loaded) / speed)) : null;
    return {
      loaded: this.loaded,
      total: computable ? this.total : null,
      percent,
      indeterminate: !computable,
      lengthComputable: computable,
      speed: speed == null ? null : Math.round(speed),
      eta,
      elapsed: Math.round(elapsed),
      uploaded: this.uploadedAt != null
    };
  }
};
function emptyProgress() {
  return { loaded: 0, total: null, percent: null, indeterminate: true, lengthComputable: false, speed: null, eta: null, elapsed: 0, uploaded: false };
}

// src/ui/progress-ui.js
var ATTRS = [
  "data-form-progress",
  "data-form-progress-bar",
  "data-form-progress-percent",
  "data-form-progress-loaded",
  "data-form-progress-total",
  "data-form-progress-speed",
  "data-form-progress-eta",
  "data-form-progress-elapsed",
  "data-form-status",
  "data-form-cancel",
  "data-form-pause",
  "data-form-resume"
];
function setDisabled(el, disabled) {
  if (el.disabled !== disabled) el.disabled = disabled;
}
function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "\u2014";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
var ProgressUi = class {
  constructor(controller) {
    this.controller = controller;
    this.elements = /* @__PURE__ */ new Map();
    this.statusOriginal = /* @__PURE__ */ new Map();
    this.refresh();
  }
  scope() {
    const form = this.controller.form;
    const roots = [form];
    if (formId(form)) {
      for (const el of document.querySelectorAll(`[data-form-for="${cssEscape(formId(form))}"]`)) roots.push(el);
    }
    return roots;
  }
  refresh() {
    this.elements.clear();
    for (const attr of ATTRS) this.elements.set(attr, []);
    for (const root of this.scope()) {
      for (const attr of ATTRS) {
        if (root !== this.controller.form && root.hasAttribute(attr)) this.elements.get(attr).push(root);
        for (const el of root.querySelectorAll(`[${attr}]`)) {
          if (!this.elements.get(attr).includes(el)) this.elements.get(attr).push(el);
        }
      }
    }
    for (const el of this.elements.get("data-form-status")) {
      if (!this.statusOriginal.has(el)) {
        this.statusOriginal.set(el, { role: el.getAttribute("role"), live: el.getAttribute("aria-live") });
        if (!el.hasAttribute("role")) el.setAttribute("role", "status");
        if (!el.hasAttribute("aria-live")) el.setAttribute("aria-live", "polite");
      }
    }
  }
  list(attr) {
    return this.elements.get(attr) || [];
  }
  render(state, statusText) {
    const p = state.progress;
    const phase = state.phase;
    for (const el of this.list("data-form-progress")) {
      el.setAttribute("data-form-state", phase);
      el.setAttribute("aria-busy", ["validating", "uploading", "awaiting", "processing"].includes(phase) ? "true" : "false");
    }
    for (const el of this.list("data-form-progress-bar")) this.renderBar(el, state);
    this.text("data-form-progress-percent", p.percent == null ? "" : `${p.percent}%`);
    this.text("data-form-progress-loaded", formatBytes(p.loaded));
    this.text("data-form-progress-total", p.total == null ? "\u2014" : formatBytes(p.total));
    this.text("data-form-progress-speed", p.speed == null ? "\u2014" : `${formatBytes(p.speed)}/s`);
    this.text("data-form-progress-eta", formatDuration(p.eta));
    this.text("data-form-progress-elapsed", formatDuration(p.elapsed / 1e3));
    this.text("data-form-status", statusText);
    const cancelable = ["validating", "uploading", "awaiting", "processing", "paused"].includes(phase);
    for (const el of this.list("data-form-cancel")) setDisabled(el, !cancelable);
    const uploads = state.uploads || {};
    const canPause = Object.values(uploads).some((u) => u.status === "uploading");
    const canResume = Object.values(uploads).some((u) => u.status === "paused");
    for (const el of this.list("data-form-pause")) setDisabled(el, !canPause);
    for (const el of this.list("data-form-resume")) setDisabled(el, !canResume);
  }
  renderBar(el, state) {
    const p = state.progress;
    const processing = state.phase === "processing";
    const percent = processing ? state.job?.progress ?? null : p.percent;
    const indeterminate = percent == null && ["uploading", "awaiting", "processing"].includes(state.phase);
    el.setAttribute("data-indeterminate", indeterminate ? "true" : "false");
    if (el.tagName === "PROGRESS") {
      el.max = 100;
      if (percent == null) el.removeAttribute("value");
      else el.value = percent;
      return;
    }
    if (!el.hasAttribute("role")) el.setAttribute("role", "progressbar");
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "100");
    if (percent == null) {
      el.removeAttribute("aria-valuenow");
      el.setAttribute("aria-valuetext", indeterminate ? "Progresso indeterminado" : "");
      el.style.width = "";
    } else {
      el.setAttribute("aria-valuenow", String(percent));
      el.setAttribute("aria-valuetext", `${percent}%`);
      el.style.width = `${percent}%`;
    }
  }
  text(attr, value) {
    for (const el of this.list(attr)) {
      if (el.textContent !== value) el.textContent = value;
    }
  }
  destroy() {
    for (const [el, original] of this.statusOriginal) {
      if (original.role == null) el.removeAttribute("role");
      if (original.live == null) el.removeAttribute("aria-live");
    }
    this.statusOriginal.clear();
    this.elements.clear();
  }
};

// src/core/controller.js
var controllers = /* @__PURE__ */ new WeakMap();
var MANAGED_TAGS = /* @__PURE__ */ new Set(["INPUT", "SELECT", "TEXTAREA"]);
var SKIP_TYPES = /* @__PURE__ */ new Set(["submit", "button", "reset", "image"]);
var CHOICE_KINDS = /* @__PURE__ */ new Set(["select", "select-multiple", "checkbox", "checkbox-group", "radio", "file", "component"]);
var ACTIVE_PHASES = /* @__PURE__ */ new Set(["validating", "uploading", "paused", "awaiting", "processing"]);
var OBSERVED_ATTRIBUTES = ["name", "disabled", "type", "multiple", "form", "data-form-v", "data-form-mask", "data-form-mask-pattern", "data-form-remote", "data-form-ignore", "data-form-label", "data-form-validation", "data-form-hidden", "data-form-submit-value", "data-form-normalize", "data-form-pattern"];
function getController(form) {
  return controllers.get(form) || null;
}
function controllerForElement(el) {
  if (!el) return null;
  if (el.tagName === "FORM" && controllers.has(el)) return controllers.get(el);
  const owner = el.form instanceof HTMLFormElement ? el.form : el.closest?.("form");
  if (owner && controllers.has(owner)) return controllers.get(owner);
  const marker = el.closest?.("[data-form-for]");
  if (marker) {
    const target = document.getElementById(marker.getAttribute("data-form-for"));
    if (target && controllers.has(target)) return controllers.get(target);
  }
  return null;
}
function initialState() {
  return {
    ready: false,
    phase: "idle",
    pristine: true,
    dirty: false,
    validating: false,
    submitting: false,
    uploading: false,
    awaitingResponse: false,
    processing: false,
    paused: false,
    success: false,
    canceled: false,
    failed: false,
    submitted: false,
    submitCount: 0,
    progress: emptyProgress(),
    errors: {},
    generalErrors: [],
    configErrors: [],
    result: null,
    error: null,
    status: "",
    job: null,
    uploads: {},
    fields: {}
  };
}
var FormController = class {
  constructor(form, options = {}, env = {}) {
    if (!(form instanceof HTMLFormElement)) throw new ConfigError("x-form deve ser usado em um elemento <form>.");
    if (form.parentElement?.closest("form")) {
      throw new ConfigError('Formul\xE1rio aninhado dentro de outro <form> detectado. HTML n\xE3o permite formul\xE1rios aninhados; use o atributo form="id" nos controles ou separe os formul\xE1rios.');
    }
    if (controllers.has(form)) throw new StateError("Este formul\xE1rio j\xE1 foi inicializado pelo AlpineForm.");
    this.form = form;
    this.env = { reactive: (x) => x, nextTick: (cb) => setTimeout(cb, 0), ...env };
    this.uid = uid("af");
    this.config = readFormConfig(form, options || {});
    this.services = services;
    this.fields = /* @__PURE__ */ new Map();
    this.controlIndex = /* @__PURE__ */ new Map();
    this.dependents = /* @__PURE__ */ new Map();
    this.cleanups = [];
    this.externalCleanups = /* @__PURE__ */ new Map();
    this.destroyed = false;
    this.submission = null;
    this.poller = null;
    this.tracker = new ProgressTracker();
    this.pendingRefresh = null;
    this.dirtyConfigControls = /* @__PURE__ */ new Set();
    this.allowNativeOnce = false;
    this.idempotency = null;
    this.lastSubmitSnapshot = null;
    this.state = this.env.reactive(Object.assign(initialState(), this.publicMethods()));
    const uiFactory = get("uiAdapter", this.config.ui);
    if (!uiFactory) throw new ConfigError(`Adaptador de UI "${this.config.ui}" n\xE3o registrado.`);
    this.ui = uiFactory({ form, uid: this.uid, controller: this });
    this.progressUi = new ProgressUi(this);
    this.extensions = getFormHooks().map((hook) => hook(this)).filter(Boolean);
    controllers.set(form, this);
    this.installListeners();
    this.observe();
    this.env.nextTick(() => this.initialize());
  }
  publicMethods() {
    const c = this;
    return {
      validate: () => c.validate(),
      validateField: (name) => c.validateFieldByName(name),
      submit: (options) => c.submit(options),
      cancel: () => c.cancel(),
      reset: () => c.reset(),
      resetValidation: () => c.resetValidation(),
      setValue: (name, value, options) => c.setValue(name, value, options),
      getValue: (name, options) => c.getValue(name, options),
      getValues: (options) => c.getValues(options),
      setErrors: (errors, options) => c.setErrors(errors, options),
      clearErrors: (name) => c.clearErrors(name),
      refresh: () => c.refresh(),
      destroy: () => c.destroy(),
      addFiles: (name, files) => c.addFiles(name, files),
      removeFile: (name, id) => c.removeFile(name, id),
      removeExisting: (name, id, removed) => c.removeExisting(name, id, removed),
      pauseUpload: (name) => c.callExtension("pauseUpload", name),
      resumeUpload: (name) => c.callExtension("resumeUpload", name),
      getUploadSession: (name) => c.callExtensionSync("getUploadSession", name),
      cancelJob: () => c.cancelJob(),
      clearRemoteCache: (name) => c.clearRemoteCache(name),
      field: (name) => c.resolveField(name)?.state ?? null,
      has: (name) => !!c.resolveField(name),
      hasError: (name) => (c.resolveField(name)?.state.errors.length ?? 0) > 0,
      firstError: (name) => c.resolveField(name)?.state.errors[0] ?? null,
      diagnostics: () => c.diagnostics()
    };
  }
  log(level, ...args) {
    if (this.config.log === "none") return;
    if (level === "error" || this.config.debug) console[level]("[AlpineForm]", ...args);
  }
  /** Persistência no navegador permitida? (data-form-storage="none" desliga tudo) */
  get storageAllowed() {
    return this.config.storage !== "none";
  }
  initialize() {
    if (this.destroyed) return;
    this.refresh();
    this.state.ready = true;
    this.updateAggregate();
    this.resumePersistedJob();
    dispatch(this.form, EVENTS.ready, { form: this.form, fields: Array.from(this.fields.keys()) });
  }
  /* ------------------------------------------------------------------ descoberta */
  isManageable(el) {
    if (!MANAGED_TAGS.has(el.tagName)) return false;
    if (el.tagName === "INPUT" && SKIP_TYPES.has((el.getAttribute("type") || "text").toLowerCase())) return false;
    if (el.hasAttribute("data-form-ignore")) return false;
    return true;
  }
  discover() {
    const configErrors = [];
    const byName = /* @__PURE__ */ new Map();
    for (const el of formElements(this.form)) {
      if (!this.isManageable(el)) continue;
      const name = el.getAttribute("name");
      if (!name) {
        if (el.hasAttribute("data-form-v")) configErrors.push({ field: null, message: "Campo com data-form-v sem atributo name: n\xE3o ser\xE1 validado nem enviado.", element: el });
        continue;
      }
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(el);
    }
    for (const el of Array.from(this.form.querySelectorAll("[data-form-component]"))) {
      const name = el.getAttribute("data-form-name");
      if (!name) {
        configErrors.push({ field: null, message: "data-form-component exige data-form-name.", element: el });
        continue;
      }
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(el);
    }
    const groups = [];
    for (const [name, list] of byName) {
      const typeOf = (el) => el.tagName === "INPUT" ? (el.getAttribute("type") || "text").toLowerCase() : el.tagName.toLowerCase();
      const radios = list.filter((el) => typeOf(el) === "radio");
      const checkboxes = list.filter((el) => typeOf(el) === "checkbox");
      const hiddens = list.filter((el) => typeOf(el) === "hidden");
      let rest = list;
      if (radios.length) {
        groups.push({ name, key: nameToKey(name), controls: radios, companions: hiddens });
        rest = list.filter((el) => !radios.includes(el) && !hiddens.includes(el));
      } else if (checkboxes.length) {
        groups.push({ name, key: nameToKey(name), controls: checkboxes, companions: hiddens });
        rest = list.filter((el) => !checkboxes.includes(el) && !hiddens.includes(el));
      }
      if (rest.length === 1 && rest.length === list.length) {
        groups.push({ name, key: nameToKey(name), controls: rest, companions: [] });
      } else if (rest.length) {
        const base = nameToKey(name);
        rest.forEach((el, index) => groups.push({ name, key: `${base}.${index}`, controls: [el], companions: [] }));
      }
    }
    return { groups, configErrors };
  }
  fieldForControl(el) {
    return this.controlIndex.get(el) || null;
  }
  resolveField(nameOrKey) {
    if (nameOrKey == null) return null;
    if (typeof nameOrKey === "object" && nameOrKey instanceof Field) return nameOrKey;
    const text2 = String(nameOrKey);
    if (this.fields.has(text2)) return this.fields.get(text2);
    const key = nameToKey(text2);
    if (this.fields.has(key)) return this.fields.get(key);
    for (const field of this.fields.values()) if (field.name === text2) return field;
    return null;
  }
  componentFields() {
    return Array.from(this.fields.values()).filter((f) => f.kind === "component");
  }
  /** Sincroniza campos com o DOM atual. Idempotente; preserva estado de campos que continuam presentes. */
  refresh() {
    if (this.destroyed) return [];
    const { groups, configErrors } = this.discover();
    const seen = /* @__PURE__ */ new Set();
    const keys = /* @__PURE__ */ new Set();
    for (const group of groups) {
      let field = null;
      for (const control of group.controls) {
        const existing = this.controlIndex.get(control);
        if (existing && !seen.has(existing)) {
          field = existing;
          break;
        }
      }
      if (keys.has(group.key)) {
        configErrors.push({ field: group.key, message: `Mais de um campo resulta na chave "${group.key}". Renomeie para evitar ambiguidade.` });
        continue;
      }
      keys.add(group.key);
      if (!field) {
        field = this.createField(group);
      } else {
        const controlsChanged = !valuesEqualList(field.controls, group.controls);
        const keyChanged = field.key !== group.key;
        const configDirty = group.controls.some((c) => this.dirtyConfigControls.has(c));
        if (keyChanged) this.rekeyField(field, group.key);
        field.name = group.name;
        if (controlsChanged) {
          for (const control of field.controls) if (this.controlIndex.get(control) === field) this.controlIndex.delete(control);
          field.controls = group.controls;
          field.companions = group.companions;
          for (const control of group.controls) this.controlIndex.set(control, field);
        }
        if (controlsChanged || keyChanged || configDirty) this.reconfigureField(field);
      }
      seen.add(field);
    }
    for (const field of Array.from(this.fields.values())) {
      if (!seen.has(field)) this.destroyField(field);
    }
    this.dirtyConfigControls.clear();
    for (const field of this.fields.values()) {
      if (field.configError) configErrors.push({ field: field.key, message: field.configError.message });
    }
    this.state.configErrors = configErrors.map((e) => ({ field: e.field, message: e.message }));
    for (const error of configErrors) this.log("error", error.message, error.element || this.resolveField(error.field)?.primary || "");
    if (configErrors.length) dispatch(this.form, EVENTS.configError, { errors: this.state.configErrors });
    this.rebuildDependencies();
    this.bindExternalControls();
    this.progressUi.refresh();
    this.bindExternalUi();
    for (const field of this.fields.values()) if (field.files) this.renderFiles(field);
    this.renderProgress();
    this.updateAggregate();
    return Array.from(this.fields.keys());
  }
  createField(group) {
    const field = new Field(this, group);
    for (const control of group.controls) this.controlIndex.set(control, field);
    this.fields.set(field.key, field);
    this.state.fields[field.key] = {
      key: field.key,
      name: field.name,
      label: field.name,
      kind: field.kind,
      value: null,
      filled: false,
      initialValue: null,
      touched: false,
      dirty: false,
      validated: false,
      validating: false,
      localErrors: [],
      serverErrors: [],
      errors: [],
      valid: false,
      invalid: false,
      remote: "idle",
      configError: null,
      disabled: false,
      files: [],
      existing: []
    };
    field.state = this.state.fields[field.key];
    this.setupField(field);
    field.snapshotInitial();
    field.state.initialValue = this.publicValue(field, field.initialDisplay);
    this.syncFieldValue(field);
    dispatch(this.form, EVENTS.fieldAdded, { field: field.key, name: field.name });
    return field;
  }
  setupField(field) {
    field.configure();
    if (field.kind === "file" && !field.files) {
      const attr = (n) => field.groupAttribute(n);
      const filesCfg = this.config.files;
      const append = attr("data-form-files-append");
      const duplicates = attr("data-form-files-duplicates") || filesCfg.duplicates;
      const preview = attr("data-form-preview");
      if (!["ignore", "allow"].includes(duplicates)) {
        field.configError = field.configError || new ConfigError('data-form-files-duplicates deve ser "ignore" ou "allow".');
      }
      field.files = new FileManager(field, {
        append: append !== null ? append !== "false" : filesCfg.append,
        duplicates,
        preview: preview !== null ? preview !== "false" : filesCfg.preview,
        previewMaxBytes: filesCfg.previewMaxBytes,
        removeName: attr("data-form-existing-remove-name")
      });
      field.files.fromInput();
    }
    field.remote?.clearCache();
    field.remote = null;
    if (!field.configError && field.groupAttribute("data-form-remote") !== null) {
      try {
        field.remote = new RemoteValidator(field, {
          config: this.config,
          transport: (...args) => this.transportFor("remote")(...args),
          headersFor: () => this.securityHeaders()
        });
      } catch (error) {
        if (!isConfigError(error)) throw error;
        field.configError = error;
      }
    }
    if (field.kind === "component" && field.component && !field.unsubscribe) {
      const unsubscribe = field.component.subscribe(field.primary, () => this.handleValueChange(field, "change"));
      field.unsubscribe = typeof unsubscribe === "function" ? unsubscribe : () => {
      };
    }
    field.debouncer?.cancel();
    field.debouncer = debounce(() => this.validateField(field, { trigger: "input" }), field.option("debounce"));
    field.state.label = field.label || field.name;
    field.state.kind = field.kind;
    field.state.configError = field.configError ? field.configError.message : null;
    if (field.configError) {
      field.state.localErrors = [this.message(field, "__config")];
      field.state.validated = true;
      this.composeErrors(field);
    }
    this.renderField(field);
  }
  reconfigureField(field) {
    const wasMasked = field.mask;
    wasMasked?.destroy?.();
    field.mask = null;
    this.setupField(field);
    if (field.state.validated && !field.configError) this.validateField(field, { trigger: "refresh" });
  }
  rekeyField(field, newKey) {
    const state = this.state.fields[field.key];
    delete this.state.fields[field.key];
    delete this.state.errors[field.key];
    this.fields.delete(field.key);
    field.key = newKey;
    state.key = newKey;
    this.state.fields[newKey] = state;
    field.state = this.state.fields[newKey];
    this.fields.set(newKey, field);
    if (field.state.errors.length) this.state.errors[newKey] = field.state.errors.slice();
  }
  destroyField(field) {
    field.unsubscribe?.();
    field.unsubscribe = null;
    field.debouncer?.cancel();
    field.abort?.abort();
    field.runToken += 1;
    field.mask?.destroy?.();
    field.files?.destroy();
    field.remote?.clearCache();
    this.ui.removeField(field);
    this.externalCleanups.get(field)?.();
    this.externalCleanups.delete(field);
    for (const control of field.controls) if (this.controlIndex.get(control) === field) this.controlIndex.delete(control);
    if (this.fields.get(field.key) === field) {
      this.fields.delete(field.key);
      delete this.state.fields[field.key];
      delete this.state.errors[field.key];
    }
    dispatch(this.form, EVENTS.fieldRemoved, { field: field.key, name: field.name });
  }
  rebuildDependencies() {
    this.dependents = /* @__PURE__ */ new Map();
    for (const field of this.fields.values()) {
      for (const ref of field.refs || []) {
        const target = this.resolveField(ref);
        if (!target) continue;
        if (!this.dependents.has(target)) this.dependents.set(target, /* @__PURE__ */ new Set());
        this.dependents.get(target).add(field);
      }
      for (const ref of field.remote?.extraFields || []) {
        const target = this.resolveField(ref);
        if (!target) continue;
        if (!this.dependents.has(target)) this.dependents.set(target, /* @__PURE__ */ new Set());
        this.dependents.get(target).add(field);
      }
    }
  }
  /** Ciclos (ex.: a same:b e b same:a) são permitidos; a propagação é de um nível e não entra em laço. */
  dependencyCycles() {
    const cycles = [];
    const visit = (node, path) => {
      for (const next of this.dependents.get(node) || []) {
        const index = path.indexOf(next);
        if (index >= 0) {
          cycles.push([...path.slice(index), next].map((f) => f.key));
          continue;
        }
        if (path.length < 50) visit(next, [...path, next]);
      }
    };
    for (const field of this.fields.values()) visit(field, [field]);
    const unique = /* @__PURE__ */ new Map();
    for (const cycle of cycles) unique.set([...new Set(cycle)].sort().join("|"), cycle);
    return Array.from(unique.values());
  }
  diagnostics() {
    return {
      configErrors: this.state.configErrors.slice(),
      cycles: this.dependencyCycles(),
      fields: Array.from(this.fields.values()).map((f) => ({ key: f.key, name: f.name, kind: f.kind, rules: f.rules.map((r) => r.name), mask: f.mask?.name ?? null, remote: !!f.remote, refs: Array.from(f.refs || []) }))
    };
  }
  /* ------------------------------------------------------------------ listeners */
  on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener(type, handler, options);
  }
  installListeners() {
    const form = this.form;
    const handlers = this.controlHandlers();
    for (const [type, handler, options] of handlers) this.cleanups.push(this.on(form, type, handler, options));
    this.cleanups.push(this.on(form, "submit", (e) => this.onSubmit(e)));
    this.cleanups.push(this.on(form, "reset", (e) => this.onNativeReset(e)));
    this.cleanups.push(this.on(form, "click", (e) => this.onClick(e)));
    this.cleanups.push(this.on(form, "dragover", (e) => this.onDrag(e, true)));
    this.cleanups.push(this.on(form, "dragleave", (e) => this.onDrag(e, false)));
    this.cleanups.push(this.on(form, "drop", (e) => this.onDrop(e)));
  }
  controlHandlers() {
    return [
      ["beforeinput", (e) => this.onBeforeInput(e), true],
      ["input", (e) => this.onMaskInput(e), true],
      ["input", (e) => this.onInput(e), false],
      ["change", (e) => this.onChange(e), false],
      ["focusout", (e) => this.onBlur(e), false],
      ["compositionstart", (e) => this.onComposition(e, true), false],
      ["compositionend", (e) => this.onComposition(e, false), false]
    ];
  }
  /** Controles associados pelo atributo form fora da árvore do <form> recebem listeners próprios. */
  bindExternalControls() {
    for (const field of this.fields.values()) {
      const external = field.controls.filter((c) => !this.form.contains(c));
      if (!external.length) {
        this.externalCleanups.get(field)?.();
        this.externalCleanups.delete(field);
        continue;
      }
      if (this.externalCleanups.has(field)) continue;
      const removers = [];
      for (const control of external) {
        for (const [type, handler, options] of this.controlHandlers()) removers.push(this.on(control, type, handler, options));
      }
      this.externalCleanups.set(field, () => removers.forEach((r) => r()));
    }
  }
  bindExternalUi() {
    this.externalUiCleanup?.();
    const removers = [];
    if (formId(this.form)) {
      for (const root of document.querySelectorAll(`[data-form-for="${cssEscape(formId(this.form))}"]`)) {
        if (this.form.contains(root)) continue;
        removers.push(this.on(root, "click", (e) => this.onClick(e)));
        removers.push(this.on(root, "dragover", (e) => this.onDrag(e, true)));
        removers.push(this.on(root, "dragleave", (e) => this.onDrag(e, false)));
        removers.push(this.on(root, "drop", (e) => this.onDrop(e)));
      }
    }
    this.externalUiCleanup = () => removers.forEach((r) => r());
  }
  observe() {
    if (typeof MutationObserver !== "function") return;
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(this.form, { childList: true, subtree: true, attributes: true, attributeFilter: OBSERVED_ATTRIBUTES });
    for (const control of formElements(this.form)) {
      if (!this.form.contains(control)) this.observer.observe(control, { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES });
    }
  }
  onMutations(records) {
    let relevant = false;
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target.closest?.("[data-form-generated]")) continue;
        if (record.target.tagName === "BUTTON") continue;
        relevant = true;
        if (record.attributeName !== "name") this.dirtyConfigControls.add(record.target);
        continue;
      }
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node.nodeType !== 1) continue;
        if (node.hasAttribute("data-form-generated") || node.closest?.("[data-form-generated]")) continue;
        if (MANAGED_TAGS.has(node.tagName) || node.hasAttribute("data-form-component") || node.hasAttribute("data-form-existing") || node.querySelector?.("input,select,textarea,[data-form-component],[data-form-existing],[data-form-progress],[data-form-status],[data-form-file-list]") || node.hasAttribute("data-form-file-list") || node.hasAttribute("data-form-progress") || node.hasAttribute("data-form-status")) {
          relevant = true;
        }
      }
    }
    if (!relevant || this.pendingRefresh) return;
    this.pendingRefresh = setTimeout(() => {
      this.pendingRefresh = null;
      if (this.destroyed) return;
      for (const field of this.fields.values()) field.files?.scanExisting();
      this.refresh();
    }, 0);
  }
  targetField(event) {
    const el = event.target;
    if (!el || el.nodeType !== 1) return null;
    if (el.matches?.("[data-form-component]")) return this.fieldForControl(el);
    return this.fieldForControl(el) || (el.closest ? this.fieldForControl(el.closest("[data-form-component]")) : null);
  }
  onBeforeInput(event) {
    const field = this.targetField(event);
    field?.mask?.handleBeforeInput?.(event);
  }
  onMaskInput(event) {
    const field = this.targetField(event);
    if (!field?.mask) return;
    if (event.isComposing || field.composing) return;
    field.mask.handleInput(event);
  }
  onComposition(event, active) {
    const field = this.targetField(event);
    if (!field) return;
    field.composing = active;
    if (!active) {
      field.mask?.handleInput?.(event);
      this.handleValueChange(field, "input");
    }
  }
  onInput(event) {
    const field = this.targetField(event);
    if (!field || field.kind === "file") return;
    if (event.isComposing || field.composing) return;
    this.handleValueChange(field, "input");
  }
  onChange(event) {
    const field = this.targetField(event);
    if (!field) return;
    if (field.kind === "file") {
      field.files.fromInput();
      this.renderFiles(field);
    }
    if (field.mask) field.mask.handleChange?.(event);
    this.handleValueChange(field, "change");
  }
  onBlur(event) {
    const field = this.targetField(event);
    if (!field) return;
    if (event.relatedTarget && field.controls.includes(event.relatedTarget)) return;
    field.mask?.handleBlur?.(event);
    const mode = field.option("validation");
    field.state.touched = true;
    if (mode === "live" || mode === "blur" || mode === "input") {
      field.debouncer.cancel();
      this.validateField(field, { trigger: "blur" });
    }
  }
  onClick(event) {
    const el = event.target?.closest?.("[data-form-cancel],[data-form-pause],[data-form-resume],[data-form-existing-remove]");
    if (!el) return;
    if (el.hasAttribute("data-form-cancel")) {
      event.preventDefault();
      this.cancel();
    } else if (el.hasAttribute("data-form-pause")) {
      event.preventDefault();
      this.callExtension("pauseUpload").catch((error) => this.log("error", error));
    } else if (el.hasAttribute("data-form-resume")) {
      event.preventDefault();
      this.callExtension("resumeUpload").catch((error) => this.log("error", error));
    } else if (el.hasAttribute("data-form-existing-remove")) {
      event.preventDefault();
      const container = el.closest("[data-form-existing]");
      if (!container) return;
      this.removeExisting(container.getAttribute("data-form-existing"), container.getAttribute("data-form-existing-id"));
    }
  }
  dropzoneField(event) {
    const zone = event.target?.closest?.("[data-form-dropzone]");
    if (!zone) return null;
    const field = this.resolveField(zone.getAttribute("data-form-dropzone"));
    return field && field.kind === "file" ? { zone, field } : null;
  }
  onDrag(event, over) {
    const target = this.dropzoneField(event);
    if (!target) return;
    if (over) event.preventDefault();
    if (!over && target.zone.contains(event.relatedTarget)) return;
    this.ui.setDropzoneOver(target.zone, over);
  }
  onDrop(event) {
    const target = this.dropzoneField(event);
    if (!target) return;
    event.preventDefault();
    this.ui.setDropzoneOver(target.zone, false);
    const files = event.dataTransfer?.files;
    if (files && files.length) this.addFiles(target.field, files);
  }
  /* ------------------------------------------------------------------ valores e estado */
  publicValue(field, display) {
    if (field.sensitive) return null;
    if (field.kind === "file") return (display || []).map((item) => ({ id: item.id, name: item.name, size: item.size, type: item.type }));
    return Array.isArray(display) ? display.slice() : display;
  }
  syncFieldValue(field) {
    const display = field.readDisplay();
    const state = field.state;
    state.value = this.publicValue(field, display);
    state.filled = !fieldIsEmpty(field.kind === "file" ? display : display, field.infoForValidators());
    state.dirty = field.isDirty();
    state.disabled = field.disabled;
    if (field.files) {
      state.files = field.files.snapshot();
      state.existing = field.files.existingSnapshot();
    }
  }
  handleValueChange(field, trigger, { propagate = true, silent = false } = {}) {
    this.syncFieldValue(field);
    if (field.state.serverErrors.length && field.option("serverErrors") === "clear-on-change") {
      field.state.serverErrors = [];
      this.composeErrors(field);
      this.renderField(field);
      this.renderSummary();
    }
    this.updateAggregate();
    if (!silent) {
      dispatch(this.form, EVENTS.change, {
        field: field.key,
        name: field.name,
        value: field.sensitive ? void 0 : field.state.value,
        trigger
      });
    }
    const mode = field.option("validation");
    const choice = CHOICE_KINDS.has(field.kind);
    if (trigger === "change" && choice) field.state.touched = true;
    if (mode === "live") {
      if (trigger === "change" && choice) this.validateNow(field, "change");
      else if (trigger === "input" && (field.state.touched || field.state.validated)) field.debouncer();
    } else if (mode === "input") {
      if (trigger === "input") field.debouncer();
      else if (trigger === "change") this.validateNow(field, "change");
    } else if (mode === "change") {
      if (trigger === "change") this.validateNow(field, "change");
    } else if ((mode === "blur" || mode === "submit") && field.state.validated && trigger !== "api") {
      field.debouncer();
    }
    if (propagate) this.propagate(field);
  }
  validateNow(field, trigger) {
    field.debouncer.cancel();
    return this.validateField(field, { trigger });
  }
  /** Revalida dependentes já validados/tocados. Um nível por mudança de valor: ciclos não geram laço. */
  propagate(source, visited = /* @__PURE__ */ new Set([source])) {
    for (const dependent of this.dependents.get(source) || []) {
      if (visited.has(dependent)) continue;
      visited.add(dependent);
      if (dependent.state.validated || dependent.state.touched || this.state.submitted) {
        dependent.remote?.invalidate?.(dependent.validationValue(), this.remoteExtras(dependent));
        this.validateField(dependent, { trigger: "dependency" });
      }
    }
  }
  updateAggregate() {
    let dirty = false;
    let validating = false;
    for (const field of this.fields.values()) {
      if (field.state.dirty) dirty = true;
      if (field.state.validating) validating = true;
    }
    this.state.dirty = dirty;
    this.state.pristine = !dirty;
    this.state.validating = validating || this.state.phase === "validating";
  }
  setPhase(phase) {
    this.state.phase = phase;
    this.state.submitting = ACTIVE_PHASES.has(phase);
    this.state.uploading = phase === "uploading" || phase === "paused";
    this.state.paused = phase === "paused";
    this.state.awaitingResponse = phase === "awaiting";
    this.state.processing = phase === "processing";
    this.state.success = phase === "success";
    this.state.canceled = phase === "canceled";
    this.state.failed = phase === "error";
    if (ACTIVE_PHASES.has(phase)) this.form.setAttribute("aria-busy", "true");
    else this.form.removeAttribute("aria-busy");
    this.form.setAttribute("data-form-state", phase);
    this.updateAggregate();
    this.renderProgress();
  }
  statusText() {
    const s = this.state;
    const m = (key) => this.formMessage(key, { percent: s.progress.percent ?? "", status: s.result?.status ?? "" });
    switch (s.phase) {
      case "validating":
        return m("status.validating");
      case "uploading":
        return s.progress.percent == null ? m("status.uploading") : m("status.uploading_percent");
      case "paused":
        return m("status.paused");
      case "awaiting":
        return m("status.awaiting");
      case "processing": {
        const job = s.job;
        const base = job?.progress != null ? this.formMessage("status.processing_percent", { percent: job.progress }) : m("status.processing");
        return job?.message ? `${base} ${job.message}` : base;
      }
      case "success":
        return s.result?.message || m("status.success");
      case "error":
        return s.error?.message || m("status.error");
      case "canceled":
        return s.error?.message || m("status.canceled");
      default:
        return "";
    }
  }
  renderProgress() {
    this.state.status = this.statusText();
    this.progressUi.render(this.state, this.state.status);
  }
  /* ------------------------------------------------------------------ mensagens */
  formMessage(key, vars = {}) {
    const template = this.config.messages[key] ?? DEFAULT_MESSAGES[key] ?? key;
    return interpolate(template, vars);
  }
  message(field, rule, { variant = null, vars = {}, fallback = null } = {}) {
    return resolveMessage({
      rule,
      variant,
      fieldMessages: field.messages || {},
      genericMessage: rule.startsWith("__") || rule.includes(".") || rule === "pending" ? null : field.genericMessage,
      configMessages: fallback ? { ...this.config.messages, [rule]: this.config.messages[rule] ?? fallback } : this.config.messages,
      vars: { field: field.label || field.name, ...vars }
    });
  }
  ruleVars(field, rule, value) {
    const vars = { value: safeValuePlaceholder(value, field.sensitive) };
    for (const [key, param] of Object.entries(rule.params || {})) {
      if (Array.isArray(param)) vars[key] = param.map((p) => p && typeof p === "object" ? p.text ?? p.ref ?? p.literal ?? p.keyword : p).join(", ");
      else if (param && typeof param === "object") {
        if (param.ref) vars[key] = this.resolveField(param.ref)?.label ?? param.ref;
        else vars[key] = param.text ?? param.literal ?? param.keyword ?? "";
      } else vars[key] = param;
    }
    if (vars.other == null && rule.refs?.length) vars.other = this.resolveField(rule.refs[0])?.label ?? rule.refs[0];
    if (Array.isArray(rule.params?.values)) vars.allowed = rule.params.values.join(", ");
    return vars;
  }
  composeErrors(field) {
    const state = field.state;
    state.errors = [...state.localErrors, ...state.serverErrors];
    state.invalid = state.errors.length > 0;
    state.valid = state.validated && !state.validating && !state.invalid && state.remote !== "pending";
    if (state.errors.length) this.state.errors[field.key] = state.errors.slice();
    else delete this.state.errors[field.key];
  }
  /* ------------------------------------------------------------------ validação */
  otherInfo(ref, field) {
    const other = this.resolveField(ref);
    if (!other) throw new ConfigError(`O campo "${field.name}" referencia "${ref}", que n\xE3o existe neste formul\xE1rio.`);
    const info = other.infoForValidators();
    return { ...info, value: other.disabled ? null : other.validationValue(), exists: true };
  }
  validationContext(field, rule, signal) {
    const controller = this;
    return {
      field: field.infoForValidators(),
      rule,
      params: rule.params,
      signal,
      config: this.config,
      clock: this.config.clock || (() => /* @__PURE__ */ new Date()),
      other: (ref) => controller.otherInfo(ref, field),
      attribute: (name) => field.groupAttribute(name),
      pattern: () => {
        if (!field.patternRegex) throw new ConfigError('A regra "pattern" exige data-form-pattern.');
        return field.patternRegex;
      },
      inspect: (name, item) => {
        const inspector = get("fileInspector", name);
        if (!inspector) throw new ConfigError(`Inspetor de arquivo "${name}" n\xE3o registrado.`);
        return field.files.inspect(name, item, (file, opts) => inspector.inspect(file, { ...opts, field: field.infoForValidators(), attribute: (attr) => field.groupAttribute(attr) }));
      },
      configError: (message) => {
        throw new ConfigError(message);
      }
    };
  }
  /** Executa uma regra e normaliza o retorno em null (válido) ou { messages, items }. */
  async runRule(field, rule, value, signal) {
    const ctx = this.validationContext(field, rule, signal);
    let result = rule.def.validate(value, ctx);
    if (result && typeof result.then === "function") result = await result;
    if (result === true || result === void 0 || result === null) return null;
    if (typeof result === "string") return { messages: [this.message(field, rule.name, { fallback: result, vars: this.ruleVars(field, rule, value) })], items: [] };
    if (result === false) result = { valid: false };
    if (result.valid === true) return null;
    const baseVars = this.ruleVars(field, rule, value);
    const ruleName = result.rule || rule.name;
    if (Array.isArray(result.items) && result.items.length) {
      const items2 = result.items.map((item) => ({
        id: item.id,
        message: this.message(field, ruleName, { variant: item.variant ?? result.variant ?? null, vars: { ...baseVars, ...result.vars || {}, ...item.vars || {} }, fallback: result.message })
      }));
      return { messages: [items2[0].message, ...items2.slice(1).map((i) => i.message)], items: items2 };
    }
    return {
      messages: [this.message(field, ruleName, { variant: result.variant ?? null, vars: { ...baseVars, ...result.vars || {} }, fallback: result.message })],
      items: []
    };
  }
  remoteExtras(field) {
    return (field.remote?.extraFields || []).map((ref) => {
      const other = this.resolveField(ref);
      return [other ? other.name : ref, other ? other.submitValue() : ""];
    });
  }
  /**
   * Valida um campo. Cada execução recebe um token; resultados de execuções antigas são descartados.
   * Ordem: badInput nativo -> regras de presença -> (vazio? encerra) -> regras síncronas -> assíncronas -> remota.
   */
  async validateField(field, { trigger = "api", snapshotValue, remoteDebounce = true } = {}) {
    if (this.destroyed || !this.fields.has(field.key)) return { valid: true, skipped: true };
    field.abort?.abort();
    const token = ++field.runToken;
    const abort = new AbortController();
    field.abort = abort;
    const signal = abort.signal;
    const state = field.state;
    const finish = (localErrors, extra = {}) => {
      if (token !== field.runToken) return { valid: localErrors.length === 0, stale: true };
      state.localErrors = localErrors;
      state.validated = true;
      state.validating = false;
      if (extra.remote) state.remote = extra.remote;
      if (field.files) {
        const itemErrors2 = extra.itemErrors || /* @__PURE__ */ new Map();
        for (const item of field.files.items) item.errors = itemErrors2.get(item.id) || [];
        state.files = field.files.snapshot();
        this.renderFiles(field);
      }
      this.composeErrors(field);
      this.updateAggregate();
      this.renderField(field, extra.info);
      if (this.state.submitted) this.renderSummary();
      dispatch(this.form, EVENTS.validated, { field: field.key, valid: !state.invalid, errors: state.errors.slice(), trigger });
      return { valid: state.errors.length === 0, errors: state.errors.slice(), localErrors };
    };
    if (field.configError) return finish([this.message(field, "__config")], { remote: "idle" });
    if (field.disabled || field.skipped) {
      const result = finish([], { remote: "idle" });
      state.validated = false;
      state.valid = false;
      this.renderField(field);
      return { ...result, skipped: true };
    }
    if (field.kind === "hidden" && !field.rules.length) return finish([]);
    const value = snapshotValue !== void 0 ? snapshotValue : field.validationValue();
    const info = field.infoForValidators();
    const errorsMode = field.option("errors");
    const errors = [];
    const itemErrors = /* @__PURE__ */ new Map();
    const collect = (outcome) => {
      errors.push(...errorsMode === "first" ? outcome.messages.slice(0, 1) : outcome.messages);
      for (const item of outcome.items) itemErrors.set(item.id, [...itemErrors.get(item.id) || [], item.message]);
    };
    state.validating = true;
    this.updateAggregate();
    dispatch(this.form, EVENTS.validating, { field: field.key, trigger });
    try {
      if (field.inputType === "number" && field.primary.validity?.badInput) {
        return finish([this.message(field, "numeric")], { remote: "idle" });
      }
      for (const rule of field.rules.filter((r) => r.def.presence)) {
        const outcome = await this.runRule(field, rule, value, signal);
        if (outcome) {
          collect(outcome);
          if (errorsMode === "first") break;
        }
      }
      if (errors.length) return finish(errors, { remote: "idle", itemErrors });
      if (fieldIsEmpty(value, info)) return finish([], { remote: "idle" });
      const others = field.rules.filter((r) => !r.def.presence);
      for (const rule of others.filter((r) => !r.def.async)) {
        const outcome = await this.runRule(field, rule, value, signal);
        if (outcome) {
          collect(outcome);
          if (errorsMode === "first") break;
        }
      }
      if (!errors.length) {
        for (const rule of others.filter((r) => r.def.async)) {
          if (signal.aborted) return { valid: false, stale: true };
          const outcome = await this.runRule(field, rule, value, signal);
          if (outcome) {
            collect(outcome);
            if (errorsMode === "first") break;
          }
        }
      }
      if (errors.length || !field.remote) return finish(errors, { remote: "idle", itemErrors });
      return await this.runRemote(field, value, { token, signal, trigger, remoteDebounce, finish, itemErrors });
    } catch (error) {
      if (isAbort(error) || signal.aborted) {
        if (token === field.runToken) {
          state.validating = false;
          this.updateAggregate();
        }
        return { valid: false, stale: true };
      }
      if (isConfigError(error)) {
        field.configError = error;
        state.configError = error.message;
        this.log("error", `Campo "${field.name}":`, error.message);
        this.state.configErrors = [...this.state.configErrors, { field: field.key, message: error.message }];
        return finish([this.message(field, "__config")], { remote: "idle" });
      }
      this.log("error", `Falha ao validar "${field.name}":`, error);
      return finish([this.formMessage("remote.error")], { remote: "idle" });
    }
  }
  async runRemote(field, value, { token, signal, trigger, remoteDebounce, finish, itemErrors }) {
    const remote = field.remote;
    const state = field.state;
    if (token !== field.runToken) return { valid: false, stale: true };
    state.remote = "pending";
    state.localErrors = [];
    this.composeErrors(field);
    this.renderField(field);
    if (remoteDebounce && (trigger === "input" || trigger === "dependency") && remote.debounce > 0) {
      await sleep(remote.debounce, signal);
    }
    const extras = this.remoteExtras(field);
    const result = await remote.validate(value, extras, { signal });
    if (token !== field.runToken || !valuesEqual(field.validationValue(), value)) return { valid: false, stale: true };
    if (result.valid === true) return finish([], { remote: "valid", itemErrors });
    if (result.valid === false) {
      const message = this.message(field, "remote", { fallback: result.message || null });
      return finish([message], { remote: "invalid", itemErrors });
    }
    if (remote.inconclusivePolicy === "block") return finish([this.message(field, "remote.error")], { remote: "inconclusive", itemErrors });
    return finish([], { remote: "inconclusive", itemErrors, info: this.message(field, "remote.inconclusive") });
  }
  async validateFieldByName(name) {
    const field = this.resolveField(name);
    if (!field) throw new ConfigError(`Campo "${name}" n\xE3o encontrado neste formul\xE1rio.`);
    field.debouncer.cancel();
    field.state.touched = true;
    return this.validateField(field, { trigger: "api", remoteDebounce: false });
  }
  /** Valida todos os campos (respeitando disabled/skip). Retorna { valid, errors, invalidFields }. */
  async validate({ trigger = "api" } = {}) {
    const fields = Array.from(this.fields.values());
    for (const field of fields) field.debouncer.cancel();
    const results = await Promise.all(fields.map((field) => this.validateField(field, { trigger, remoteDebounce: false })));
    const invalidFields = fields.filter((field, i) => !results[i].skipped && field.state.errors.length > 0);
    const errors = {};
    for (const field of invalidFields) errors[field.key] = field.state.errors.slice();
    const formConfigErrors = this.state.configErrors.filter((e) => !e.field);
    const valid = invalidFields.length === 0 && formConfigErrors.length === 0;
    if (!valid) dispatch(this.form, EVENTS.invalid, { errors, trigger });
    return { valid, errors, invalidFields: invalidFields.map((f) => f.key) };
  }
  valueSnapshot() {
    const map = /* @__PURE__ */ new Map();
    for (const field of this.fields.values()) map.set(field, JSON.stringify(field.comparableValue()));
    return map;
  }
  /**
   * Política de snapshot no submit: valida, compara os valores com o instante inicial da validação e,
   * se algo mudou durante validações assíncronas, valida de novo (até 2 vezes) antes de serializar.
   */
  async validateForSubmit() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = this.valueSnapshot();
      const result = await this.validate({ trigger: "submit" });
      const after = this.valueSnapshot();
      let changed = before.size !== after.size;
      if (!changed) {
        for (const [field, value] of before) if (after.get(field) !== value) changed = true;
      }
      if (!changed) return result;
    }
    return { valid: false, changed: true, errors: {}, invalidFields: [] };
  }
  /* ------------------------------------------------------------------ UI */
  fieldView(field, info) {
    const s = field.state;
    let status = "idle";
    let messages = [];
    if (field.configError) {
      status = "invalid";
      messages = s.errors.length ? s.errors : [this.message(field, "__config")];
    } else if (s.remote === "pending" && !s.localErrors.length) {
      status = "pending";
      messages = s.serverErrors.slice();
      info = info || this.message(field, "pending");
    } else if (s.errors.length && (s.validated || s.serverErrors.length)) {
      status = "invalid";
      messages = s.errors;
    } else if (s.validated && !s.validating) {
      status = "valid";
    }
    if (field.option("errors") === "first") messages = messages.slice(0, 1);
    return { status, messages, info: info || null, showValid: field.option("showValid") };
  }
  renderField(field, info) {
    if (this.destroyed) return;
    try {
      this.ui.renderField(field, this.fieldView(field, info));
    } catch (error) {
      if (!isConfigError(error)) throw error;
      field.configError = error;
      field.state.configError = error.message;
      this.log("error", error.message);
    }
  }
  renderSummary() {
    const mode = this.config.summary;
    if (mode === "none") return;
    const items2 = [];
    for (const message of this.state.generalErrors) items2.push({ text: message });
    for (const field of this.orderedFields()) {
      if (!field.state.errors.length) continue;
      const hasInline = field.kind !== "hidden" || field.groupAttribute("data-form-error-target");
      if (mode === "all" || !hasInline) {
        for (const text2 of field.option("errors") === "first" ? field.state.errors.slice(0, 1) : field.state.errors) {
          items2.push({ text: hasInline ? `${field.label}: ${text2}` : text2, field: hasInline ? field : null, onActivate: hasInline ? () => this.focusField(field) : null });
        }
      }
    }
    const formConfig = this.state.configErrors.filter((e) => !e.field);
    if (formConfig.length && this.state.submitted) items2.push({ text: this.formMessage("submit.config") });
    this.ui.renderSummary({ title: items2.length ? this.formMessage("summary.title") : null, items: items2 });
  }
  renderFiles(field) {
    if (!field.files) return;
    const names2 = /* @__PURE__ */ new Set([field.name, field.name.replace(/\[\]$/, ""), field.key]);
    const containers = [];
    const roots = [this.form];
    if (formId(this.form)) for (const el of document.querySelectorAll(`[data-form-for="${cssEscape(formId(this.form))}"]`)) roots.push(el);
    for (const root of roots) {
      for (const el of root.querySelectorAll("[data-form-file-list]")) if (names2.has(el.getAttribute("data-form-file-list"))) containers.push(el);
    }
    if (containers.length) for (const item of field.files.items) field.files.previewFor(item);
    field.state.files = field.files.snapshot();
    field.state.existing = field.files.existingSnapshot();
    for (const container of containers) {
      this.ui.renderFileList(field, container, field.state.files, {
        onRemove: (id) => {
          this.removeFile(field, id);
          if (!field.files.items.length) field.primary.focus();
        }
      });
    }
    for (const entry of field.files.existing) this.ui.renderExisting(entry);
  }
  orderedFields() {
    return Array.from(this.fields.values()).sort((a, b) => {
      if (a.primary === b.primary) return 0;
      return a.primary.compareDocumentPosition(b.primary) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }
  /** Dispara form:reveal (para abas/accordions/modais abrirem) e então foca e rola até o campo. */
  async focusField(field) {
    const control = field.kind === "radio" || field.kind === "checkbox-group" ? field.controls.find((c) => c.checked) || field.primary : field.primary;
    dispatch(control, EVENTS.reveal, { field: field.key, name: field.name, element: control });
    await this.config.hooks.reveal?.(control, field.state);
    await new Promise((resolve) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0));
    if (this.config.scroll !== "none" && typeof control.scrollIntoView === "function") {
      const behavior = this.config.scroll === "smooth" && !prefersReducedMotion() ? "smooth" : "auto";
      control.scrollIntoView({ block: "center", behavior });
    }
    if (typeof control.focus === "function") control.focus({ preventScroll: true });
  }
  focusFirstInvalid() {
    if (this.config.focus === "none") return;
    const first = this.orderedFields().find((f) => f.state.errors.length && f.kind !== "hidden" && !f.disabled);
    if (first) this.focusField(first);
    else this.ui.focusSummary();
  }
  /* ------------------------------------------------------------------ API de valores */
  getValue(name, { as = "canonical" } = {}) {
    const field = this.resolveField(name);
    if (!field) throw new ConfigError(`Campo "${name}" n\xE3o encontrado neste formul\xE1rio.`);
    return field.getValue(as);
  }
  getValues({ as = "submit", format = "object", submitter = null } = {}) {
    if (format === "entries") return collectEntries(this, { as, submitter }).map((e) => [e.name, e.value]);
    if (format !== "object") throw new ConfigError('getValues: format deve ser "object" ou "entries".');
    const out = {};
    for (const field of this.orderedFields()) {
      if (field.disabled) continue;
      const value = field.kind === "file" ? field.files.newItems().map((i) => i.file) : field.getValue(as);
      if (Object.prototype.hasOwnProperty.call(out, field.name)) out[field.name] = [].concat(out[field.name], value);
      else out[field.name] = value;
    }
    return out;
  }
  setValue(name, value, { as = "display", touch = false, validate = null, silent = false } = {}) {
    const field = this.resolveField(name);
    if (!field) throw new ConfigError(`Campo "${name}" n\xE3o encontrado neste formul\xE1rio.`);
    field.setValue(value, as);
    if (touch) field.state.touched = true;
    this.handleValueChange(field, "api", { silent });
    if (validate === true || validate !== false && field.state.validated) this.validateField(field, { trigger: "api", remoteDebounce: false });
    return field.getValue("display");
  }
  addFiles(name, files) {
    const field = this.resolveField(name);
    if (!field || field.kind !== "file") throw new ConfigError(`Campo de arquivo "${name?.name ?? name}" n\xE3o encontrado.`);
    field.files.add(files);
    this.renderFiles(field);
    this.handleValueChange(field, "change");
    return field.state.files;
  }
  removeFile(name, id) {
    const field = this.resolveField(name);
    if (!field || field.kind !== "file") throw new ConfigError(`Campo de arquivo "${name?.name ?? name}" n\xE3o encontrado.`);
    const removed = field.files.remove(id);
    if (removed) {
      this.renderFiles(field);
      this.handleValueChange(field, "change");
    }
    return removed;
  }
  removeExisting(name, id, removed) {
    const field = this.resolveField(name);
    if (!field || field.kind !== "file") throw new ConfigError(`Campo de arquivo "${name}" n\xE3o encontrado.`);
    const changed = field.files.toggleExisting(id, removed);
    if (changed) {
      this.renderFiles(field);
      this.handleValueChange(field, "change");
    }
    return changed;
  }
  clearRemoteCache(name) {
    if (name) this.resolveField(name)?.remote?.clearCache();
    else for (const field of this.fields.values()) field.remote?.clearCache();
  }
  /* ------------------------------------------------------------------ erros */
  resolveErrorTarget(rawKey) {
    const key = normalizeErrorKey(rawKey);
    const direct = this.fields.get(key) || this.resolveField(rawKey);
    if (direct) return { field: direct };
    const match = /^(.*)\.(\d+)$/.exec(key);
    if (match) {
      const parent = this.fields.get(match[1]);
      if (parent?.kind === "file") return { field: parent, fileIndex: Number(match[2]) };
      if (parent && (parent.kind === "checkbox-group" || parent.kind === "select-multiple")) return { field: parent };
    }
    return null;
  }
  /**
   * Aplica erros vindos do servidor. Com `snapshot`, erros de campos cujo valor mudou desde o envio
   * são descartados (não se aplica resposta antiga a valor novo).
   */
  applyServerErrors(errors, { general = [], snapshot = null, fileOrder = null } = {}) {
    const generalErrors = [...general];
    const touchedFields = /* @__PURE__ */ new Set();
    for (const [rawKey, messages] of Object.entries(errors || {})) {
      const target = this.resolveErrorTarget(rawKey);
      if (!target) {
        generalErrors.push(...messages);
        continue;
      }
      const field = target.field;
      if (snapshot && snapshot.has(field) && snapshot.get(field) !== JSON.stringify(field.comparableValue())) continue;
      if (target.fileIndex != null) {
        const ids = fileOrder?.get(field) || field.files.items.map((i) => i.id);
        const item = field.files.items.find((i) => i.id === ids[target.fileIndex]);
        const label = item ? item.name : `#${target.fileIndex + 1}`;
        if (item) item.errors = [...item.errors, ...messages];
        field.state.serverErrors = [...field.state.serverErrors, ...messages.map((m) => `${label}: ${m}`)];
        this.renderFiles(field);
      } else {
        field.state.serverErrors = [...field.state.serverErrors, ...messages];
        if (field.remote) field.remote.invalidate(field.validationValue(), this.remoteExtras(field));
      }
      touchedFields.add(field);
    }
    for (const field of touchedFields) {
      field.state.touched = true;
      this.composeErrors(field);
      this.renderField(field);
    }
    this.state.generalErrors = [...this.state.generalErrors, ...generalErrors];
    this.renderSummary();
    return { fields: Array.from(touchedFields).map((f) => f.key), general: generalErrors };
  }
  setErrors(errors, { general = [], replace = true } = {}) {
    if (!isPlainObject(errors) && !Array.isArray(errors)) throw new ConfigError("setErrors espera um objeto { campo: mensagens }.");
    if (replace) this.clearServerErrors();
    const list = Array.isArray(errors) ? { _general: errors } : errors;
    const normalized = /* @__PURE__ */ Object.create(null);
    const extraGeneral = [...general];
    for (const [key, value] of Object.entries(list)) {
      const messages = (Array.isArray(value) ? value : [value]).filter((m) => typeof m === "string" && m);
      if (["", "_", "_general", "*"].includes(key)) extraGeneral.push(...messages);
      else normalized[key] = messages;
    }
    return this.applyServerErrors(normalized, { general: extraGeneral });
  }
  clearServerErrors() {
    for (const field of this.fields.values()) {
      if (!field.state.serverErrors.length) continue;
      field.state.serverErrors = [];
      if (field.files) for (const item of field.files.items) item.errors = [];
      this.composeErrors(field);
      this.renderField(field);
      if (field.files) this.renderFiles(field);
    }
    this.state.generalErrors = [];
  }
  clearErrors(name) {
    if (name != null) {
      const field = this.resolveField(name);
      if (!field) throw new ConfigError(`Campo "${name}" n\xE3o encontrado neste formul\xE1rio.`);
      field.runToken += 1;
      field.abort?.abort();
      field.state.localErrors = [];
      field.state.serverErrors = [];
      field.state.validated = false;
      field.state.validating = false;
      field.state.remote = "idle";
      if (field.files) for (const item of field.files.items) item.errors = [];
      this.composeErrors(field);
      this.renderField(field);
      if (field.files) this.renderFiles(field);
      this.renderSummary();
      return;
    }
    for (const field of this.fields.values()) {
      if (field.configError) continue;
      this.clearErrors(field);
    }
    this.state.generalErrors = [];
    this.state.error = null;
    this.renderSummary();
    this.updateAggregate();
  }
  resetValidation() {
    this.clearErrors();
    for (const field of this.fields.values()) {
      field.state.touched = false;
      field.state.valid = false;
      field.state.invalid = false;
    }
    this.state.submitted = false;
    this.renderSummary();
  }
  /* ------------------------------------------------------------------ envio */
  onSubmit(event) {
    if (this.allowNativeOnce) {
      this.allowNativeOnce = false;
      return;
    }
    event.preventDefault();
    if (this.destroyed) return;
    this.submit({ submitter: event.submitter || null }).catch((error) => this.log("error", error));
  }
  securityHeaders(url) {
    if (url && isCrossOrigin(url)) return {};
    const headers = {};
    const csrf = this.config.csrf;
    if (csrf && csrf.meta && csrf.header) {
      const meta = document.querySelector(`meta[name="${csrf.meta}"]`);
      const token = meta?.getAttribute("content");
      if (token) headers[csrf.header] = token;
    }
    return headers;
  }
  resolveTarget(submitter) {
    const form = this.form;
    const attrOf = (name) => submitter && submitter.hasAttribute(name) ? submitter.getAttribute(name) : null;
    const rawAction = attrOf("formaction") ?? this.config.endpoint ?? form.getAttribute("action") ?? "";
    const url = new URL(rawAction || globalThis.location.href, globalThis.location.href);
    const method = (attrOf("formmethod") || this.config.method || form.getAttribute("method") || "get").toLowerCase();
    let encoding = this.config.encoding;
    const enctype = attrOf("formenctype") || (this.form.hasAttribute("data-form-encoding") ? null : form.getAttribute("enctype"));
    if (enctype === "application/x-www-form-urlencoded") encoding = "urlencoded";
    else if (enctype === "multipart/form-data") encoding = "multipart";
    if (!["get", "post", "put", "patch", "delete"].includes(method)) throw new ConfigError(`M\xE9todo HTTP "${method}" n\xE3o suportado.`);
    return { url, method, encoding, noValidate: !!submitter?.hasAttribute("formnovalidate") };
  }
  buildRequestBody(entries, target) {
    if (target.method === "get") {
      const params = toUrlSearchParams(entries);
      const url = new URL(target.url.href);
      url.search = params.toString();
      return { url: url.href, body: null, headers: {} };
    }
    if (target.encoding === "json") {
      const object = toJsonObject(entries, { nesting: this.config.nesting, jsonFiles: this.config.jsonFiles });
      return { url: target.url.href, body: JSON.stringify(object), headers: { "Content-Type": "application/json" } };
    }
    if (target.encoding === "urlencoded") {
      return { url: target.url.href, body: toUrlSearchParams(entries).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } };
    }
    return { url: target.url.href, body: toFormData(entries), headers: {} };
  }
  /** Transporte por finalidade: submit usa data-form-transport; remote/job/chunk usam um transporte registrado com esse nome, se houver. */
  transportFor(purpose) {
    let name;
    if (purpose === "submit") name = this.config.transport;
    else if (has("transport", purpose)) name = purpose;
    else name = purpose === "chunk" ? "xhr" : "fetch";
    const transport = get("transport", name);
    if (!transport) throw new ConfigError(`Transporte "${name}" n\xE3o registrado.`);
    return transport;
  }
  idempotencyKey(fingerprint) {
    if (!this.config.idempotency) return null;
    if (this.idempotency && this.idempotency.fingerprint === fingerprint && this.idempotency.reusable) return this.idempotency.key;
    this.idempotency = { key: randomId(16), fingerprint, reusable: false };
    return this.idempotency.key;
  }
  submit({ submitter = null } = {}) {
    if (this.destroyed) return Promise.reject(new StateError("Formul\xE1rio destru\xEDdo."));
    if (this.submission) return this.submission.promise;
    const submission = { controller: new AbortController(), promise: null };
    this.submission = submission;
    submission.promise = this.runSubmit(submitter, submission).finally(() => {
      if (this.submission === submission) this.submission = null;
    });
    return submission.promise;
  }
  async runSubmit(submitter, submission) {
    const signal = submission.controller.signal;
    const state = this.state;
    state.submitted = true;
    state.submitCount += 1;
    state.error = null;
    state.result = null;
    state.job = null;
    this.state.progress = emptyProgress();
    if (!dispatch(this.form, EVENTS.beforeSubmit, { submitter })) return this.endSubmit({ ok: false, reason: "prevented" }, "idle");
    if (await this.config.hooks.beforeSubmit?.(this.state, { submitter }) === false) return this.endSubmit({ ok: false, reason: "prevented" }, "idle");
    let target;
    try {
      target = this.resolveTarget(submitter);
    } catch (error) {
      return this.failSubmit("config", error.message, { error });
    }
    this.clearServerErrors();
    this.renderSummary();
    this.setPhase("validating");
    if (!target.noValidate) {
      const validation = await this.validateForSubmit();
      if (signal.aborted) return this.endSubmit({ ok: false, reason: "canceled" }, "canceled");
      if (validation.changed) return this.failSubmit("changed", this.formMessage("submit.changed"));
      if (!validation.valid) {
        this.setPhase("idle");
        this.renderSummary();
        this.focusFirstInvalid();
        return { ok: false, reason: "invalid", errors: validation.errors };
      }
    }
    if (this.state.configErrors.length) return this.failSubmit("config", this.formMessage("submit.config"));
    if (this.config.transport === "native") return this.nativeSubmit(submitter);
    const snapshot = this.valueSnapshot();
    const fileOrder = /* @__PURE__ */ new Map();
    for (const field of this.fields.values()) if (field.files) fileOrder.set(field, field.files.items.map((i) => i.id));
    const replacements = /* @__PURE__ */ new Map();
    const sendContext = {
      signal,
      replacements,
      controller: this,
      setPhase: (phase) => this.setPhase(phase),
      setProgress: (progress) => {
        this.state.progress = progress;
        this.renderProgress();
        dispatch(this.form, EVENTS.progress, { ...progress, phase: this.state.phase });
      }
    };
    try {
      for (const extension of this.extensions) {
        if (extension.beforeSend) await extension.beforeSend(sendContext);
      }
    } catch (error) {
      if (isAbort(error) || signal.aborted) return this.endSubmit({ ok: false, reason: "canceled" }, "canceled");
      return this.failSubmit(error.kind || "upload", error.message, { error });
    }
    let request;
    try {
      const entries = collectEntries(this, { submitter, replacements });
      const built = this.buildRequestBody(entries, target);
      const fingerprint = JSON.stringify(entriesSnapshot(entries));
      const headers = {
        Accept: "application/json, text/plain;q=0.5, */*;q=0.1",
        "X-Requested-With": "XMLHttpRequest",
        ...this.config.headers,
        ...this.securityHeaders(built.url),
        ...built.headers
      };
      const key = this.idempotencyKey(fingerprint);
      if (key) headers["Idempotency-Key"] = key;
      request = {
        url: built.url,
        method: target.method.toUpperCase(),
        headers,
        body: built.body,
        credentials: this.config.credentials,
        timeout: this.config.timeout,
        signal,
        onUploadProgress: (progress) => this.onUploadProgress(progress),
        onUploadComplete: () => this.onUploadComplete()
      };
    } catch (error) {
      if (isSerializationError(error)) return this.failSubmit("serialization", error.message, { error });
      if (isConfigError(error)) return this.failSubmit("config", error.message, { error });
      throw error;
    }
    if (!dispatch(this.form, EVENTS.submit, { request: { url: request.url, method: request.method, headers: request.headers }, submitter })) {
      return this.endSubmit({ ok: false, reason: "prevented" }, "idle");
    }
    await this.config.hooks.beforeRequest?.(request, this.state);
    this.keepProgress = !!sendContext.keepProgress;
    if (!this.keepProgress) {
      this.tracker.start();
      this.state.progress = this.tracker.snapshot();
    }
    this.setPhase("uploading");
    let raw;
    try {
      raw = await this.transportFor("submit")(request);
    } catch (error) {
      return this.handleTransportError(error, request);
    }
    if (this.state.phase === "uploading") this.onUploadComplete();
    const adapterName = this.config.responseAdapter;
    const adapter = get("responseAdapter", adapterName);
    if (!adapter) return this.failSubmit("config", `Adaptador de resposta "${adapterName}" n\xE3o registrado.`);
    let result;
    try {
      result = adapter(raw, { form: this.form, request });
    } catch (error) {
      return this.failSubmit("parse", this.formMessage("submit.parse"), { error });
    }
    await this.config.hooks.afterResponse?.(result, this.state);
    if (this.idempotency) this.idempotency.reusable = ["server", "rate_limited"].includes(result.kind);
    return this.handleResult(result, { snapshot, fileOrder, signal });
  }
  nativeSubmit(submitter) {
    this.setPhase("idle");
    this.allowNativeOnce = true;
    formRequestSubmit(this.form, submitter && submitter.form === this.form ? submitter : null);
    return { ok: true, native: true };
  }
  onUploadProgress(progress) {
    if (this.state.phase !== "uploading" || this.keepProgress) return;
    this.tracker.update(progress);
    this.state.progress = this.tracker.snapshot();
    this.renderProgress();
    dispatch(this.form, EVENTS.progress, { ...this.state.progress, phase: "uploading" });
  }
  onUploadComplete() {
    if (this.state.phase !== "uploading") return;
    this.tracker.markUploaded();
    this.state.progress = this.tracker.snapshot();
    this.setPhase("awaiting");
    dispatch(this.form, EVENTS.uploaded, { ...this.state.progress });
  }
  handleTransportError(error, request) {
    if (isAbort(error)) return this.endSubmit({ ok: false, reason: "canceled" }, "canceled");
    const uploadComplete = !!error.details?.uploadComplete;
    if (this.idempotency) this.idempotency.reusable = true;
    if (error.kind === "timeout") {
      const message2 = uploadComplete ? this.formMessage("submit.unknown") : this.formMessage("submit.timeout");
      return this.failSubmit(uploadComplete ? "unknown" : "timeout", message2, { error });
    }
    if (uploadComplete) return this.failSubmit("unknown", this.formMessage("submit.unknown"), { error });
    const message = error.details?.crossOrigin ? this.formMessage("submit.cors") : this.formMessage("submit.network");
    return this.failSubmit("network", message, { error, url: request.url });
  }
  async handleResult(result, { snapshot, fileOrder, signal }) {
    this.state.result = { status: result.status, kind: result.kind, message: result.message, data: result.data, requestId: result.requestId };
    if (result.kind === "accepted" && result.job) return this.runJob(result.job, signal, result);
    if (result.ok) return this.succeed(result);
    const applied = this.applyServerErrors(result.errors, { general: result.generalErrors, snapshot, fileOrder });
    const kind = result.kind || "http";
    let message = result.message;
    if (kind === "html") {
      message = this.formMessage("submit.html");
      const { snippet, ...semConteudo } = result.diagnostic || {};
      this.log("error", "Resposta HTML inesperada (o trecho da resposta fica em $form.error.diagnostic):", semConteudo);
    } else if (!message) {
      const key = {
        validation: "submit.validation",
        logical: "submit.logical",
        auth: "submit.auth",
        forbidden: "submit.forbidden",
        csrf: "submit.csrf",
        too_large: "submit.too_large",
        rate_limited: "submit.rate_limited",
        server: "submit.server",
        parse: "submit.parse"
      }[kind] || "submit.http";
      message = this.formMessage(key, { status: result.status });
    }
    if (result.requestId) this.log("warn", `request_id: ${result.requestId}`);
    const onlyFieldErrors = applied.fields.length > 0 && kind === "validation" && !result.message;
    if (!onlyFieldErrors && !this.state.generalErrors.includes(message)) {
      this.state.generalErrors = [message, ...this.state.generalErrors];
      this.renderSummary();
    }
    return this.failSubmit(kind, message, { result, focus: true });
  }
  async runJob(job, signal, result) {
    const statusUrl = job.statusUrl && !isCrossOrigin(job.statusUrl) ? job.statusUrl : this.config.jobUrl ? this.config.jobUrl.replace("{id}", encodeURIComponent(job.id)) : null;
    if (!statusUrl) return this.failSubmit("config", "Resposta 202 sem status_url e sem data-form-job-url configurado.");
    const cancelUrl = job.cancelUrl && !isCrossOrigin(job.cancelUrl) ? job.cancelUrl : this.config.jobCancelUrl ? this.config.jobCancelUrl.replace("{id}", encodeURIComponent(job.id)) : null;
    this.state.job = { id: job.id, status: "queued", progress: null, message: result?.message ?? null, statusUrl, cancelUrl };
    if (this.config.jobPersist && this.storageAllowed) saveJob(this.form, { id: job.id, statusUrl });
    this.setPhase("processing");
    dispatch(this.form, EVENTS.processing, { job: { ...this.state.job } });
    const poller = new JobPoller({
      job,
      url: statusUrl,
      transport: this.transportFor("job"),
      headers: this.securityHeaders(statusUrl),
      credentials: this.config.credentials,
      interval: this.config.jobInterval,
      maxInterval: this.config.jobMaxInterval,
      timeout: this.config.jobTimeout,
      onUpdate: (update) => {
        this.state.job = { ...this.state.job, status: update.status, progress: update.progress, message: update.message };
        this.renderProgress();
        dispatch(this.form, EVENTS.processing, { job: { ...this.state.job } });
      }
    });
    this.poller = poller;
    const onAbort = () => poller.stop();
    signal?.addEventListener("abort", onAbort, { once: true });
    let final;
    try {
      final = await poller.run();
    } catch (error) {
      if (isAbort(error)) return this.endSubmit({ ok: false, reason: "canceled", job: this.state.job }, "canceled", this.formMessage("status.observation_stopped"));
      if (error.kind !== "job-timeout") clearJob(this.form);
      const message2 = error.kind === "job-timeout" ? this.formMessage("job.timeout") : error.message;
      return this.failSubmit(error.kind || "job", message2, { error });
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (this.poller === poller) this.poller = null;
    }
    clearJob(this.form);
    if (final.status === "succeeded") {
      return this.succeed({ ok: true, status: 200, kind: "success", message: final.message, data: final.result, job: final, redirect: final.result?.redirect ?? null });
    }
    const message = final.status === "canceled" ? this.formMessage("job.canceled") : final.error?.message || final.message || this.formMessage("job.failed");
    return this.failSubmit(final.status === "canceled" ? "job-canceled" : "job-failed", message, { result: final });
  }
  resumePersistedJob() {
    if (!this.config.jobPersist || !this.storageAllowed) return;
    const saved = loadJob(this.form);
    if (!saved || this.submission) return;
    const submission = { controller: new AbortController(), promise: null };
    this.submission = submission;
    submission.promise = this.runJob({ id: saved.id, statusUrl: saved.statusUrl }, submission.controller.signal, null).catch((error) => this.log("error", error)).finally(() => {
      if (this.submission === submission) this.submission = null;
    });
  }
  async cancelJob() {
    const job = this.state.job;
    if (!job || !job.cancelUrl) throw new StateError("Nenhum processamento cancel\xE1vel em andamento (o backend n\xE3o informou cancel_url).");
    const raw = await this.transportFor("job")({ url: job.cancelUrl, method: "DELETE", headers: { Accept: "application/json", ...this.securityHeaders(job.cancelUrl) }, credentials: this.config.credentials, timeout: 15e3 });
    if (raw.status < 200 || raw.status >= 300) throw new OperationalError(`O servidor recusou o cancelamento (HTTP ${raw.status}).`, { kind: "job-cancel", status: raw.status });
    return true;
  }
  succeed(result) {
    this.state.result = { status: result.status, kind: result.kind, message: result.message, data: result.data, requestId: result.requestId ?? null, job: result.job ?? null };
    this.state.error = null;
    this.setPhase("success");
    dispatch(this.form, EVENTS.success, { result: this.state.result });
    if (this.config.resetOnSuccess) this.reset({ keepPhase: true });
    if (this.config.redirect === "response" && result.redirect) this.safeRedirect(result.redirect);
    return { ok: true, result: this.state.result };
  }
  safeRedirect(target) {
    let url;
    try {
      url = new URL(String(target), globalThis.location.href);
    } catch {
      this.log("warn", "Redirecionamento ignorado: URL inv\xE1lida.", target);
      return false;
    }
    const allowed = (url.protocol === "http:" || url.protocol === "https:") && (url.origin === globalThis.location.origin || this.config.redirectOrigins.includes(url.origin));
    if (!allowed) {
      this.log("warn", "Redirecionamento ignorado: origem n\xE3o permitida.", url.origin);
      return false;
    }
    globalThis.location.assign(url.href);
    return true;
  }
  failSubmit(kind, message, { error = null, result = null, focus = false } = {}) {
    this.state.error = { kind, message, status: result?.status ?? null, requestId: result?.requestId ?? null, diagnostic: result?.diagnostic ?? null };
    if (error && !isConfigError(error) && !isAbort(error)) this.log("error", error);
    if (kind === "config") this.log("error", message);
    const generalKinds = /* @__PURE__ */ new Set(["network", "timeout", "unknown", "config", "serialization", "changed", "job", "job-failed", "job-canceled", "job-timeout", "job-missing", "job-http", "job-contract", "upload", "upload-failed"]);
    if (generalKinds.has(kind) && !this.state.generalErrors.includes(message)) {
      this.state.generalErrors = [...this.state.generalErrors, message];
    }
    this.setPhase("error");
    this.renderSummary();
    dispatch(this.form, EVENTS.error, { error: { ...this.state.error }, result: result ? { status: result.status, kind: result.kind, errors: result.errors } : null });
    if (focus || generalKinds.has(kind)) this.focusFirstInvalid();
    return { ok: false, reason: kind, error: this.state.error };
  }
  endSubmit(outcome, phase, message = null) {
    if (phase === "canceled") {
      this.state.error = { kind: "canceled", message: message || this.formMessage("status.canceled") };
      this.setPhase("canceled");
      dispatch(this.form, EVENTS.cancel, { reason: outcome.reason, job: outcome.job ?? null });
    } else {
      this.setPhase(phase);
    }
    return outcome;
  }
  /** Cancela validação/upload/espera em andamento. Durante processamento, encerra apenas a observação. */
  cancel() {
    let canceled = false;
    if (this.submission) {
      this.submission.controller.abort(new AbortError());
      canceled = true;
    }
    if (this.poller) {
      this.poller.stop();
      canceled = true;
    }
    for (const extension of this.extensions) if (extension.cancel?.()) canceled = true;
    return canceled;
  }
  async callExtension(method, name) {
    return this.callExtensionSync(method, name);
  }
  /** Variante síncrona para consultas (ex.: getUploadSession), que não devem devolver Promise. */
  callExtensionSync(method, name) {
    for (const extension of this.extensions) {
      if (typeof extension[method] === "function") return extension[method](name);
    }
    throw new StateError(`${method}() requer o m\xF3dulo de chunks (alpine-form-chunks).`);
  }
  /* ------------------------------------------------------------------ reset e destroy */
  onNativeReset(event) {
    if (this.internalReset) return;
    if (!dispatch(this.form, EVENTS.reset, { source: "native" })) {
      event.preventDefault();
      return;
    }
    this.cancel();
    setTimeout(() => this.afterReset(), 0);
  }
  reset({ keepPhase = false } = {}) {
    if (this.destroyed) return false;
    if (!keepPhase && !dispatch(this.form, EVENTS.reset, { source: "api" })) return false;
    if (!keepPhase) this.cancel();
    this.internalReset = true;
    try {
      formReset(this.form);
    } finally {
      this.internalReset = false;
    }
    this.afterReset({ keepPhase });
    return true;
  }
  afterReset({ keepPhase = false } = {}) {
    if (this.destroyed) return;
    for (const field of this.fields.values()) {
      field.debouncer.cancel();
      field.abort?.abort();
      field.runToken += 1;
      field.files?.reset();
      field.mask?.afterReset?.();
      field.state.touched = false;
      field.state.validated = false;
      field.state.validating = false;
      field.state.localErrors = field.configError ? [this.message(field, "__config")] : [];
      field.state.serverErrors = [];
      field.state.remote = "idle";
      if (field.kind === "hidden" && typeof field.initialDisplay === "string" && field.readDisplay() !== field.initialDisplay) {
        field.setValue(field.initialDisplay, "display");
      }
      this.syncFieldValue(field);
      this.composeErrors(field);
      this.renderField(field);
      if (field.files) this.renderFiles(field);
    }
    this.state.generalErrors = [];
    this.state.submitted = false;
    this.state.error = null;
    if (!keepPhase) {
      this.state.result = null;
      this.state.job = null;
      this.state.progress = emptyProgress();
      this.setPhase("idle");
    }
    this.renderSummary();
    this.updateAggregate();
  }
  destroy() {
    if (this.destroyed) return;
    this.cancel();
    this.destroyed = true;
    clearTimeout(this.pendingRefresh);
    this.observer?.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.externalUiCleanup?.();
    for (const field of Array.from(this.fields.values())) {
      field.unsubscribe?.();
      field.debouncer?.cancel();
      field.abort?.abort();
      field.mask?.destroy?.();
      field.files?.destroy();
      this.ui.removeField(field);
      this.externalCleanups.get(field)?.();
    }
    this.externalCleanups.clear();
    for (const extension of this.extensions) extension.destroy?.();
    this.ui.destroy();
    this.progressUi.destroy();
    this.form.removeAttribute("aria-busy");
    this.form.removeAttribute("data-form-state");
    controllers.delete(this.form);
    this.fields.clear();
    this.controlIndex.clear();
    dispatch(this.form, EVENTS.destroy, {});
  }
};
function valuesEqualList(a, b) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

// src/validators/text.js
function measure(value, field) {
  if (Array.isArray(value)) return { mode: "array", size: value.length };
  if (field.numeric) return { mode: "numeric", size: String(value).trim() };
  return { mode: "text", size: textLength(value) };
}
function bound(op, key) {
  return {
    params: [{ name: key, type: "number" }],
    validate(value, ctx) {
      if (ctx.field.kind === "file") return ctx.configError(`Use files_${key} ou file_${key} em campos de arquivo, n\xE3o "${key}".`);
      const { mode, size } = measure(value, ctx.field);
      const limit = ctx.params[key];
      const vars = { [key]: limit };
      if (mode === "numeric") {
        const cmp2 = compareDecimal(size, limit);
        if (cmp2 === null) return { valid: false, rule: "numeric" };
        return op(cmp2) ? true : { valid: false, variant: "numeric", vars };
      }
      const cmp = compareDecimal(String(size), limit);
      return op(cmp) ? true : { valid: false, variant: mode === "array" ? "array" : null, vars };
    }
  };
}
var EMAIL_STRICT = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
var EMAIL_LOOSE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var LETTERS = /^[\p{L}\p{M}]+$/u;
var LETTERS_SPACES = /^[\p{L}\p{M}][\p{L}\p{M} '-]*$/u;
var ALNUM = /^[\p{L}\p{M}\p{Nd}]+$/u;
var ALNUM_SPACES = /^[\p{L}\p{M}\p{Nd}][\p{L}\p{M}\p{Nd} '-]*$/u;
var textOnly = (fn) => (value, ctx) => Array.isArray(value) || typeof value === "object" ? ctx.configError(`A regra "${ctx.rule.name}" se aplica a texto.`) : fn(String(value), ctx);
function listVars(values) {
  return { allowed: values.join(", ") };
}
var text_default = {
  min: bound((cmp) => cmp >= 0, "min"),
  max: bound((cmp) => cmp <= 0, "max"),
  between: {
    params: [{ name: "min", type: "number" }, { name: "max", type: "number" }],
    validate(value, ctx) {
      if (ctx.field.kind === "file") return ctx.configError("Use files_min/files_max em campos de arquivo.");
      const { mode, size } = measure(value, ctx.field);
      const { min, max } = ctx.params;
      const vars = { min, max };
      const lo = compareDecimal(String(size), min);
      const hi = compareDecimal(String(size), max);
      if (lo === null || hi === null) return { valid: false, rule: "numeric" };
      return lo >= 0 && hi <= 0 ? true : { valid: false, variant: mode === "text" ? null : mode, vars };
    }
  },
  length: {
    params: [{ name: "length", type: "integer" }],
    validate(value, ctx) {
      const size = Array.isArray(value) ? value.length : textLength(value);
      return size === ctx.params.length ? true : { valid: false, variant: Array.isArray(value) ? "array" : null, vars: { length: ctx.params.length } };
    }
  },
  min_length: {
    params: [{ name: "min", type: "integer" }],
    validate: textOnly((value, ctx) => textLength(value) >= ctx.params.min || { valid: false, vars: { min: ctx.params.min } })
  },
  max_length: {
    params: [{ name: "max", type: "integer" }],
    validate: textOnly((value, ctx) => textLength(value) <= ctx.params.max || { valid: false, vars: { max: ctx.params.max } })
  },
  email: {
    params: [{ name: "mode", type: "enum", values: ["strict", "loose"], optional: true }],
    validate: textOnly((value, ctx) => {
      const text2 = value.trim();
      if (text2.length > 254) return false;
      return (ctx.params.mode === "loose" ? EMAIL_LOOSE : EMAIL_STRICT).test(text2);
    })
  },
  url: {
    params: [],
    rest: { name: "schemes", type: "string" },
    validate: textOnly((value, ctx) => {
      const schemes = ctx.params.schemes?.length ? ctx.params.schemes : ["http", "https"];
      let url;
      try {
        url = new URL(value.trim());
      } catch {
        return false;
      }
      if (!schemes.includes(url.protocol.replace(/:$/, ""))) return false;
      return schemes.some((s) => s !== "http" && s !== "https") || url.hostname.length > 0;
    })
  },
  pattern: {
    validate: textOnly((value, ctx) => {
      const regex = ctx.pattern();
      if (value.length > ctx.config.patternMaxInput) return false;
      regex.lastIndex = 0;
      return regex.test(value);
    })
  },
  alpha: {
    params: [{ name: "mode", type: "enum", values: ["spaces"], optional: true }],
    validate: textOnly((value, ctx) => (ctx.params.mode === "spaces" ? LETTERS_SPACES : LETTERS).test(value.trim()))
  },
  alphanumeric: {
    params: [{ name: "mode", type: "enum", values: ["spaces"], optional: true }],
    validate: textOnly((value, ctx) => (ctx.params.mode === "spaces" ? ALNUM_SPACES : ALNUM).test(value.trim()))
  },
  digits: {
    params: [{ name: "length", type: "integer", optional: true }],
    validate: textOnly((value, ctx) => {
      if (!/^[0-9]+$/.test(value)) return false;
      if (ctx.params.length != null && value.length !== ctx.params.length) return { valid: false, variant: "length", vars: { length: ctx.params.length } };
      return true;
    })
  },
  starts_with: {
    rest: { name: "values", type: "string", min: 1 },
    validate: textOnly((value, ctx) => ctx.params.values.some((v) => value.startsWith(v)) || { valid: false, vars: listVars(ctx.params.values) })
  },
  ends_with: {
    rest: { name: "values", type: "string", min: 1 },
    validate: textOnly((value, ctx) => ctx.params.values.some((v) => value.endsWith(v)) || { valid: false, vars: listVars(ctx.params.values) })
  },
  contains: {
    rest: { name: "values", type: "string", min: 1 },
    validate: textOnly((value, ctx) => ctx.params.values.every((v) => value.includes(v)) || { valid: false, vars: listVars(ctx.params.values) })
  },
  in: {
    rest: { name: "values", type: "string", min: 1 },
    validate(value, ctx) {
      const items2 = toArray(value).map(String);
      return items2.every((v) => ctx.params.values.includes(v)) || { valid: false, vars: listVars(ctx.params.values) };
    }
  },
  not_in: {
    rest: { name: "values", type: "string", min: 1 },
    validate(value, ctx) {
      const items2 = toArray(value).map(String);
      return items2.every((v) => !ctx.params.values.includes(v)) || { valid: false, vars: listVars(ctx.params.values) };
    }
  }
};

// src/validators/numbers.js
var asText = (value) => typeof value === "number" ? String(value) : String(value ?? "").trim();
var isNumeric = (value) => parseDecimal(asText(value)) !== null;
function numeric(fn) {
  return (value, ctx) => {
    const text2 = asText(value);
    if (!isNumeric(text2)) return { valid: false, rule: "numeric" };
    return fn(text2, ctx);
  };
}
var numbers_default = {
  numeric: { validate: (value) => isNumeric(value) },
  integer: { validate: (value) => /^[+-]?\d+$/.test(asText(value)) },
  decimal: {
    params: [{ name: "a", type: "integer" }, { name: "b", type: "integer", optional: true }],
    validate: numeric((text2, ctx) => {
      const scale = decimalScale(text2);
      const { a, b } = ctx.params;
      if (b == null) return scale <= a || { valid: false, vars: { max: a } };
      return scale >= a && scale <= b || { valid: false, variant: "range", vars: { min: a, max: b } };
    })
  },
  positive: { validate: numeric((text2) => compareDecimal(text2, "0") > 0) },
  negative: { validate: numeric((text2) => compareDecimal(text2, "0") < 0) },
  min_value: {
    params: [{ name: "min", type: "number" }],
    validate: numeric((text2, ctx) => compareDecimal(text2, ctx.params.min) >= 0 || { valid: false, vars: { min: ctx.params.min } })
  },
  max_value: {
    params: [{ name: "max", type: "number" }],
    validate: numeric((text2, ctx) => compareDecimal(text2, ctx.params.max) <= 0 || { valid: false, vars: { max: ctx.params.max } })
  },
  multiple_of: {
    params: [{ name: "step", type: "number" }],
    validate: numeric((text2, ctx) => {
      const result = isMultipleOf(text2, ctx.params.step);
      if (result === null) return ctx.configError("multiple_of exige passo diferente de zero.");
      return result || { valid: false, vars: { step: ctx.params.step } };
    })
  }
};

// src/lib/date.js
var DATE_KINDS = ["date", "datetime", "time", "month", "week"];
var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
var BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
var ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
var BR_DATETIME = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
var TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
var MONTH_ISO = /^(\d{4})-(\d{2})$/;
var MONTH_BR = /^(\d{2})\/(\d{4})$/;
var WEEK = /^(\d{4})-W(\d{2})$/;
function isLeapYear(year) {
  return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
}
function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function validYmd(y, m, d) {
  return y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}
function validHms(h, mi, s) {
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;
}
function isoWeeksInYear(year) {
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  return jan1 === 4 || jan1 === 3 && isLeapYear(year) ? 53 : 52;
}
function make(kind, parts, key) {
  return { kind, ...parts, key };
}
function parseDate(text2, format = "iso") {
  const m = format === "br" ? BR_DATE.exec(text2) : ISO_DATE.exec(text2);
  if (!m) return null;
  const [y, mo, d] = format === "br" ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]];
  if (!validYmd(y, mo, d)) return null;
  return make("date", { y, m: mo, d }, y * 1e4 + mo * 100 + d);
}
function parseDateTime(text2, format = "iso") {
  const m = format === "br" ? BR_DATETIME.exec(text2) : ISO_DATETIME.exec(text2);
  if (!m) return null;
  const [y, mo, d] = format === "br" ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]];
  const h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (!validYmd(y, mo, d) || !validHms(h, mi, s)) return null;
  return make("datetime", { y, m: mo, d, h, mi, s }, (y * 1e4 + mo * 100 + d) * 1e6 + h * 1e4 + mi * 100 + s);
}
function parseTime(text2) {
  const m = TIME.exec(text2);
  if (!m) return null;
  const h = +m[1], mi = +m[2], s = +(m[3] || 0);
  if (!validHms(h, mi, s)) return null;
  return make("time", { h, mi, s }, h * 3600 + mi * 60 + s);
}
function parseMonth(text2, format = "iso") {
  const m = format === "br" ? MONTH_BR.exec(text2) : MONTH_ISO.exec(text2);
  if (!m) return null;
  const [y, mo] = format === "br" ? [+m[2], +m[1]] : [+m[1], +m[2]];
  if (y < 1 || y > 9999 || mo < 1 || mo > 12) return null;
  return make("month", { y, m: mo }, y * 100 + mo);
}
function parseWeek(text2) {
  const m = WEEK.exec(text2);
  if (!m) return null;
  const y = +m[1], w = +m[2];
  if (y < 1 || w < 1 || w > isoWeeksInYear(y)) return null;
  return make("week", { y, w }, y * 100 + w);
}
function parseByKind(text2, kind, format = "iso") {
  if (typeof text2 !== "string") return null;
  const value = text2.trim();
  switch (kind) {
    case "date":
      return parseDate(value, format);
    case "datetime":
      return parseDateTime(value, format);
    case "time":
      return parseTime(value);
    case "month":
      return parseMonth(value, format);
    case "week":
      return parseWeek(value);
    default:
      return null;
  }
}
function pad(n, size = 2) {
  return String(n).padStart(size, "0");
}
function now(kind, clock = () => /* @__PURE__ */ new Date()) {
  const date = clock();
  const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
  switch (kind) {
    case "date":
      return parseDate(`${pad(y, 4)}-${pad(mo)}-${pad(d)}`);
    case "datetime":
      return parseDateTime(`${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`);
    case "time":
      return parseTime(`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`);
    case "month":
      return parseMonth(`${pad(y, 4)}-${pad(mo)}`);
    default:
      return null;
  }
}
function formatIso(parsed) {
  if (!parsed) return "";
  switch (parsed.kind) {
    case "date":
      return `${pad(parsed.y, 4)}-${pad(parsed.m)}-${pad(parsed.d)}`;
    case "datetime":
      return `${pad(parsed.y, 4)}-${pad(parsed.m)}-${pad(parsed.d)}T${pad(parsed.h)}:${pad(parsed.mi)}${parsed.s ? ":" + pad(parsed.s) : ""}`;
    case "time":
      return `${pad(parsed.h)}:${pad(parsed.mi)}${parsed.s ? ":" + pad(parsed.s) : ""}`;
    case "month":
      return `${pad(parsed.y, 4)}-${pad(parsed.m)}`;
    case "week":
      return `${pad(parsed.y, 4)}-W${pad(parsed.w)}`;
    default:
      return "";
  }
}
function formatBr(parsed) {
  if (!parsed) return "";
  switch (parsed.kind) {
    case "date":
      return `${pad(parsed.d)}/${pad(parsed.m)}/${pad(parsed.y, 4)}`;
    case "datetime":
      return `${pad(parsed.d)}/${pad(parsed.m)}/${pad(parsed.y, 4)} ${pad(parsed.h)}:${pad(parsed.mi)}`;
    case "month":
      return `${pad(parsed.m)}/${pad(parsed.y, 4)}`;
    default:
      return formatIso(parsed);
  }
}

// src/validators/comparison.js
function orderOf(value, other, ctx) {
  if (ctx.field.dateKind) {
    const a = parseByKind(String(value ?? ""), ctx.field.dateKind, ctx.field.dateFormat);
    const b = parseByKind(String(other.value ?? ""), other.dateKind || ctx.field.dateKind, other.dateFormat);
    if (a && b) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    return null;
  }
  if (parseDecimal(String(value ?? "").trim()) && parseDecimal(String(other.value ?? "").trim())) {
    return compareDecimal(String(value).trim(), String(other.value).trim());
  }
  return null;
}
function ordered(test) {
  return {
    params: [{ name: "other", type: "field" }],
    validate(value, ctx) {
      const other = ctx.other(ctx.params.other.ref);
      if (isEmptyValue(other.value)) return true;
      const cmp = orderOf(value, other, ctx);
      if (cmp === null) return { valid: false, vars: { other: other.label } };
      return test(cmp) || { valid: false, vars: { other: other.label } };
    }
  };
}
var comparison_default = {
  same: {
    params: [{ name: "other", type: "field" }],
    validate(value, ctx) {
      const other = ctx.other(ctx.params.other.ref);
      return valuesEqual(value, other.value) || { valid: false, vars: { other: other.label } };
    }
  },
  different: {
    params: [{ name: "other", type: "field" }],
    validate(value, ctx) {
      const other = ctx.other(ctx.params.other.ref);
      return !valuesEqual(value, other.value) || { valid: false, vars: { other: other.label } };
    }
  },
  greater_than: ordered((cmp) => cmp > 0),
  greater_or_equal: ordered((cmp) => cmp >= 0),
  less_than: ordered((cmp) => cmp < 0),
  less_or_equal: ordered((cmp) => cmp <= 0)
};

// src/validators/dates.js
function kindOf(ctx) {
  return ctx.field.dateKind || "date";
}
function parseValue(value, kind, format) {
  return parseByKind(String(value ?? ""), kind, format);
}
function promote(parsed, kind) {
  if (!parsed || parsed.kind === kind) return parsed;
  if (parsed.kind === "date" && kind === "datetime") return parseByKind(`${formatIsoDate(parsed)}T00:00`, "datetime");
  return null;
}
function formatIsoDate(p) {
  return `${String(p.y).padStart(4, "0")}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
function detectLiteralKind(literal) {
  if (/^\d{4}-W\d{2}$/.test(literal)) return "week";
  if (/^\d{2}:\d{2}/.test(literal)) return "time";
  if (/T|\s\d{2}:/.test(literal)) return "datetime";
  if (/^\d{4}-\d{2}$/.test(literal)) return "month";
  return "date";
}
function resolveComparand(param, ctx) {
  const kind = kindOf(ctx);
  if (param.keyword) {
    if (kind === "week") return ctx.configError('"today"/"now" n\xE3o s\xE3o suportados em campos de semana.');
    const parsed2 = kind === "datetime" && param.keyword === "today" ? promote(now("date", ctx.clock), "datetime") : now(kind, ctx.clock);
    return { parsed: parsed2, label: param.keyword === "today" ? "hoje" : "agora" };
  }
  if (param.literal) {
    const literalKind = detectLiteralKind(param.literal);
    const parsed2 = promote(parseByKind(param.literal, literalKind), kind);
    if (!parsed2) return ctx.configError(`Data "${param.literal}" incompat\xEDvel com o campo (${kind}). Use formato ISO.`);
    return { parsed: parsed2, label: formatBr(parsed2) };
  }
  const other = ctx.other(param.ref);
  if (isEmptyValue(other.value)) return { skip: true };
  const parsed = promote(parseValue(other.value, other.dateKind || kind, other.dateFormat), kind);
  if (!parsed) return { skip: true };
  return { parsed, label: other.label };
}
function compareRule(test) {
  return {
    params: [{ name: "target", type: "date-or-field" }],
    validate(value, ctx) {
      const kind = kindOf(ctx);
      const parsed = parseValue(value, kind, ctx.field.dateFormat);
      if (!parsed) return { valid: false, rule: "date", variant: kind === "date" ? null : kind };
      const target = resolveComparand(ctx.params.target, ctx);
      if (target.skip) return true;
      return test(parsed.key, target.parsed.key) || { valid: false, vars: { other: target.label } };
    }
  };
}
var dates_default = {
  date: {
    params: [{ name: "kind", type: "enum", values: DATE_KINDS, optional: true }],
    validate(value, ctx) {
      const kind = ctx.params.kind || kindOf(ctx);
      return parseValue(value, kind, ctx.field.dateFormat) ? true : { valid: false, variant: kind === "date" ? null : kind };
    }
  },
  before: compareRule((a, b) => a < b),
  after: compareRule((a, b) => a > b),
  before_or_equal: compareRule((a, b) => a <= b),
  after_or_equal: compareRule((a, b) => a >= b),
  date_between: {
    params: [{ name: "start", type: "date-or-field" }, { name: "end", type: "date-or-field" }],
    validate(value, ctx) {
      const kind = kindOf(ctx);
      const parsed = parseValue(value, kind, ctx.field.dateFormat);
      if (!parsed) return { valid: false, rule: "date", variant: kind === "date" ? null : kind };
      const start = resolveComparand(ctx.params.start, ctx);
      const end = resolveComparand(ctx.params.end, ctx);
      if (start.skip || end.skip) return true;
      const ok = parsed.key >= start.parsed.key && parsed.key <= end.parsed.key;
      return ok || { valid: false, vars: { min: start.label, max: end.label } };
    }
  }
};

// src/lib/br.js
function onlyDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}
var CPF_FORMAT = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
function isCpf(value) {
  const text2 = String(value ?? "").trim();
  if (!CPF_FORMAT.test(text2)) return false;
  const digits = onlyDigits(text2);
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calc = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const rest = sum * 10 % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}
var CNPJ_FORMAT = /^[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}$/;
var W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
var W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
function normalizeCnpj(value) {
  return String(value ?? "").toUpperCase().replace(/[.\-/\s]/g, "");
}
function cnpjCheckDigits(base12) {
  const values = Array.from(base12, (ch) => ch.charCodeAt(0) - 48);
  const dv = (weights) => {
    const sum = weights.reduce((acc, w, i) => acc + values[i] * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = dv(W1);
  values.push(d1);
  const d2 = dv(W2);
  return `${d1}${d2}`;
}
function isCnpj(value, { alphanumeric = true } = {}) {
  const text2 = String(value ?? "").trim().toUpperCase();
  if (!CNPJ_FORMAT.test(text2)) return false;
  const clean = normalizeCnpj(text2);
  if (!alphanumeric && /[A-Z]/.test(clean)) return false;
  if (/^(.)\1{13}$/.test(clean)) return false;
  return cnpjCheckDigits(clean.slice(0, 12)) === clean.slice(12);
}
function isCep(value) {
  return /^\d{5}-?\d{3}$/.test(String(value ?? "").trim());
}
var DDDS = /* @__PURE__ */ new Set([
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  21,
  22,
  24,
  27,
  28,
  31,
  32,
  33,
  34,
  35,
  37,
  38,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  51,
  53,
  54,
  55,
  61,
  62,
  63,
  64,
  65,
  66,
  67,
  68,
  69,
  71,
  73,
  74,
  75,
  77,
  79,
  81,
  82,
  83,
  84,
  85,
  86,
  87,
  88,
  89,
  91,
  92,
  93,
  94,
  95,
  96,
  97,
  98,
  99
]);
function phoneType(value) {
  const text2 = String(value ?? "").trim();
  if (!/^\+?[\d\s().-]+$/.test(text2)) return null;
  let digits = onlyDigits(text2);
  if (text2.startsWith("+")) {
    if (!digits.startsWith("55")) return null;
    digits = digits.slice(2);
  } else if (digits.length >= 12 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (!DDDS.has(Number(digits.slice(0, 2)))) return null;
  const local = digits.slice(2);
  if (local.length === 9 && local[0] === "9") return "celular";
  if (local.length === 8 && /[2-5]/.test(local[0])) return "fixo";
  return null;
}
function luhn(value) {
  const digits = onlyDigits(value);
  if (digits.length < 12 || digits.length > 19 || /\D/.test(String(value).replace(/[\s-]/g, ""))) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

// src/validators/brazil.js
var text = (value) => String(value ?? "");
var brazil_default = {
  cpf: { validate: (value) => isCpf(text(value)) },
  cnpj: {
    params: [{ name: "mode", type: "enum", values: ["numeric"], optional: true }],
    validate: (value, ctx) => isCnpj(text(value), { alphanumeric: ctx.params.mode !== "numeric" })
  },
  cpf_cnpj: {
    validate(value) {
      const clean = normalizeCnpj(value);
      return clean.length === 11 ? isCpf(text(value)) : isCnpj(text(value));
    }
  },
  cep: { validate: (value) => isCep(text(value)) },
  telefone: {
    params: [{ name: "type", type: "enum", values: ["celular", "fixo"], optional: true }],
    validate(value, ctx) {
      const type = phoneType(text(value));
      if (!type) return { valid: false, variant: ctx.params.type || null };
      if (ctx.params.type && type !== ctx.params.type) return { valid: false, variant: ctx.params.type };
      return true;
    }
  },
  luhn: { validate: (value) => luhn(text(value)) }
};

// src/lib/cards.js
var CARD_BRANDS = [
  {
    name: "elo",
    prefix: /^(4011(78|79)|43(1274|8935)|45(1416|7393|763[12])|50(4175|6699|67[0-7]\d|9000)|627780|63(6297|6368)|650(0(3[1-9]|[4-9]\d)|4([0-3]\d|8[5-9]|9\d)|5\d\d|9([0-2]\d|3[0-8]))|65(1652|5(0\d|1\d|2[01])))/,
    lengths: [16],
    gaps: [4, 4, 4, 4]
  },
  { name: "hipercard", prefix: /^(606282|3841)/, lengths: [16, 19], gaps: [4, 4, 4, 4, 3] },
  { name: "amex", prefix: /^3[47]/, lengths: [15], gaps: [4, 6, 5] },
  { name: "diners", prefix: /^3(0[0-5]|[689])/, lengths: [14, 16, 19], gaps: [4, 6, 4, 5] },
  { name: "jcb", prefix: /^35(2[89]|[3-8])/, lengths: [16, 17, 18, 19], gaps: [4, 4, 4, 4, 3] },
  { name: "mastercard", prefix: /^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/, lengths: [16], gaps: [4, 4, 4, 4] },
  { name: "discover", prefix: /^(6011|65|64[4-9])/, lengths: [16, 17, 18, 19], gaps: [4, 4, 4, 4, 3] },
  { name: "visa", prefix: /^4/, lengths: [13, 16, 19], gaps: [4, 4, 4, 4, 3] }
];
var GENERIC_CARD = { name: null, lengths: [12, 13, 14, 15, 16, 17, 18, 19], gaps: [4, 4, 4, 4, 3] };
function detectBrand(digits, allowed = null) {
  for (const brand of CARD_BRANDS) {
    if (allowed && !allowed.includes(brand.name)) continue;
    if (brand.prefix.test(digits)) return brand;
  }
  return null;
}
function isValidCard(value, allowed = null) {
  const digits = String(value ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  const brand = detectBrand(digits, allowed);
  if (allowed && !brand) return false;
  const lengths = brand ? brand.lengths : GENERIC_CARD.lengths;
  return lengths.includes(digits.length) && luhn(digits);
}

// src/validators/cards.js
var cards_default = {
  card: {
    rest: { name: "brands", type: "string" },
    validate: (value, ctx) => isValidCard(String(value ?? ""), ctx.params.brands?.length ? ctx.params.brands : null)
  }
};

// src/validators/index.js
var BUILTIN_VALIDATORS = { ...presence_default, ...text_default, ...numbers_default, ...comparison_default, ...dates_default, ...brazil_default, ...cards_default, ...files_default };
function registerBuiltinValidators() {
  for (const [name, definition] of Object.entries(BUILTIN_VALIDATORS)) {
    if (!has("validator", name)) registerValidator(name, definition);
  }
}

// src/transport/fetch.js
async function fetchTransport(request) {
  const { url, method = "POST", headers = {}, body = null, credentials = "same-origin", timeout = 0, signal } = request;
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeout > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout) : null;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const finalHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (body instanceof FormData && name.toLowerCase() === "content-type") continue;
    finalHeaders[name] = value;
  }
  if (body) request.onUploadProgress?.({ loaded: 0, total: null, lengthComputable: false });
  try {
    const response = await fetch(url, { method: method.toUpperCase(), headers: finalHeaders, body, credentials, signal: controller.signal, redirect: "follow" });
    request.onUploadComplete?.();
    const text2 = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      headers: { get: (name) => response.headers.get(name) },
      text: text2
    };
  } catch (error) {
    if (timedOut) throw new OperationalError("Tempo limite excedido.", { kind: "timeout", uploadComplete: false });
    if (controller.signal.aborted) throw new AbortError("Envio cancelado.");
    throw new OperationalError("Falha de rede ou requisi\xE7\xE3o bloqueada pelo navegador.", { kind: "network", uploadComplete: false, crossOrigin: isCrossOrigin(url), cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// src/ui/default-adapter.js
var DEFAULT_CLASSES = {
  invalid: "af-invalid",
  valid: "af-valid",
  pending: "af-pending",
  error: "af-error",
  errorItem: "af-error__item",
  errorPending: "af-error--pending",
  groupInvalid: "af-group-invalid",
  summary: "af-summary",
  summaryTitle: "af-summary__title",
  summaryList: "af-summary__list",
  fileList: "af-files",
  fileItem: "af-file",
  fileItemInvalid: "af-file--invalid",
  fileThumb: "af-file__thumb",
  fileName: "af-file__name",
  fileSize: "af-file__size",
  fileErrors: "af-file__errors",
  fileRemove: "af-file__remove",
  existingRemoved: "af-existing--removed",
  dropzoneOver: "af-dropzone--over"
};
function classList(value) {
  return String(value || "").split(/\s+/).filter(Boolean);
}
function toggleClasses(el, value, force) {
  for (const name of classList(value)) el.classList.toggle(name, force);
}
function addToken(el, attr, token) {
  const tokens = (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean);
  if (!tokens.includes(token)) {
    tokens.push(token);
    el.setAttribute(attr, tokens.join(" "));
  }
}
function removeToken(el, attr, token) {
  const tokens = (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean);
  const next = tokens.filter((t) => t !== token);
  if (next.length === tokens.length) return;
  if (next.length) el.setAttribute(attr, next.join(" "));
  else el.removeAttribute(attr);
}
var DefaultUiAdapter = class {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.classes = { ...DEFAULT_CLASSES, ...options.classes || {} };
    this.records = /* @__PURE__ */ new Map();
    this.summaryEl = null;
    this.summaryCreated = false;
  }
  record(field) {
    let rec = this.records.get(field.id);
    if (!rec) {
      rec = { errorEl: null, created: false, target: null, generatedTargetId: false, ariaOriginal: /* @__PURE__ */ new Map(), describedControls: /* @__PURE__ */ new Set() };
      this.records.set(field.id, rec);
    }
    return rec;
  }
  /** Controles que recebem classes de estado. */
  classTargets(field) {
    if (field.kind === "component") return [field.primary];
    return field.controls;
  }
  ariaTargets(field) {
    if (field.kind === "component") return [field.primary];
    if ((field.kind === "radio" || field.kind === "checkbox-group") && field.controls.length > 1) {
      const fieldset = field.primary.closest("fieldset");
      if (fieldset && field.controls.every((c) => fieldset.contains(c))) return [fieldset, ...field.controls];
    }
    return field.controls;
  }
  /** Onde inserir o elemento de erro criado automaticamente. */
  anchorFor(field) {
    const last = field.controls[field.controls.length - 1];
    if ((field.kind === "radio" || field.kind === "checkbox-group") && field.controls.length > 1) {
      const fieldset = field.primary.closest("fieldset");
      if (fieldset && field.controls.every((c) => fieldset.contains(c))) return { parent: fieldset, before: null };
    }
    const label = last.closest("label");
    const anchor = label && label.contains(last) ? label : last;
    return { parent: anchor.parentNode, before: anchor.nextSibling };
  }
  createErrorElement(field, id) {
    const el = document.createElement("div");
    el.id = id;
    el.className = this.classes.error;
    el.hidden = true;
    el.setAttribute("data-form-generated", "error");
    return el;
  }
  ensureErrorElement(field) {
    const rec = this.record(field);
    if (rec.errorEl && rec.errorEl.isConnected) return rec.errorEl;
    const targetSelector = field.groupAttribute("data-form-error-target");
    if (targetSelector) {
      let target;
      try {
        target = document.querySelector(targetSelector);
      } catch {
        throw new ConfigError(`Seletor inv\xE1lido em data-form-error-target="${targetSelector}".`);
      }
      if (!target) throw new ConfigError(`data-form-error-target="${targetSelector}" n\xE3o encontrou elemento.`);
      if (!target.id) {
        target.id = `${this.ctx.uid}-${field.id}-err`;
        rec.generatedTargetId = true;
      }
      rec.errorEl = target;
      rec.created = false;
      rec.target = target;
    } else {
      if (field.kind === "hidden") return null;
      const el = this.createErrorElement(field, `${this.ctx.uid}-${field.id}-err`);
      const { parent, before } = this.anchorFor(field);
      if (!parent) return null;
      parent.insertBefore(el, before);
      rec.errorEl = el;
      rec.created = true;
    }
    for (const control of this.ariaTargets(field)) {
      if (!rec.ariaOriginal.has(control)) {
        rec.ariaOriginal.set(control, {
          describedby: control.getAttribute("aria-describedby"),
          invalid: control.getAttribute("aria-invalid")
        });
      }
      addToken(control, "aria-describedby", rec.errorEl.id);
      rec.describedControls.add(control);
    }
    return rec.errorEl;
  }
  /**
   * view = { status: 'idle'|'valid'|'invalid'|'pending', messages: string[], info: string|null, showValid }
   * info = texto não bloqueante (pendente ou verificação inconclusiva), exibido quando não há erros.
   */
  renderField(field, view) {
    const hasContent = view.messages.length > 0 || !!view.info;
    const rec = this.records.get(field.id);
    if (!hasContent && !rec?.errorEl) {
      this.applyClasses(field, view);
      return;
    }
    const el = this.ensureErrorElement(field);
    this.applyClasses(field, view);
    if (!el) return;
    el.textContent = "";
    if (view.messages.length) {
      for (const message of view.messages) {
        const item = document.createElement("span");
        item.className = this.classes.errorItem;
        item.textContent = message;
        el.appendChild(item);
      }
      toggleClasses(el, this.classes.errorPending, false);
    } else if (view.info) {
      const item = document.createElement("span");
      item.className = this.classes.errorItem;
      item.textContent = view.info;
      el.appendChild(item);
      toggleClasses(el, this.classes.errorPending, true);
    } else {
      toggleClasses(el, this.classes.errorPending, false);
    }
    if (this.records.get(field.id)?.created) el.hidden = !hasContent;
  }
  applyClasses(field, view) {
    const invalid = view.status === "invalid";
    for (const control of this.classTargets(field)) {
      toggleClasses(control, this.classes.invalid, invalid);
      toggleClasses(control, this.classes.valid, view.status === "valid" && !!view.showValid);
      toggleClasses(control, this.classes.pending, view.status === "pending");
    }
    for (const control of this.ariaTargets(field)) {
      const rec = this.record(field);
      if (!rec.ariaOriginal.has(control)) {
        rec.ariaOriginal.set(control, { describedby: control.getAttribute("aria-describedby"), invalid: control.getAttribute("aria-invalid") });
      }
      if (invalid) control.setAttribute("aria-invalid", "true");
      else {
        const original = rec.ariaOriginal.get(control)?.invalid;
        if (original != null) control.setAttribute("aria-invalid", original);
        else control.removeAttribute("aria-invalid");
      }
    }
  }
  removeField(field) {
    const rec = this.records.get(field.id);
    for (const control of this.classTargets(field)) {
      for (const key of ["invalid", "valid", "pending"]) toggleClasses(control, this.classes[key], false);
    }
    if (!rec) return;
    for (const [control, original] of rec.ariaOriginal) {
      if (rec.errorEl) removeToken(control, "aria-describedby", rec.errorEl.id);
      if (original.describedby != null && control.getAttribute("aria-describedby") == null) control.setAttribute("aria-describedby", original.describedby);
      if (original.invalid != null) control.setAttribute("aria-invalid", original.invalid);
      else control.removeAttribute("aria-invalid");
    }
    if (rec.errorEl) {
      if (rec.created) rec.errorEl.remove();
      else {
        rec.errorEl.textContent = "";
        toggleClasses(rec.errorEl, this.classes.errorPending, false);
        if (rec.generatedTargetId) rec.errorEl.removeAttribute("id");
      }
    }
    this.records.delete(field.id);
  }
  summaryContainer(create) {
    if (this.summaryEl && this.summaryEl.isConnected) return this.summaryEl;
    const form = this.ctx.form;
    const selector = form.getAttribute("data-form-summary-target");
    let el = selector ? document.querySelector(selector) : form.querySelector("[data-form-errors-summary]");
    if (selector && !el) throw new ConfigError(`data-form-summary-target="${selector}" n\xE3o encontrou elemento.`);
    if (!el && create) {
      el = document.createElement("div");
      el.setAttribute("data-form-generated", "summary");
      el.hidden = true;
      form.insertBefore(el, form.firstChild);
      this.summaryCreated = true;
    }
    if (el) {
      toggleClasses(el, this.classes.summary, true);
      if (!el.hasAttribute("role")) el.setAttribute("role", "alert");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    }
    this.summaryEl = el;
    return el;
  }
  /**
   * view = { title, items: [{ text, field? }] }
   */
  renderSummary(view) {
    const el = this.summaryContainer(view.items.length > 0);
    if (!el) return;
    el.textContent = "";
    if (!view.items.length) {
      el.hidden = true;
      return;
    }
    if (view.title) {
      const title = document.createElement("p");
      title.className = this.classes.summaryTitle;
      title.textContent = view.title;
      el.appendChild(title);
    }
    const list = document.createElement("ul");
    list.className = this.classes.summaryList;
    for (const item of view.items) {
      const li = document.createElement("li");
      if (item.field && item.onActivate) {
        const link = document.createElement("a");
        const control = item.field.primary;
        link.href = control.id ? `#${control.id}` : "#";
        link.textContent = item.text;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          item.onActivate();
        });
        li.appendChild(link);
      } else {
        li.textContent = item.text;
      }
      list.appendChild(li);
    }
    el.appendChild(list);
    el.hidden = false;
  }
  focusSummary() {
    const el = this.summaryContainer(false);
    if (el && !el.hidden) el.focus({ preventScroll: false });
  }
  /** Lista de arquivos declarada por data-form-file-list="nome". */
  renderFileList(field, container, items2, { onRemove }) {
    const previouslyFocused = container.contains(document.activeElement) ? document.activeElement.getAttribute("data-file-id") : null;
    container.textContent = "";
    if (!items2.length) return;
    const list = document.createElement("ul");
    list.className = this.classes.fileList;
    list.setAttribute("data-form-generated", "file-list");
    for (const item of items2) {
      const li = document.createElement("li");
      li.className = this.classes.fileItem;
      li.setAttribute("data-file-id", item.id);
      if (item.errors.length) toggleClasses(li, this.classes.fileItemInvalid, true);
      if (item.previewUrl) {
        const img = document.createElement("img");
        img.className = this.classes.fileThumb;
        img.src = item.previewUrl;
        img.alt = `Pr\xE9-visualiza\xE7\xE3o de ${item.name}`;
        img.decoding = "async";
        img.loading = "lazy";
        li.appendChild(img);
      }
      const name = document.createElement("span");
      name.className = this.classes.fileName;
      name.textContent = item.name;
      li.appendChild(name);
      const size = document.createElement("span");
      size.className = this.classes.fileSize;
      size.textContent = formatBytes(item.size);
      li.appendChild(size);
      if (item.errors.length) {
        const errors = document.createElement("span");
        errors.className = this.classes.fileErrors;
        errors.textContent = item.errors.join(" ");
        li.appendChild(errors);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = this.classes.fileRemove;
      remove.textContent = "Remover";
      remove.setAttribute("aria-label", `Remover ${item.name}`);
      remove.setAttribute("data-file-id", item.id);
      remove.addEventListener("click", () => onRemove(item.id));
      li.appendChild(remove);
      list.appendChild(li);
    }
    container.appendChild(list);
    if (previouslyFocused) {
      const same = container.querySelector(`button[data-file-id="${previouslyFocused}"]`);
      (same || container.querySelector("button[data-file-id]"))?.focus();
    }
  }
  renderExisting(entry) {
    toggleClasses(entry.element, this.classes.existingRemoved, entry.removed);
    const button = entry.element.querySelector("[data-form-existing-remove]");
    if (button) button.setAttribute("aria-pressed", entry.removed ? "true" : "false");
  }
  setDropzoneOver(el, over) {
    toggleClasses(el, this.classes.dropzoneOver, over);
  }
  destroy() {
    if (this.summaryEl) {
      if (this.summaryCreated) this.summaryEl.remove();
      else this.summaryEl.textContent = "";
    }
    this.summaryEl = null;
  }
};
function createDefaultAdapter(ctx, options) {
  return new DefaultUiAdapter(ctx, options);
}

// src/files/image-inspector.js
var MAX_DECODE_BYTES = 50 * 1024 * 1024;
async function inspectImage(file, { signal, maxBytes = MAX_DECODE_BYTES } = {}) {
  if (signal?.aborted) throw new AbortError();
  if (file.size > maxBytes) {
    throw new OperationalError(`Imagem grande demais para inspe\xE7\xE3o no navegador (${file.size} bytes).`, { kind: "inspect" });
  }
  if (typeof createImageBitmap === "function") {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (error) {
      throw new OperationalError("O navegador n\xE3o conseguiu decodificar a imagem.", { kind: "decode", cause: error });
    }
    if (signal?.aborted) {
      bitmap.close?.();
      throw new AbortError();
    }
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return result;
  }
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") {
    throw new OperationalError("Este navegador n\xE3o oferece API para decodificar imagens.", { kind: "unsupported" });
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      const onAbort = () => reject(new AbortError());
      signal?.addEventListener("abort", onAbort, { once: true });
      img.onload = () => resolve();
      img.onerror = () => reject(new OperationalError("O navegador n\xE3o conseguiu decodificar a imagem.", { kind: "decode" }));
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// src/index.js
var VERSION = "1.0.0";
function registerBuiltins() {
  registerBuiltinValidators();
  registerBuiltinNormalizers();
  const add = (kind, name, value, fn) => {
    if (!has(kind, name)) fn(name, value);
  };
  add("transport", "xhr", xhrTransport, registerTransport);
  add("transport", "fetch", fetchTransport, registerTransport);
  add("responseAdapter", "default", defaultResponseAdapter, registerResponseAdapter);
  add("responseAdapter", "laravel", laravelResponseAdapter, registerResponseAdapter);
  add("responseAdapter", "joomla", joomlaResponseAdapter, registerResponseAdapter);
  add("remoteAdapter", "default", defaultRemoteAdapter, registerRemoteAdapter);
  add("uiAdapter", "default", createDefaultAdapter, registerUiAdapter);
  add("fileInspector", "image", { inspect: inspectImage }, registerFileInspector);
}
registerBuiltins();
function canLog(form) {
  const attr = form?.getAttribute?.("data-form-log");
  return (attr ?? globalOption("log")) !== "none";
}
function diagnoseUninitialized() {
  const missing = [];
  for (const form of document.querySelectorAll("form[x-form]")) {
    if (!getController(form)) {
      missing.push(form);
      if (canLog(form)) console.warn("[AlpineForm] <form x-form> n\xE3o foi inicializado. O Alpine s\xF3 processa elementos dentro de um componente: adicione x-data ao <form> ou a um ancestral (e verifique x-ignore).", form);
    }
  }
  return missing;
}
function AlpineFormPlugin(Alpine) {
  services.Alpine = Alpine;
  Alpine.directive("form", (el, { expression }, { evaluate, cleanup }) => {
    try {
      const options = expression ? evaluate(expression) : {};
      const controller = new FormController(el, options, { reactive: Alpine.reactive, nextTick: (cb) => Alpine.nextTick(cb) });
      cleanup(() => controller.destroy());
    } catch (error) {
      if (error?.kind === "state") {
        if (canLog(el)) console.warn("[AlpineForm]", error.message, el);
        return;
      }
      el.setAttribute("data-form-state", "config-error");
      if (canLog(el)) console.error("[AlpineForm]", error.message, el);
    }
  });
  Alpine.magic("form", (el) => controllerForElement(el)?.state ?? null);
  for (const setup of getAlpineSetups()) setup(Alpine);
  if (typeof document !== "undefined") document.addEventListener("alpine:initialized", diagnoseUninitialized, { once: true });
}
var AlpineForm = {
  version: VERSION,
  plugin: AlpineFormPlugin,
  configure,
  resetConfig: resetGlobalConfig,
  options: OPTION_SPECS,
  validator: registerValidator,
  normalizer: registerNormalizer,
  mask: registerMask,
  transport: registerTransport,
  responseAdapter: registerResponseAdapter,
  remoteAdapter: registerRemoteAdapter,
  uiAdapter: registerUiAdapter,
  fileInspector: registerFileInspector,
  component: registerComponent,
  fieldAttributes: registerFieldAttributes,
  formHook: registerFormHook,
  /** Módulos registram diretivas/mágicas do Alpine; roda na hora se o Alpine já estiver instalado. */
  alpine(setup) {
    registerAlpineSetup(setup);
    if (services.Alpine) setup(services.Alpine);
    return AlpineForm;
  },
  registry: { get, has, names, unregister },
  use(plugin) {
    usePlugin(plugin, AlpineForm);
    return AlpineForm;
  },
  /** Estado/API pública de um formulário já inicializado (elemento ou id). */
  get(formOrId) {
    const form = typeof formOrId === "string" ? document.getElementById(formOrId) : formOrId;
    if (form && form.tagName !== "FORM") return null;
    return form ? getController(form)?.state ?? null : null;
  },
  /** Inicialização manual (sem diretiva). Com o plugin instalado, o estado é reativo pelo Alpine. */
  attach(form, options = {}) {
    const Alpine = services.Alpine;
    const controller = new FormController(form, options, Alpine ? { reactive: Alpine.reactive, nextTick: (cb) => Alpine.nextTick(cb) } : {});
    return controller.state;
  },
  diagnose: diagnoseUninitialized,
  internals: { setMaskProvider, setChunkService, services, getController, parseRules, tokenize, parseBody, normalizeErrors, withRetry, backoffDelay, DefaultUiAdapter, DEFAULT_CLASSES, globalOption, JobPoller },
  utils: { parseSize, formatBytes, compareDecimal, toFixedScale },
  events: EVENTS,
  messages: DEFAULT_MESSAGES,
  errors: { AlpineFormError, ConfigError, OperationalError, StateError, SerializationError, AbortError }
};
var index_default = AlpineFormPlugin;
export {
  AbortError,
  AlpineForm,
  AlpineFormPlugin,
  ConfigError,
  DEFAULT_MESSAGES,
  EVENTS,
  OperationalError,
  SerializationError,
  StateError,
  VERSION,
  index_default as default
};
