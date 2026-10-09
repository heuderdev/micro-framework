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

// src/masks/pattern-engine.js
var DEFAULT_TOKENS = {
  9: { test: (ch) => /[0-9]/.test(ch) },
  A: { test: (ch) => new RegExp("\\p{L}", "u").test(ch) },
  "*": { test: (ch) => /[\p{L}0-9]/u.test(ch) }
};
function compilePattern(pattern, { tokens = DEFAULT_TOKENS, transform = null } = {}) {
  if (typeof pattern !== "string" || pattern.length === 0) throw new ConfigError("Padr\xE3o de m\xE1scara vazio.");
  if (pattern.length > 100) throw new ConfigError("Padr\xE3o de m\xE1scara excede 100 caracteres.");
  const slots = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === void 0) throw new ConfigError(`Padr\xE3o "${pattern}" termina com "\\" sem caractere escapado.`);
      slots.push({ literal: true, char: next });
      i += 1;
      continue;
    }
    const token = tokens[ch];
    if (token) slots.push({ literal: false, test: token.test, transform: token.transform || transform });
    else slots.push({ literal: true, char: ch });
  }
  if (!slots.some((slot) => !slot.literal)) throw new ConfigError(`Padr\xE3o "${pattern}" n\xE3o possui nenhum token (9, A ou *).`);
  return { pattern, slots, tokenCount: slots.filter((s) => !s.literal).length };
}
function applySlots(input, compiled) {
  const slots = compiled.slots;
  let formatted = "";
  let raw = "";
  let pending = "";
  let slotIndex = 0;
  let consumed = 0;
  const tokenEnds = [];
  const text = String(input ?? "");
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length && slotIndex < slots.length) {
    const slot = slots[slotIndex];
    const ch = chars[i];
    if (slot.literal) {
      pending += slot.char;
      slotIndex += 1;
      if (ch === slot.char) {
        i += 1;
        consumed = i;
      }
      continue;
    }
    const value = slot.transform ? slot.transform(ch) : ch;
    if (slot.test(value)) {
      formatted += pending + value;
      pending = "";
      raw += value;
      tokenEnds.push(formatted.length);
      slotIndex += 1;
      i += 1;
      consumed = i;
    } else {
      i += 1;
    }
  }
  return { formatted, raw, complete: raw.length === compiled.tokenCount, tokenEnds, consumed };
}
function acceptedBefore(input, caret, compiled) {
  const prefix = Array.from(String(input ?? "").slice(0, caret)).join("");
  return applySlots(prefix, compiled).raw.length;
}
function caretAfterTokens(result, count) {
  if (count <= 0) return 0;
  if (count > result.tokenEnds.length) return result.formatted.length;
  return result.tokenEnds[count - 1];
}
function formatWithCaret(input, caret, compiled) {
  const result = applySlots(input, compiled);
  const position = caret == null ? result.formatted.length : caretAfterTokens(result, acceptedBefore(input, caret, compiled));
  return { ...result, caret: position };
}
function deleteAcrossLiteral(value, caret, direction, isSignificant) {
  const text = String(value);
  if (direction === "backward") {
    if (caret <= 0 || isSignificant(text[caret - 1], caret - 1)) return null;
    let j2 = caret - 1;
    while (j2 >= 0 && !isSignificant(text[j2], j2)) j2 -= 1;
    if (j2 < 0) return null;
    return { value: text.slice(0, j2) + text.slice(j2 + 1), caret: j2 };
  }
  if (caret >= text.length || isSignificant(text[caret], caret)) return null;
  let j = caret;
  while (j < text.length && !isSignificant(text[j], j)) j += 1;
  if (j >= text.length) return null;
  return { value: text.slice(0, j) + text.slice(j + 1), caret };
}
function tokenPositions(formatted, compiled) {
  const result = applySlots(formatted, compiled);
  return new Set(result.tokenEnds.map((end) => end - 1));
}

// src/masks/numeric-engine.js
function localeSymbols(locale, { style = "decimal", currency = "BRL" } = {}) {
  let numberParts;
  try {
    numberParts = new Intl.NumberFormat(locale).formatToParts(1234567891e-3);
  } catch {
    throw new ConfigError(`Locale "${locale}" n\xE3o suportado pelo Intl deste navegador.`);
  }
  const group = numberParts.find((p) => p.type === "group")?.value ?? "";
  const decimal = numberParts.find((p) => p.type === "decimal")?.value ?? ".";
  let prefix = "";
  let suffix = "";
  let currencyDigits = 2;
  if (style === "currency") {
    let parts;
    try {
      const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
      parts = fmt.formatToParts(1);
      currencyDigits = fmt.resolvedOptions().maximumFractionDigits;
    } catch {
      throw new ConfigError(`Moeda "${currency}" inv\xE1lida para Intl.NumberFormat.`);
    }
    const firstNumber = parts.findIndex((p) => p.type === "integer");
    const lastNumber = parts.map((p) => p.type).lastIndexOf(parts.some((p) => p.type === "fraction") ? "fraction" : "integer");
    prefix = parts.slice(0, firstNumber).map((p) => p.value).join("");
    suffix = parts.slice(lastNumber + 1).map((p) => p.value).join("");
  } else if (style === "percent") {
    const parts = new Intl.NumberFormat(locale, { style: "percent" }).formatToParts(0.12);
    const firstNumber = parts.findIndex((p) => p.type === "integer");
    const lastNumber = parts.map((p) => p.type).lastIndexOf("integer");
    prefix = parts.slice(0, firstNumber).map((p) => p.value).join("");
    suffix = parts.slice(lastNumber + 1).map((p) => p.value).join("");
  }
  return { group, decimal, prefix, suffix, currencyDigits };
}
function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}
var NumericEngine = class {
  constructor({ locale = "pt-BR", style = "decimal", currency = "BRL", scale = null, allowNegative = false, maxDigits = 15, pad: pad2 = false, grouping = true } = {}) {
    const symbols = localeSymbols(locale, { style, currency });
    this.symbols = symbols;
    this.scale = scale == null ? style === "currency" ? symbols.currencyDigits : style === "integer" ? 0 : 2 : scale;
    if (!Number.isInteger(this.scale) || this.scale < 0 || this.scale > 10) throw new ConfigError("data-form-mask-scale deve ser inteiro entre 0 e 10.");
    if (!Number.isInteger(maxDigits) || maxDigits < 1 || maxDigits > 30) throw new ConfigError("data-form-mask-max-digits deve ser inteiro entre 1 e 30.");
    this.allowNegative = allowNegative;
    this.maxDigits = maxDigits;
    this.pad = pad2;
    this.grouping = grouping;
  }
  /** Extrai sinal, parte inteira e fração a partir de texto livre. */
  parse(input, { paste = false } = {}) {
    let text = String(input ?? "");
    const { decimal, prefix, suffix } = this.symbols;
    if (prefix && text.includes(prefix.trim())) text = text.split(prefix.trim()).join("");
    if (suffix && suffix.trim() && text.includes(suffix.trim())) text = text.split(suffix.trim()).join("");
    const minusCount = (text.match(/[-−]/g) || []).length;
    const negative = this.allowNegative && minusCount % 2 === 1;
    let decimalChar = this.scale > 0 ? decimal : null;
    if (paste && this.scale > 0 && decimal !== "." && !text.includes(decimal)) {
      const compact = text.replace(/[\s  -]/g, "");
      const m = /^\d+\.(\d+)$/.exec(compact);
      if (m && m[1].length !== 3 && m[1].length <= this.scale) decimalChar = ".";
    }
    let intDigits = "";
    let fracDigits = "";
    let hasDecimal = false;
    const lastDecimal = decimalChar ? text.lastIndexOf(decimalChar) : -1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (i === lastDecimal) {
        hasDecimal = true;
        continue;
      }
      if (!isDigit(ch)) continue;
      if (hasDecimal) fracDigits += ch;
      else intDigits += ch;
    }
    intDigits = intDigits.replace(/^0+(?=\d)/, "");
    if (intDigits.length > this.maxDigits) intDigits = intDigits.slice(0, this.maxDigits);
    fracDigits = fracDigits.slice(0, this.scale);
    return { negative, intDigits, fracDigits, hasDecimal: hasDecimal && this.scale > 0, onlySign: minusCount > 0 && !intDigits && !fracDigits };
  }
  groupInt(intDigits) {
    if (!this.grouping || !this.symbols.group) return intDigits;
    let out = "";
    for (let i = 0; i < intDigits.length; i++) {
      const fromEnd = intDigits.length - i;
      out += intDigits[i];
      if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += this.symbols.group;
    }
    return out;
  }
  render(parsed, { padFraction = false } = {}) {
    const { prefix, suffix, decimal } = this.symbols;
    if (!parsed.intDigits && !parsed.fracDigits && !parsed.hasDecimal) {
      return parsed.onlySign && this.allowNegative ? "-" : "";
    }
    const intPart = parsed.intDigits || "0";
    let frac = parsed.fracDigits;
    let showDecimal = parsed.hasDecimal;
    if (padFraction && this.scale > 0) {
      frac = frac.padEnd(this.scale, "0");
      showDecimal = true;
    }
    const sign = parsed.negative ? "-" : "";
    return `${sign}${prefix}${this.groupInt(intPart)}${showDecimal ? decimal + frac : ""}${suffix}`;
  }
  isSignificant(ch) {
    return isDigit(ch) || ch === this.symbols.decimal || ch === "-";
  }
  format(input, caret = null, { paste = false } = {}) {
    const parsed = this.parse(input, { paste });
    const value = this.render(parsed);
    let position = value.length - this.symbols.suffix.length;
    if (caret != null) {
      const before = String(input ?? "").slice(0, caret);
      const sigBefore = this.countSignificant(before, paste);
      position = this.positionAfterSignificant(value, sigBefore);
    }
    return { value, caret: Math.max(0, Math.min(position, value.length - this.symbols.suffix.length)), parsed };
  }
  countSignificant(text, paste) {
    const parsed = this.parse(text, { paste });
    let count = (parsed.negative ? 1 : 0) + parsed.intDigits.length + parsed.fracDigits.length + (parsed.hasDecimal ? 1 : 0);
    if (!parsed.intDigits && parsed.hasDecimal) count += 1;
    return count;
  }
  positionAfterSignificant(value, count) {
    if (count <= 0) {
      const start = value.startsWith("-") ? 1 : 0;
      return Math.min(value.length, start + this.symbols.prefix.length);
    }
    let seen = 0;
    for (let i = 0; i < value.length; i++) {
      if (this.isSignificant(value[i])) {
        seen += 1;
        if (seen === count) return i + 1;
      }
    }
    return value.length - this.symbols.suffix.length;
  }
  represent(display) {
    const parsed = this.parse(display);
    const formatted = this.render(parsed);
    if (!parsed.intDigits && !parsed.fracDigits) return { raw: "", formatted, canonical: "" };
    const sign = parsed.negative ? "-" : "";
    const raw = `${sign}${parsed.intDigits}${parsed.fracDigits}`;
    const intPart = parsed.intDigits || "0";
    const frac = this.scale > 0 ? "." + parsed.fracDigits.padEnd(this.scale, "0") : "";
    const isZero = /^0*$/.test(intPart + parsed.fracDigits);
    return { raw, formatted, canonical: `${isZero ? "" : sign}${intPart}${frac}` };
  }
  fromCanonical(text) {
    const value = String(text ?? "").trim();
    if (value === "") return "";
    const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(value);
    if (!m) throw new ConfigError(`Valor can\xF4nico inv\xE1lido para m\xE1scara num\xE9rica: "${value}". Use o formato 1234.56.`);
    const parsed = {
      negative: this.allowNegative && m[1] === "-",
      intDigits: m[2].replace(/^0+(?=\d)/, ""),
      fracDigits: (m[3] || "").slice(0, this.scale),
      hasDecimal: !!m[3] && this.scale > 0,
      onlySign: false
    };
    return this.render(parsed, { padFraction: this.pad });
  }
  padded(display) {
    const parsed = this.parse(display);
    if (!parsed.intDigits && !parsed.fracDigits) return this.render(parsed);
    return this.render(parsed, { padFraction: this.pad });
  }
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

// src/lib/date.js
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
function parseDate(text, format = "iso") {
  const m = format === "br" ? BR_DATE.exec(text) : ISO_DATE.exec(text);
  if (!m) return null;
  const [y, mo, d] = format === "br" ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]];
  if (!validYmd(y, mo, d)) return null;
  return make("date", { y, m: mo, d }, y * 1e4 + mo * 100 + d);
}
function parseDateTime(text, format = "iso") {
  const m = format === "br" ? BR_DATETIME.exec(text) : ISO_DATETIME.exec(text);
  if (!m) return null;
  const [y, mo, d] = format === "br" ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]];
  const h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (!validYmd(y, mo, d) || !validHms(h, mi, s)) return null;
  return make("datetime", { y, m: mo, d, h, mi, s }, (y * 1e4 + mo * 100 + d) * 1e6 + h * 1e4 + mi * 100 + s);
}
function parseTime(text) {
  const m = TIME.exec(text);
  if (!m) return null;
  const h = +m[1], mi = +m[2], s = +(m[3] || 0);
  if (!validHms(h, mi, s)) return null;
  return make("time", { h, mi, s }, h * 3600 + mi * 60 + s);
}
function parseMonth(text, format = "iso") {
  const m = format === "br" ? MONTH_BR.exec(text) : MONTH_ISO.exec(text);
  if (!m) return null;
  const [y, mo] = format === "br" ? [+m[2], +m[1]] : [+m[1], +m[2]];
  if (y < 1 || y > 9999 || mo < 1 || mo > 12) return null;
  return make("month", { y, m: mo }, y * 100 + mo);
}
function parseWeek(text) {
  const m = WEEK.exec(text);
  if (!m) return null;
  const y = +m[1], w = +m[2];
  if (y < 1 || w < 1 || w > isoWeeksInYear(y)) return null;
  return make("week", { y, w }, y * 100 + w);
}
function parseByKind(text, kind, format = "iso") {
  if (typeof text !== "string") return null;
  const value = text.trim();
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

// src/masks/definitions.js
var UPPER_ALNUM = { X: { test: (ch) => /[0-9A-Z]/.test(ch), transform: (ch) => ch.toUpperCase() } };
function patternMask({ name, choose, inputmode = "text", defaults, canonical = (r) => r.raw, fromCanonical = null, dateKind = null, placeholderPattern = null }) {
  return {
    name,
    inputmode,
    defaults,
    dateKind,
    numeric: false,
    placeholderPattern,
    format(input, caret = null) {
      const compiled = choose(String(input ?? ""));
      const result = formatWithCaret(String(input ?? ""), caret, compiled);
      return { value: result.formatted, caret: result.caret };
    },
    represent(display) {
      const compiled = choose(String(display ?? ""));
      const result = applySlots(String(display ?? ""), compiled);
      return { raw: result.raw, formatted: result.formatted, canonical: canonical(result, compiled) };
    },
    fromValue(text, as = "display") {
      if (as === "canonical" && fromCanonical) return fromCanonical(String(text ?? ""), this);
      return this.format(String(text ?? "")).value;
    },
    deleteAcrossLiteral(value, caret, direction) {
      const positions = tokenPositions(value, choose(value));
      return deleteAcrossLiteral(value, caret, direction, (ch, index) => positions.has(index));
    }
  };
}
var DOC_DEFAULTS = { validation: "raw", submit: "formatted" };
var single = (pattern) => {
  const compiled = compilePattern(pattern);
  return () => compiled;
};
function significant(input, test) {
  let count = 0;
  for (const ch of input) if (test(ch)) count += 1;
  return count;
}
function createCpf() {
  return patternMask({ name: "cpf", choose: single("999.999.999-99"), inputmode: "numeric", defaults: DOC_DEFAULTS, placeholderPattern: "999.999.999-99" });
}
var CNPJ = compilePattern("XX.XXX.XXX/XXXX-99", { tokens: { ...DEFAULT_TOKENS, ...UPPER_ALNUM } });
var CPF = compilePattern("999.999.999-99");
function createCnpj() {
  return patternMask({ name: "cnpj", choose: () => CNPJ, inputmode: "text", defaults: DOC_DEFAULTS, placeholderPattern: "99.999.999/9999-99" });
}
function createCpfCnpj() {
  const choose = (input) => {
    const hasLetter = /[A-Za-z]/.test(input);
    const count = significant(input, (ch) => /[0-9A-Za-z]/.test(ch));
    return hasLetter || count > 11 ? CNPJ : CPF;
  };
  return patternMask({ name: "cpf_cnpj", choose, inputmode: "text", defaults: DOC_DEFAULTS });
}
function createCep() {
  return patternMask({ name: "cep", choose: single("99999-999"), inputmode: "numeric", defaults: DOC_DEFAULTS, placeholderPattern: "99999-999" });
}
var PHONE_FIXO = compilePattern("(99) 9999-9999");
var PHONE_CELULAR = compilePattern("(99) 99999-9999");
function createTelefoneFixo() {
  return patternMask({ name: "telefone_fixo", choose: () => PHONE_FIXO, inputmode: "tel", defaults: DOC_DEFAULTS, placeholderPattern: "(99) 9999-9999" });
}
function createCelular() {
  return patternMask({ name: "celular", choose: () => PHONE_CELULAR, inputmode: "tel", defaults: DOC_DEFAULTS, placeholderPattern: "(99) 99999-9999" });
}
function createTelefoneBr() {
  const choose = (input) => significant(input, (ch) => ch >= "0" && ch <= "9") > 10 ? PHONE_CELULAR : PHONE_FIXO;
  return patternMask({ name: "telefone_br", choose, inputmode: "tel", defaults: DOC_DEFAULTS });
}
function cardPattern(gaps, maxLength) {
  let remaining = maxLength;
  const groups = [];
  for (const gap of gaps) {
    if (remaining <= 0) break;
    const size = Math.min(gap, remaining);
    groups.push("9".repeat(size));
    remaining -= size;
  }
  return compilePattern(groups.join(" "));
}
function createCard(config) {
  const allowed = config.cardBrands;
  const cache = /* @__PURE__ */ new Map();
  const choose = (input) => {
    const digits = input.replace(/\D+/g, "");
    const brand = detectBrand(digits, allowed) || GENERIC_CARD;
    const key = brand.name || "generic";
    if (!cache.has(key)) cache.set(key, cardPattern(brand.gaps, Math.max(...brand.lengths)));
    return cache.get(key);
  };
  const mask = patternMask({ name: "card", choose, inputmode: "numeric", defaults: { validation: "raw", submit: "raw" } });
  mask.brand = (display) => detectBrand(String(display ?? "").replace(/\D+/g, ""), allowed)?.name ?? null;
  return mask;
}
function dateLike(name, pattern, kind, toIso, fromIso) {
  const compiled = compilePattern(pattern);
  return patternMask({
    name,
    choose: () => compiled,
    inputmode: "numeric",
    dateKind: kind,
    defaults: { validation: "canonical", submit: "canonical" },
    placeholderPattern: pattern,
    canonical: (result) => {
      if (!result.complete) return result.formatted;
      return toIso(result.formatted) || result.formatted;
    },
    fromCanonical: (text) => {
      const parsed = parseByKind(text, kind, "iso");
      if (parsed) return applySlots(fromIso(parsed), compiled).formatted;
      return applySlots(text, compiled).formatted;
    }
  });
}
function createDate() {
  return dateLike("date", "99/99/9999", "date", (text) => formatIso(parseByKind(text, "date", "br")), (parsed) => formatBr(parsed));
}
function createTime() {
  return dateLike("time", "99:99", "time", (text) => parseByKind(text, "time") ? text : null, (parsed) => formatIso(parsed));
}
function createMonthYear() {
  return dateLike("month_year", "99/9999", "month", (text) => formatIso(parseByKind(text, "month", "br")), (parsed) => formatBr(parsed));
}
function createPattern(config) {
  if (!config.pattern) throw new ConfigError('data-form-mask="pattern" exige data-form-mask-pattern.');
  const transform = config.case === "upper" ? (ch) => ch.toUpperCase() : config.case === "lower" ? (ch) => ch.toLowerCase() : null;
  const compiled = compilePattern(config.pattern, { transform });
  return patternMask({ name: "pattern", choose: () => compiled, inputmode: "text", defaults: { validation: "formatted", submit: "formatted" }, placeholderPattern: config.pattern });
}
function numericMask(name, style, config, defaults) {
  const engine = new NumericEngine({
    locale: config.locale,
    style,
    currency: config.currency,
    scale: style === "integer" ? 0 : config.scale,
    allowNegative: config.negative,
    maxDigits: config.maxDigits,
    pad: config.pad ?? defaults.pad,
    grouping: config.grouping ?? true
  });
  return {
    name,
    numeric: true,
    dateKind: null,
    inputmode: style === "integer" ? "numeric" : "decimal",
    defaults: { validation: "canonical", submit: "canonical" },
    engine,
    format(input, caret = null, options = {}) {
      const result = engine.format(input, caret, options);
      return { value: result.value, caret: result.caret };
    },
    represent: (display) => engine.represent(display),
    fromValue(text, as = "display") {
      const value = String(text ?? "");
      if (as === "canonical" || as === "raw" && /^[+-]?\d+(\.\d+)?$/.test(value.trim())) return engine.fromCanonical(value);
      return engine.format(value).value;
    },
    onBlur: (value) => engine.padded(value),
    deleteAcrossLiteral(value, caret, direction) {
      return deleteAcrossLiteral(value, caret, direction, (ch) => engine.isSignificant(ch));
    }
  };
}
var createInteger = (config) => numericMask("integer", "integer", config, { pad: false });
var createDecimal = (config) => numericMask("decimal", "decimal", config, { pad: false });
var createCurrency = (config) => numericMask("currency", "currency", config, { pad: true });
var createPercent = (config) => numericMask("percent", "percent", config, { pad: false });
var BUILTIN_MASKS = {
  cpf: createCpf,
  cnpj: createCnpj,
  cpf_cnpj: createCpfCnpj,
  cep: createCep,
  telefone_fixo: createTelefoneFixo,
  celular: createCelular,
  telefone_br: createTelefoneBr,
  card: createCard,
  date: createDate,
  time: createTime,
  month_year: createMonthYear,
  integer: createInteger,
  decimal: createDecimal,
  currency: createCurrency,
  percent: createPercent,
  pattern: createPattern
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
var BINARY_STEPS = [["TiB", 1024 ** 4], ["GiB", 1024 ** 3], ["MiB", 1024 ** 2], ["KiB", 1024]];

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
  debug: { attr: "data-form-debug", type: "bool", default: false }
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
function parseList(raw) {
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}

// src/masks/runtime.js
var MASK_ATTRIBUTES = [
  "data-form-mask-pattern",
  "data-form-mask-placeholder",
  "data-form-mask-locale",
  "data-form-mask-currency",
  "data-form-mask-scale",
  "data-form-mask-negative",
  "data-form-mask-max-digits",
  "data-form-mask-pad",
  "data-form-mask-grouping",
  "data-form-mask-case",
  "data-form-mask-card-brands"
];
function readMaskConfig(field) {
  const attr = (name) => field.groupAttribute(name);
  const bool = (name) => attr(name) === null ? null : parseBool(attr(name), name);
  const caseAttr = attr("data-form-mask-case");
  if (caseAttr !== null && !["upper", "lower"].includes(caseAttr)) throw new ConfigError('data-form-mask-case deve ser "upper" ou "lower".');
  const placeholder = attr("data-form-mask-placeholder");
  if (placeholder !== null && Array.from(placeholder).length !== 1) throw new ConfigError('data-form-mask-placeholder deve ser um \xFAnico caractere, ex.: "_".');
  return {
    pattern: attr("data-form-mask-pattern"),
    placeholder,
    locale: attr("data-form-mask-locale") || field.controller.config.locale || "pt-BR",
    currency: (attr("data-form-mask-currency") || "BRL").toUpperCase(),
    scale: attr("data-form-mask-scale") === null ? null : parseInteger(attr("data-form-mask-scale"), "data-form-mask-scale", { min: 0, max: 10 }),
    negative: bool("data-form-mask-negative") ?? false,
    maxDigits: attr("data-form-mask-max-digits") === null ? 15 : parseInteger(attr("data-form-mask-max-digits"), "data-form-mask-max-digits", { min: 1, max: 30 }),
    pad: bool("data-form-mask-pad"),
    grouping: bool("data-form-mask-grouping"),
    case: caseAttr,
    cardBrands: attr("data-form-mask-card-brands") ? parseList(attr("data-form-mask-card-brands")) : null
  };
}
function placeholderFrom(pattern, char) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      out += pattern[i + 1] ?? "";
      i += 1;
    } else out += ch === "9" || ch === "A" || ch === "*" || ch === "X" ? char : ch;
  }
  return out;
}
function attachMask(field, name, registry) {
  const factory = registry.get("mask", name);
  if (!factory) throw new ConfigError(`M\xE1scara desconhecida "${name}". Registradas: ${registry.names("mask").join(", ")}.`);
  const el = field.primary;
  const config = readMaskConfig(field);
  const mask = factory(config, { field: field.infoForValidators?.() ?? null, element: el });
  for (const method of ["format", "represent", "fromValue"]) {
    if (typeof mask?.[method] !== "function") throw new ConfigError(`A m\xE1scara "${name}" n\xE3o implementa ${method}().`);
  }
  const original = { inputmode: el.getAttribute("inputmode"), placeholder: el.getAttribute("placeholder") };
  const added = { inputmode: false, placeholder: false };
  if (mask.inputmode && original.inputmode === null) {
    el.setAttribute("inputmode", mask.inputmode);
    added.inputmode = true;
  }
  if (config.placeholder && original.placeholder === null && mask.placeholderPattern) {
    el.setAttribute("placeholder", placeholderFrom(mask.placeholderPattern, config.placeholder));
    added.placeholder = true;
  }
  let pasting = false;
  const isFocused = () => el.ownerDocument.activeElement === el;
  const setCaret = (position) => {
    if (!isFocused() || typeof el.setSelectionRange !== "function") return;
    try {
      el.setSelectionRange(position, position);
    } catch {
    }
  };
  const reformat = () => {
    const result = mask.format(el.value, null);
    if (result.value !== el.value) el.value = result.value;
  };
  reformat();
  return {
    name,
    mask,
    numeric: !!mask.numeric,
    dateKind: mask.dateKind || null,
    defaults: mask.defaults || { validation: "canonical", submit: "canonical" },
    represent: (display) => mask.represent(display),
    setFrom(text, as = "display") {
      el.value = mask.fromValue(text, as);
    },
    handleBeforeInput(event) {
      if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") pasting = true;
      const backward = event.inputType === "deleteContentBackward";
      const forward = event.inputType === "deleteContentForward";
      if (!(backward || forward) || typeof mask.deleteAcrossLiteral !== "function") return;
      const start = el.selectionStart;
      if (start == null || start !== el.selectionEnd) return;
      const result = mask.deleteAcrossLiteral(el.value, start, backward ? "backward" : "forward");
      if (!result) return;
      event.preventDefault();
      const formatted = mask.format(result.value, result.caret);
      el.value = formatted.value;
      setCaret(formatted.caret);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: event.inputType }));
    },
    handleInput(event) {
      const paste = pasting || event?.inputType === "insertFromPaste" || event?.inputType === "insertFromDrop";
      pasting = false;
      const value = el.value;
      const caret = isFocused() && el.selectionStart != null ? el.selectionStart : null;
      const result = mask.format(value, caret, { paste });
      if (result.value !== value) el.value = result.value;
      if (caret != null) setCaret(result.caret);
    },
    handleChange() {
      reformat();
    },
    handleBlur() {
      if (typeof mask.onBlur !== "function") return;
      const next = mask.onBlur(el.value);
      if (next !== el.value) {
        el.value = next;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }));
      }
    },
    afterReset() {
      reformat();
    },
    destroy() {
      if (added.inputmode) el.removeAttribute("inputmode");
      if (added.placeholder) el.removeAttribute("placeholder");
    }
  };
}

// src/masks/index.js
function masksPlugin(AlpineForm) {
  for (const [name, factory] of Object.entries(BUILTIN_MASKS)) {
    if (!AlpineForm.registry.has("mask", name)) AlpineForm.mask(name, factory);
  }
  AlpineForm.fieldAttributes(MASK_ATTRIBUTES);
  AlpineForm.internals.setMaskProvider({ attach: (field, name) => attachMask(field, name, AlpineForm.registry) });
}
export {
  NumericEngine,
  applySlots,
  compilePattern,
  masksPlugin as default,
  formatWithCaret,
  patternMask
};
