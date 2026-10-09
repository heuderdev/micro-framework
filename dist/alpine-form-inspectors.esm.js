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
var AbortError = class extends AlpineFormError {
  constructor(message = "Opera\xE7\xE3o cancelada.", details = {}) {
    super(message, details);
    this.name = "AbortError";
    this.kind = "abort";
  }
};

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
var BINARY_STEPS = [["TiB", 1024 ** 4], ["GiB", 1024 ** 3], ["MiB", 1024 ** 2], ["KiB", 1024]];

// src/inspectors/csv.js
function parseCsv(text, delimiter = ",") {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  let fieldStarted = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = "";
      fieldStarted = false;
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      fieldStarted = false;
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    fieldStarted = true;
    i += 1;
  }
  const trailing = field !== "" || record.length > 0 || fieldStarted;
  if (trailing) {
    record.push(field);
    records.push(record);
  }
  return { records, unterminatedQuote: inQuotes, endedWithNewline: !trailing };
}
var CANDIDATES = [",", ";", "	", "|"];
function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === candidate) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
function delimiterFrom(value) {
  if (value == null || value === "auto") return null;
  const map = { tab: "	", pipe: "|", comma: ",", semicolon: ";" };
  if (map[value]) return map[value];
  if (value.length === 1) return value;
  throw new ConfigError(`data-form-csv-delimiter="${value}" inv\xE1lido. Use auto, ",", ";", tab ou pipe.`);
}
async function inspectCsv(file, { signal, attribute = () => null } = {}) {
  const sampleBytes = attribute("data-form-csv-sample") ? parseSize(attribute("data-form-csv-sample")) : 64 * 1024;
  const encoding = attribute("data-form-csv-encoding") || "utf-8";
  const explicit = delimiterFrom(attribute("data-form-csv-delimiter"));
  const sampled = file.size > sampleBytes;
  const buffer = await file.slice(0, Math.min(file.size, sampleBytes)).arrayBuffer();
  if (signal?.aborted) throw new OperationalError("Inspe\xE7\xE3o cancelada.", { kind: "abort" });
  let text;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(buffer, { stream: sampled });
  } catch (error) {
    if (error instanceof RangeError) throw new ConfigError(`Codifica\xE7\xE3o "${encoding}" n\xE3o suportada por TextDecoder.`);
    return { valid: false, reason: "encoding", sampled, sampleBytes };
  }
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  const delimiter = explicit || detectDelimiter(text);
  const parsed = parseCsv(text, delimiter);
  let records = parsed.records;
  if (sampled && !parsed.endedWithNewline && records.length > 1) records = records.slice(0, -1);
  if (sampled && parsed.unterminatedQuote && records.length > 1) records = records.slice(0, -1);
  records = records.filter((r) => !(r.length === 1 && r[0] === ""));
  const headers = records[0] ? records[0].map((h) => h.trim()) : [];
  const widths = new Set(records.map((r) => r.length));
  return {
    valid: headers.length > 0 && (!parsed.unterminatedQuote || sampled) && widths.size <= 1,
    reason: headers.length === 0 ? "empty" : widths.size > 1 ? "columns" : parsed.unterminatedQuote && !sampled ? "quotes" : null,
    headers,
    rowsInSample: Math.max(0, records.length - 1),
    delimiter,
    sampled,
    sampleBytes
  };
}

// src/inspectors/json.js
async function inspectJson(file, { attribute = () => null } = {}) {
  const max = attribute("data-form-json-max") ? parseSize(attribute("data-form-json-max")) : 5 * 1e3 * 1e3;
  if (file.size > max) return { valid: false, reason: "oversize", max };
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { valid: false, reason: "encoding" };
  }
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  try {
    const value = JSON.parse(text);
    return { valid: true, root: Array.isArray(value) ? "array" : value === null ? "null" : typeof value, keys: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [] };
  } catch (error) {
    return { valid: false, reason: "syntax", detail: error.message };
  }
}

// src/inspectors/signatures.js
async function inspectPdf(file) {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = new TextDecoder("latin1").decode(head);
  return { valid: text.includes("%PDF-"), headerOffset: text.indexOf("%PDF-") };
}
var EOCD_SIGNATURE = 101010256;
var CENTRAL_SIGNATURE = 33639248;
async function inspectZipEntries(file) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!(head[0] === 80 && head[1] === 75 && head[2] === 3 && head[3] === 4)) return { zip: false, entries: [] };
  const window = Math.min(file.size, 66 * 1024);
  const tailStart = file.size - window;
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { zip: true, entries: [], unverified: true };
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 4294967295 || cdOffset < tailStart || cdOffset + cdSize > file.size) {
    return { zip: true, entries: [], unverified: true };
  }
  const entries = [];
  const decoder = new TextDecoder("utf-8");
  let p = cdOffset - tailStart;
  const end = p + cdSize;
  while (p + 46 <= end && tail.getUint32(p, true) === CENTRAL_SIGNATURE) {
    const nameLength = tail.getUint16(p + 28, true);
    const extraLength = tail.getUint16(p + 30, true);
    const commentLength = tail.getUint16(p + 32, true);
    const name = decoder.decode(new Uint8Array(tail.buffer, tail.byteOffset + p + 46, nameLength));
    entries.push(name);
    p += 46 + nameLength + extraLength + commentLength;
    if (entries.length > 1e4) break;
  }
  return { zip: true, entries };
}
async function inspectXlsx(file) {
  const zip = await inspectZipEntries(file);
  if (!zip.zip) return { valid: false, reason: "not-zip" };
  if (zip.unverified) return { valid: false, reason: "unverified" };
  const names = new Set(zip.entries);
  return { valid: names.has("[Content_Types].xml") && names.has("xl/workbook.xml"), reason: "entries", entries: zip.entries.length };
}

// src/inspectors/media.js
function inspectMedia(file, { signal, timeout = 15e3 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
      reject(new OperationalError("API de m\xEDdia indispon\xEDvel.", { kind: "unsupported" }));
      return;
    }
    const isVideo = (file.type || "").startsWith("video/");
    const media = document.createElement(isVideo ? "video" : "audio");
    const url = URL.createObjectURL(file);
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      media.removeAttribute("src");
      media.load?.();
      URL.revokeObjectURL(url);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new AbortError());
    };
    media.preload = "metadata";
    media.muted = true;
    media.onloadedmetadata = () => {
      const result = { duration: Number.isFinite(media.duration) ? media.duration : null, width: media.videoWidth || null, height: media.videoHeight || null };
      cleanup();
      resolve(result);
    };
    media.onerror = () => {
      cleanup();
      reject(new OperationalError("O navegador n\xE3o conseguiu ler os metadados da m\xEDdia.", { kind: "decode" }));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new OperationalError("Tempo esgotado ao ler metadados da m\xEDdia.", { kind: "decode" }));
    }, timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
    media.src = url;
  });
}

// src/inspectors/index.js
var INSPECTOR_ATTRIBUTES = ["data-form-csv-delimiter", "data-form-csv-sample", "data-form-csv-encoding", "data-form-json-max"];
var INSPECTOR_MESSAGES = {
  csv: "O arquivo :file n\xE3o parece um CSV v\xE1lido (verificado em amostra).",
  "csv.encoding": "O arquivo :file n\xE3o est\xE1 na codifica\xE7\xE3o esperada.",
  csv_headers: "O arquivo :file deve conter as colunas: :allowed (verificado no cabe\xE7alho).",
  csv_columns: "O arquivo :file deve ter :count colunas (verificado no cabe\xE7alho).",
  json: "O arquivo :file n\xE3o cont\xE9m JSON v\xE1lido.",
  "json.oversize": "O arquivo :file \xE9 grande demais para ser verificado no navegador.",
  json_root: "O JSON de :file deve ter raiz do tipo :type.",
  json_keys: "O JSON de :file deve conter as chaves: :allowed.",
  pdf_signature: "O arquivo :file n\xE3o tem assinatura de PDF.",
  xlsx_signature: "O arquivo :file n\xE3o tem a estrutura de uma planilha XLSX.",
  media_duration_max: "A m\xEDdia :file deve ter no m\xE1ximo :max segundos.",
  media_duration_min: "A m\xEDdia :file deve ter no m\xEDnimo :min segundos.",
  "media.decode": "N\xE3o foi poss\xEDvel ler os metadados de :file neste navegador."
};
function fileRule(inspector, test, varsFor = () => ({}), extra = {}) {
  return {
    async: true,
    ...extra,
    async validate(value, ctx) {
      if (ctx.field.kind !== "file") return ctx.configError(`A regra "${ctx.rule.name}" s\xF3 se aplica a campos de arquivo.`);
      const failed = [];
      for (const item of value || []) {
        let meta;
        try {
          meta = await ctx.inspect(inspector, item);
        } catch (error) {
          if (error?.kind === "abort" || error?.name === "AbortError") throw error;
          if (error?.name === "ConfigError") throw error;
          failed.push({ id: item.id, variant: "decode", vars: { file: item.name } });
          continue;
        }
        const outcome = test(meta, ctx, item);
        if (outcome !== true) failed.push({ id: item.id, variant: outcome?.variant ?? null, vars: { file: item.name, ...varsFor(ctx, meta) } });
      }
      return failed.length ? { valid: false, items: failed } : true;
    }
  };
}
var lower = (list) => list.map((s) => s.trim().toLowerCase());
var INSPECTOR_VALIDATORS = {
  csv: fileRule("csv", (meta) => meta.valid ? true : { variant: meta.reason === "encoding" ? "encoding" : null }),
  csv_headers: fileRule("csv", (meta, ctx) => {
    if (!meta.headers) return { variant: meta.reason === "encoding" ? "encoding" : null };
    const present = new Set(lower(meta.headers));
    return lower(ctx.params.values).every((h) => present.has(h)) || {};
  }, (ctx) => ({ allowed: ctx.params.values.join(", ") }), { rest: { name: "values", type: "string", min: 1 } }),
  csv_columns: fileRule("csv", (meta, ctx) => meta.headers?.length === ctx.params.count ? true : {}, (ctx) => ({ count: ctx.params.count }), { params: [{ name: "count", type: "integer" }] }),
  json: fileRule("json", (meta) => meta.valid ? true : { variant: meta.reason === "oversize" ? "oversize" : null }),
  json_root: fileRule("json", (meta, ctx) => meta.valid && meta.root === ctx.params.type ? true : {}, (ctx) => ({ type: ctx.params.type === "object" ? "objeto" : "lista" }), {
    params: [{ name: "type", type: "enum", values: ["object", "array"] }]
  }),
  json_keys: fileRule("json", (meta, ctx) => meta.valid && ctx.params.values.every((k) => meta.keys.includes(k)) ? true : {}, (ctx) => ({ allowed: ctx.params.values.join(", ") }), {
    rest: { name: "values", type: "string", min: 1 }
  }),
  pdf_signature: fileRule("pdf", (meta) => meta.valid || {}),
  xlsx_signature: fileRule("xlsx", (meta) => meta.valid || {}),
  media_duration_max: fileRule("media", (meta, ctx) => meta.duration != null && meta.duration <= Number(ctx.params.max) ? true : {}, (ctx) => ({ max: ctx.params.max }), {
    params: [{ name: "max", type: "number" }]
  }),
  media_duration_min: fileRule("media", (meta, ctx) => meta.duration != null && meta.duration >= Number(ctx.params.min) ? true : {}, (ctx) => ({ min: ctx.params.min }), {
    params: [{ name: "min", type: "number" }]
  })
};
function inspectorsPlugin(AlpineForm) {
  const inspectors = { csv: inspectCsv, json: inspectJson, pdf: inspectPdf, xlsx: inspectXlsx, media: inspectMedia };
  for (const [name, inspect] of Object.entries(inspectors)) {
    if (!AlpineForm.registry.has("fileInspector", name)) AlpineForm.fileInspector(name, { inspect });
  }
  for (const [name, definition] of Object.entries(INSPECTOR_VALIDATORS)) {
    if (!AlpineForm.registry.has("validator", name)) AlpineForm.validator(name, definition);
  }
  for (const [key, message] of Object.entries(INSPECTOR_MESSAGES)) {
    if (!(key in AlpineForm.messages)) AlpineForm.messages[key] = message;
  }
  for (const name of Object.keys(INSPECTOR_VALIDATORS)) {
    const key = `${name}.decode`;
    if (!(key in AlpineForm.messages)) AlpineForm.messages[key] = "N\xE3o foi poss\xEDvel ler o arquivo :file neste navegador.";
  }
  AlpineForm.fieldAttributes(INSPECTOR_ATTRIBUTES);
}
export {
  INSPECTOR_ATTRIBUTES,
  INSPECTOR_MESSAGES,
  INSPECTOR_VALIDATORS,
  inspectorsPlugin as default,
  detectDelimiter,
  inspectCsv,
  inspectJson,
  inspectMedia,
  inspectPdf,
  inspectXlsx,
  inspectZipEntries,
  parseCsv
};
