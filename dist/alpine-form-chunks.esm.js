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
var AbortError = class extends AlpineFormError {
  constructor(message = "Opera\xE7\xE3o cancelada.", details = {}) {
    super(message, details);
    this.name = "AbortError";
    this.kind = "abort";
  }
};
function isAbort(error) {
  return !!error && (error.name === "AbortError" || error.kind === "abort");
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
  const text = String(input ?? "").trim();
  const match = SIZE_RE.exec(text);
  if (!match) throw new ConfigError(`Tamanho inv\xE1lido: "${text}". Use, por exemplo, 500KB, 10MB ou 2MiB.`);
  const unit = (match[2] || "b").toLowerCase();
  const factor = UNITS[unit];
  if (!factor) {
    throw new ConfigError(`Unidade de tamanho "${match[2]}" n\xE3o reconhecida em "${text}". Use B, KB, MB, GB, KiB, MiB ou GiB.`);
  }
  const bytes = Math.floor(Number(match[1]) * factor);
  if (!Number.isSafeInteger(bytes)) throw new ConfigError(`Tamanho fora do limite suportado: "${text}".`);
  return bytes;
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
function parseBool(raw, attr) {
  if (raw === "" || raw === "true" || raw === attr) return true;
  if (raw === "false") return false;
  throw new ConfigError(`Valor booleano inv\xE1lido em ${attr}="${raw}". Use o atributo sem valor, "true" ou "false".`, { attr });
}
function parseInteger(raw, attr, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) throw new ConfigError(`N\xFAmero inteiro inv\xE1lido em ${attr}="${raw}".`, { attr });
  const value = Number(text);
  if (value < min || value > max) throw new ConfigError(`${attr}="${raw}" fora do intervalo permitido (${min} a ${max}).`, { attr });
  return value;
}

// src/transport/response.js
function parseBody(raw) {
  const text = raw.text ?? "";
  const contentType = (raw.headers?.get("content-type") || "").toLowerCase();
  if (raw.status === 204 || text.trim() === "") return { type: "empty", json: null, text: "", contentType };
  const looksJson = contentType.includes("json") || /^\s*[{[]/.test(text);
  if (looksJson) {
    try {
      return { type: "json", json: JSON.parse(text), text, contentType };
    } catch (error) {
      return { type: "invalid-json", json: null, text, contentType, error: error.message };
    }
  }
  if (contentType.includes("html") || /^\s*</.test(text)) return { type: "html", json: null, text, contentType };
  return { type: "text", json: null, text, contentType };
}

// src/transport/retry.js
function backoffDelay(attempt, { baseDelay = 500, maxDelay = 15e3, random = Math.random } = {}) {
  const ceiling = Math.min(maxDelay, baseDelay * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

// src/chunks/chunk-upload.js
var ExpiredSessionError = class extends OperationalError {
  constructor(message = "Sess\xE3o de upload expirada ou inexistente.") {
    super(message, { kind: "upload-expired" });
  }
};
async function sha256Hex(data) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function manifestOf(partHashes) {
  if (partHashes.some((h) => !h)) return null;
  const joined = new Uint8Array(partHashes.length * 32);
  partHashes.forEach((hex, i) => joined.set(hexToBytes(hex), i * 32));
  return sha256Hex(joined);
}
async function quickFingerprint(file) {
  const meta = `${file.name}|${file.size}|${file.lastModified}`;
  if (!globalThis.crypto?.subtle) return meta;
  const edge = 64 * 1024;
  const head = await file.slice(0, Math.min(edge, file.size)).arrayBuffer();
  const tail = file.size > edge ? await file.slice(Math.max(0, file.size - edge)).arrayBuffer() : new ArrayBuffer(0);
  const metaBytes = new TextEncoder().encode(meta);
  const all = new Uint8Array(metaBytes.length + head.byteLength + tail.byteLength);
  all.set(metaBytes, 0);
  all.set(new Uint8Array(head), metaBytes.length);
  all.set(new Uint8Array(tail), metaBytes.length + head.byteLength);
  return sha256Hex(all);
}
var STORAGE_PREFIX = "alpineform:chunk:";
function persistedKey(endpoint, fingerprint) {
  return `${STORAGE_PREFIX}${endpoint}:${fingerprint}`;
}
function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}
function loadPersisted(endpoint, fingerprint) {
  try {
    const raw = storage()?.getItem(persistedKey(endpoint, fingerprint));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function savePersisted(endpoint, fingerprint, record) {
  try {
    storage()?.setItem(persistedKey(endpoint, fingerprint), JSON.stringify(record));
  } catch {
  }
}
function removePersisted(endpoint, fingerprint) {
  try {
    storage()?.removeItem(persistedKey(endpoint, fingerprint));
  } catch {
  }
}
function listPersisted(endpoint) {
  const store = storage();
  if (!store) return [];
  const out = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(`${STORAGE_PREFIX}${endpoint}:`)) continue;
    try {
      out.push(JSON.parse(store.getItem(key)));
    } catch {
    }
  }
  return out;
}
var ChunkUpload = class {
  constructor({ file, endpoint, chunkSize, concurrency = 3, retries = 5, checksum = true, persist = false, transport, headers = () => ({}), onChange = () => {
  }, now = () => Date.now(), random }) {
    this.file = file;
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.chunkSize = chunkSize;
    this.concurrency = concurrency;
    this.retries = retries;
    this.checksum = checksum;
    this.persist = persist;
    this.transport = transport;
    this.headers = headers;
    this.onChange = onChange;
    this.now = now;
    this.random = random;
    this.status = "idle";
    this.uploadId = null;
    this.totalParts = 0;
    this.received = /* @__PURE__ */ new Map();
    this.partHashes = [];
    this.inflight = /* @__PURE__ */ new Map();
    this.restarts = 0;
    this.token = null;
    this.error = null;
    this.fingerprint = null;
    this.resumed = false;
    this.pauseGate = null;
  }
  get confirmedBytes() {
    let sum = 0;
    for (const size of this.received.values()) sum += size;
    return sum;
  }
  get loaded() {
    let inflight = 0;
    for (const [index, entry] of this.inflight) if (!this.received.has(index)) inflight += entry.loaded;
    return Math.min(this.file.size, this.confirmedBytes + inflight);
  }
  partRange(index) {
    const start = index * this.chunkSize;
    const end = Math.min(this.file.size, start + this.chunkSize);
    return { start, end, size: end - start };
  }
  snapshot() {
    return {
      name: this.file.name,
      size: this.file.size,
      uploadId: this.uploadId,
      status: this.status,
      totalParts: this.totalParts,
      receivedParts: this.received.size,
      loaded: this.loaded,
      resumed: this.resumed,
      error: this.error
    };
  }
  emit() {
    this.onChange(this);
  }
  async request(method, url, { body = null, headers = {}, signal, onUploadProgress } = {}) {
    const raw = await this.transport({
      url,
      method,
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...this.headers(url), ...headers },
      body,
      credentials: "same-origin",
      timeout: 12e4,
      signal,
      onUploadProgress
    });
    const parsed = parseBody(raw);
    return { status: raw.status, json: parsed.type === "json" ? parsed.json : null, raw };
  }
  async createSession(signal) {
    const response = await this.request("POST", this.endpoint, {
      body: JSON.stringify({ name: this.file.name, size: this.file.size, type: this.file.type, lastModified: this.file.lastModified, chunkSize: this.chunkSize, fingerprint: this.fingerprint }),
      headers: { "Content-Type": "application/json" },
      signal
    });
    if (response.status !== 201 && response.status !== 200) throw this.httpError("criar sess\xE3o", response);
    this.applySession(response.json);
    this.received.clear();
    this.partHashes = new Array(this.totalParts).fill(null);
    if (this.persist) this.savePersistence();
  }
  applySession(json) {
    if (!json || typeof json.uploadId !== "string") throw new OperationalError("Resposta de sess\xE3o de upload inv\xE1lida.", { kind: "upload-contract" });
    this.uploadId = json.uploadId;
    if (Number.isInteger(json.chunkSize) && json.chunkSize > 0) this.chunkSize = json.chunkSize;
    this.totalParts = Math.max(1, Math.ceil(this.file.size / this.chunkSize));
    if (Number.isInteger(json.totalParts) && json.totalParts !== this.totalParts) {
      throw new OperationalError("Servidor e cliente divergem na quantidade de partes.", { kind: "upload-contract" });
    }
  }
  savePersistence() {
    savePersisted(this.endpoint, this.fingerprint, {
      uploadId: this.uploadId,
      name: this.file.name,
      size: this.file.size,
      lastModified: this.file.lastModified,
      chunkSize: this.chunkSize,
      savedAt: this.now()
    });
  }
  /** Sincroniza partes confirmadas com o servidor (fonte de verdade). */
  async syncStatus(signal) {
    const response = await this.request("GET", `${this.endpoint}/${encodeURIComponent(this.uploadId)}`, { signal });
    if (response.status === 404 || response.status === 410) throw new ExpiredSessionError();
    if (response.status !== 200) throw this.httpError("consultar sess\xE3o", response);
    const json = response.json;
    if (json.size !== this.file.size) throw new ExpiredSessionError("A sess\xE3o salva pertence a outro arquivo.");
    this.applySession(json);
    if (json.status === "completed" && json.token) {
      this.token = json.token;
      return "completed";
    }
    if (json.status !== "open") throw new ExpiredSessionError();
    this.received.clear();
    this.partHashes = new Array(this.totalParts).fill(null);
    for (const part of json.receivedParts || []) {
      const index = typeof part === "number" ? part : part.index;
      if (!Number.isInteger(index) || index < 0 || index >= this.totalParts) continue;
      this.received.set(index, this.partRange(index).size);
      if (part && typeof part === "object" && typeof part.sha256 === "string") this.partHashes[index] = part.sha256;
    }
    return "open";
  }
  httpError(action, response) {
    const message = response.json?.message || response.json?.mensagem || `Falha ao ${action} (HTTP ${response.status}).`;
    return new OperationalError(message, { kind: response.status === 413 ? "upload-too-large" : "upload-http", status: response.status });
  }
  async uploadPart(index, signal) {
    const { start, end, size } = this.partRange(index);
    const blob = this.file.slice(start, end);
    const hash = this.checksum ? await sha256Hex(blob) : null;
    let attempt = 0;
    for (; ; ) {
      if (signal.aborted) throw new AbortError();
      if (this.pauseGate) throw new AbortError();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      this.inflight.set(index, { loaded: 0, controller });
      try {
        const headers = { "Content-Type": "application/octet-stream", "X-Chunk-Offset": String(start), "X-Chunk-Size": String(size) };
        if (hash) headers["X-Chunk-Sha256"] = hash;
        const response = await this.request("PUT", `${this.endpoint}/${encodeURIComponent(this.uploadId)}/parts/${index}`, {
          body: blob,
          headers,
          signal: controller.signal,
          onUploadProgress: (p) => {
            const entry = this.inflight.get(index);
            if (entry) entry.loaded = Math.min(size, p.loaded);
            this.emit();
          }
        });
        if (response.status === 200 || response.status === 201) {
          this.received.set(index, size);
          this.partHashes[index] = response.json?.sha256 || hash;
          return;
        }
        if (response.status === 404 || response.status === 410) throw new ExpiredSessionError();
        const retryable = response.status === 429 || response.status >= 500 || response.status === 408;
        if (!retryable || attempt >= this.retries) throw this.httpError(`enviar parte ${index + 1}`, response);
        const retryAfter = Number(response.raw.headers?.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : backoffDelay(attempt, { random: this.random }), signal);
      } catch (error) {
        if (error instanceof ExpiredSessionError) throw error;
        if (isAbort(error) || signal.aborted) throw new AbortError();
        if (!(error.kind === "network" || error.kind === "timeout") || attempt >= this.retries) throw error;
        await sleep(backoffDelay(attempt, { random: this.random }), signal);
      } finally {
        signal.removeEventListener("abort", onAbort);
        this.inflight.delete(index);
        this.emit();
      }
      attempt += 1;
    }
  }
  async waitIfPaused(signal) {
    while (this.pauseGate) {
      await Promise.race([
        this.pauseGate.promise,
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new AbortError()), { once: true }))
      ]);
    }
  }
  async runParts(signal) {
    const local = new AbortController();
    const onAbort = () => local.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const queue = [];
    for (let i = 0; i < this.totalParts; i++) if (!this.received.has(i)) queue.push(i);
    const worker = async () => {
      for (; ; ) {
        await this.waitIfPaused(local.signal);
        const index = queue.shift();
        if (index === void 0) return;
        if (this.received.has(index)) continue;
        try {
          await this.uploadPart(index, local.signal);
        } catch (error) {
          if (isAbort(error) && !local.signal.aborted && this.pauseGate) {
            queue.unshift(index);
            continue;
          }
          throw error;
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(this.concurrency, Math.max(1, queue.length)) }, () => worker()));
    } catch (error) {
      local.abort();
      throw error;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
  async complete(signal) {
    const manifest = this.checksum ? await manifestOf(this.partHashes) : null;
    const response = await this.request("POST", `${this.endpoint}/${encodeURIComponent(this.uploadId)}/complete`, {
      body: JSON.stringify({ manifest }),
      headers: { "Content-Type": "application/json" },
      signal
    });
    if (response.status === 404 || response.status === 410) throw new ExpiredSessionError();
    if (response.status !== 200) throw this.httpError("finalizar upload", response);
    if (!response.json?.token) throw new OperationalError("Finaliza\xE7\xE3o sem token de arquivo.", { kind: "upload-contract" });
    this.token = response.json.token;
  }
  /** Executa (ou retoma) o upload. Resolve com o token do arquivo montado no servidor. */
  async start(signal) {
    if (this.token) return this.token;
    this.status = "uploading";
    this.error = null;
    this.emit();
    try {
      if (!this.fingerprint) this.fingerprint = await quickFingerprint(this.file);
      if (!this.uploadId && this.persist) {
        const saved = loadPersisted(this.endpoint, this.fingerprint);
        if (saved && saved.size === this.file.size && saved.lastModified === this.file.lastModified) {
          this.uploadId = saved.uploadId;
          this.chunkSize = saved.chunkSize;
          this.resumed = true;
        }
      }
      for (; ; ) {
        try {
          if (!this.uploadId) await this.createSession(signal);
          else if (await this.syncStatus(signal) === "completed") break;
          this.emit();
          await this.runParts(signal);
          await this.complete(signal);
          break;
        } catch (error) {
          if (!(error instanceof ExpiredSessionError) || this.restarts >= 1) throw error;
          this.restarts += 1;
          this.uploadId = null;
          this.resumed = false;
          this.received.clear();
          if (this.persist) removePersisted(this.endpoint, this.fingerprint);
        }
      }
      this.status = "completed";
      if (this.persist) removePersisted(this.endpoint, this.fingerprint);
      this.emit();
      return this.token;
    } catch (error) {
      this.status = isAbort(error) ? "canceled" : "failed";
      this.error = isAbort(error) ? null : error.message;
      this.emit();
      throw error;
    }
  }
  pause() {
    if (this.status !== "uploading" || this.pauseGate) return false;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    this.pauseGate = { promise, resolve };
    for (const entry of this.inflight.values()) entry.controller.abort();
    this.status = "paused";
    this.emit();
    return true;
  }
  async resume(signal) {
    if (!this.pauseGate) return false;
    if (this.uploadId) await this.syncStatus(signal);
    const gate = this.pauseGate;
    this.pauseGate = null;
    this.status = "uploading";
    gate.resolve();
    this.emit();
    return true;
  }
  /** Cancelamento explícito: interrompe e pede ao servidor para descartar a sessão. */
  async discard() {
    for (const entry of this.inflight.values()) entry.controller.abort();
    if (this.persist && this.fingerprint) removePersisted(this.endpoint, this.fingerprint);
    if (!this.uploadId || this.token) return;
    try {
      await this.request("DELETE", `${this.endpoint}/${encodeURIComponent(this.uploadId)}`, {});
    } catch {
    }
  }
};

// src/chunks/index.js
var CHUNK_ATTRIBUTES = [
  "data-form-chunk-endpoint",
  "data-form-chunk-size",
  "data-form-chunk-concurrency",
  "data-form-chunk-retries",
  "data-form-chunk-persist",
  "data-form-chunk-checksum"
];
var MIN_CHUNK = 64 * 1024;
var MAX_CHUNK = 100 * 1024 * 1024;
function readChunkConfig(field) {
  const attr = (name) => field.groupAttribute(name);
  const endpoint = attr("data-form-chunk-endpoint");
  if (!endpoint) throw new ConfigError("data-form-chunked exige data-form-chunk-endpoint.");
  const chunkSize = attr("data-form-chunk-size") ? parseSize(attr("data-form-chunk-size")) : 5 * 1024 * 1024;
  if (chunkSize < MIN_CHUNK || chunkSize > MAX_CHUNK) throw new ConfigError(`data-form-chunk-size deve estar entre ${formatBytes(MIN_CHUNK, { binary: true })} e ${formatBytes(MAX_CHUNK, { binary: true })}.`);
  return {
    endpoint,
    chunkSize,
    concurrency: attr("data-form-chunk-concurrency") ? parseInteger(attr("data-form-chunk-concurrency"), "data-form-chunk-concurrency", { min: 1, max: 6 }) : 3,
    retries: attr("data-form-chunk-retries") ? parseInteger(attr("data-form-chunk-retries"), "data-form-chunk-retries", { min: 0, max: 10 }) : 5,
    persist: attr("data-form-chunk-persist") !== null ? parseBool(attr("data-form-chunk-persist"), "data-form-chunk-persist") : false,
    checksum: attr("data-form-chunk-checksum") !== null ? parseBool(attr("data-form-chunk-checksum"), "data-form-chunk-checksum") : true
  };
}
var ChunkExtension = class {
  constructor(controller) {
    this.controller = controller;
    this.uploads = /* @__PURE__ */ new Map();
    this.active = null;
  }
  chunkFields() {
    return Array.from(this.controller.fields.values()).filter((f) => f.kind === "file" && f.groupAttribute("data-form-chunked") !== null && !f.disabled);
  }
  uploadFor(field, item, config) {
    const existing = this.uploads.get(item.id);
    if (existing && existing.file === item.file) return existing;
    const upload = new ChunkUpload({
      file: item.file,
      endpoint: config.endpoint,
      chunkSize: config.chunkSize,
      concurrency: config.concurrency,
      retries: config.retries,
      persist: config.persist && this.controller.storageAllowed,
      checksum: config.checksum,
      transport: this.controller.transportFor("chunk"),
      headers: (url) => this.controller.securityHeaders(url),
      onChange: () => this.publish()
    });
    upload.fieldKey = field.key;
    this.uploads.set(item.id, upload);
    return upload;
  }
  publish() {
    const state = this.controller.state;
    const byField = {};
    for (const upload of this.uploads.values()) {
      if (!byField[upload.fieldKey]) byField[upload.fieldKey] = { status: "idle", files: [] };
      byField[upload.fieldKey].files.push(upload.snapshot());
    }
    for (const [key, entry] of Object.entries(byField)) {
      const statuses = entry.files.map((f) => f.status);
      entry.status = statuses.includes("failed") ? "failed" : statuses.includes("uploading") ? "uploading" : statuses.includes("paused") ? "paused" : statuses.every((s) => s === "completed") ? "completed" : "idle";
      const field = this.controller.fields.get(key);
      const config = field ? safeConfig(field) : null;
      entry.resumable = config?.persist && this.controller.storageAllowed ? listPersisted(config.endpoint.replace(/\/+$/, "")) : [];
    }
    state.uploads = byField;
    if (this.active) this.active.report();
  }
  async beforeSend(ctx) {
    const fields = this.chunkFields();
    if (!fields.length) return;
    const jobs = [];
    for (const field of fields) {
      const config = readChunkConfig(field);
      const items = field.files.newItems();
      const live = new Set(items.map((i) => i.id));
      for (const [id, upload] of this.uploads) if (upload.fieldKey === field.key && !live.has(id)) this.uploads.delete(id);
      jobs.push({ field, uploads: items.map((item) => this.uploadFor(field, item, config)) });
    }
    const all = jobs.flatMap((j) => j.uploads);
    if (!all.length) return;
    const total = all.reduce((sum, u) => sum + u.file.size, 0);
    const tracker = this.controller.tracker;
    tracker.start();
    ctx.keepProgress = true;
    ctx.setPhase("uploading");
    const local = new AbortController();
    const onAbort = () => local.abort();
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    this.active = {
      signal: local.signal,
      report: () => {
        const loaded = all.reduce((sum, u) => sum + u.loaded, 0);
        tracker.update({ loaded, total, lengthComputable: total > 0 });
        ctx.setProgress(tracker.snapshot());
      }
    };
    this.publish();
    try {
      const results = await Promise.all(all.map((upload) => upload.start(local.signal)));
      let index = 0;
      for (const job of jobs) {
        ctx.replacements.set(job.field, results.slice(index, index + job.uploads.length));
        index += job.uploads.length;
      }
      this.active.report();
    } catch (error) {
      local.abort();
      if (ctx.signal.aborted || isAbort(error)) {
        await Promise.all(all.map((u) => u.discard()));
        throw new AbortError();
      }
      const failed = all.find((u) => u.status === "failed");
      const name = failed?.file.name ?? "";
      throw new OperationalError(`${this.controller.formMessage("upload.failed", { file: name })} ${error.message}`.trim(), { kind: "upload-failed", cause: error });
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
      this.active = null;
      this.publish();
    }
  }
  selected(name) {
    if (name == null) return Array.from(this.uploads.values());
    const field = this.controller.resolveField(name);
    if (!field) throw new ConfigError(`Campo "${name}" n\xE3o encontrado.`);
    return Array.from(this.uploads.values()).filter((u) => u.fieldKey === field.key);
  }
  async pauseUpload(name) {
    const paused = this.selected(name).map((u) => u.pause()).some(Boolean);
    if (paused && this.controller.state.phase === "uploading") this.controller.setPhase("paused");
    return paused;
  }
  async resumeUpload(name) {
    if (!this.active) throw new StateError("Nenhum upload em andamento para retomar. Envie o formul\xE1rio novamente para retomar uma sess\xE3o salva.");
    const results = await Promise.all(this.selected(name).map((u) => u.resume(this.active.signal)));
    const resumed = results.some(Boolean);
    if (resumed && this.controller.state.phase === "paused") this.controller.setPhase("uploading");
    return resumed;
  }
  getUploadSession(name) {
    return this.selected(name).map((u) => u.snapshot());
  }
  cancel() {
    return false;
  }
  destroy() {
    for (const upload of this.uploads.values()) for (const entry of upload.inflight.values()) entry.controller.abort();
    this.uploads.clear();
  }
};
function safeConfig(field) {
  try {
    return readChunkConfig(field);
  } catch {
    return null;
  }
}
function chunksPlugin(AlpineForm) {
  AlpineForm.fieldAttributes(CHUNK_ATTRIBUTES);
  AlpineForm.internals.setChunkService({ readChunkConfig });
  AlpineForm.formHook((controller) => new ChunkExtension(controller));
}
export {
  CHUNK_ATTRIBUTES,
  ChunkUpload,
  chunksPlugin as default,
  listPersisted,
  manifestOf,
  quickFingerprint,
  sha256Hex
};
