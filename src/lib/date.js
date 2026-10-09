/**
 * Parsing estrito de datas civis, sem Date.parse.
 * Valores são tratados como "hora local de parede", sem fuso horário:
 * 2024-03-10T02:30 é comparado como texto estruturado, nunca convertido para UTC.
 */

export const DATE_KINDS = ['date', 'datetime', 'time', 'month', 'week']

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const BR_DATETIME = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const MONTH_ISO = /^(\d{4})-(\d{2})$/
const MONTH_BR = /^(\d{2})\/(\d{4})$/
const WEEK = /^(\d{4})-W(\d{2})$/

export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year, month) {
    return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function validYmd(y, m, d) {
    return y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

function validHms(h, mi, s) {
    return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59
}

/** ISO 8601: o ano tem 53 semanas se 1º de janeiro cai numa quinta, ou numa quarta em ano bissexto. */
export function isoWeeksInYear(year) {
    const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay()
    return jan1 === 4 || (jan1 === 3 && isLeapYear(year)) ? 53 : 52
}

function make(kind, parts, key) {
    return { kind, ...parts, key }
}

export function parseDate(text, format = 'iso') {
    const m = format === 'br' ? BR_DATE.exec(text) : ISO_DATE.exec(text)
    if (!m) return null
    const [y, mo, d] = format === 'br' ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]]
    if (!validYmd(y, mo, d)) return null
    return make('date', { y, m: mo, d }, y * 10000 + mo * 100 + d)
}

export function parseDateTime(text, format = 'iso') {
    const m = format === 'br' ? BR_DATETIME.exec(text) : ISO_DATETIME.exec(text)
    if (!m) return null
    const [y, mo, d] = format === 'br' ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]]
    const h = +m[4], mi = +m[5], s = +(m[6] || 0)
    if (!validYmd(y, mo, d) || !validHms(h, mi, s)) return null
    return make('datetime', { y, m: mo, d, h, mi, s }, ((y * 10000 + mo * 100 + d) * 1e6) + h * 1e4 + mi * 100 + s)
}

export function parseTime(text) {
    const m = TIME.exec(text)
    if (!m) return null
    const h = +m[1], mi = +m[2], s = +(m[3] || 0)
    if (!validHms(h, mi, s)) return null
    return make('time', { h, mi, s }, h * 3600 + mi * 60 + s)
}

export function parseMonth(text, format = 'iso') {
    const m = format === 'br' ? MONTH_BR.exec(text) : MONTH_ISO.exec(text)
    if (!m) return null
    const [y, mo] = format === 'br' ? [+m[2], +m[1]] : [+m[1], +m[2]]
    if (y < 1 || y > 9999 || mo < 1 || mo > 12) return null
    return make('month', { y, m: mo }, y * 100 + mo)
}

export function parseWeek(text) {
    const m = WEEK.exec(text)
    if (!m) return null
    const y = +m[1], w = +m[2]
    if (y < 1 || w < 1 || w > isoWeeksInYear(y)) return null
    return make('week', { y, w }, y * 100 + w)
}

export function parseByKind(text, kind, format = 'iso') {
    if (typeof text !== 'string') return null
    const value = text.trim()
    switch (kind) {
        case 'date': return parseDate(value, format)
        case 'datetime': return parseDateTime(value, format)
        case 'time': return parseTime(value)
        case 'month': return parseMonth(value, format)
        case 'week': return parseWeek(value)
        default: return null
    }
}

function pad(n, size = 2) {
    return String(n).padStart(size, '0')
}

export function now(kind, clock = () => new Date()) {
    const date = clock()
    const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate()
    switch (kind) {
        case 'date': return parseDate(`${pad(y, 4)}-${pad(mo)}-${pad(d)}`)
        case 'datetime': return parseDateTime(`${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`)
        case 'time': return parseTime(`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`)
        case 'month': return parseMonth(`${pad(y, 4)}-${pad(mo)}`)
        default: return null
    }
}

export function formatIso(parsed) {
    if (!parsed) return ''
    switch (parsed.kind) {
        case 'date': return `${pad(parsed.y, 4)}-${pad(parsed.m)}-${pad(parsed.d)}`
        case 'datetime': return `${pad(parsed.y, 4)}-${pad(parsed.m)}-${pad(parsed.d)}T${pad(parsed.h)}:${pad(parsed.mi)}${parsed.s ? ':' + pad(parsed.s) : ''}`
        case 'time': return `${pad(parsed.h)}:${pad(parsed.mi)}${parsed.s ? ':' + pad(parsed.s) : ''}`
        case 'month': return `${pad(parsed.y, 4)}-${pad(parsed.m)}`
        case 'week': return `${pad(parsed.y, 4)}-W${pad(parsed.w)}`
        default: return ''
    }
}

export function formatBr(parsed) {
    if (!parsed) return ''
    switch (parsed.kind) {
        case 'date': return `${pad(parsed.d)}/${pad(parsed.m)}/${pad(parsed.y, 4)}`
        case 'datetime': return `${pad(parsed.d)}/${pad(parsed.m)}/${pad(parsed.y, 4)} ${pad(parsed.h)}:${pad(parsed.mi)}`
        case 'month': return `${pad(parsed.m)}/${pad(parsed.y, 4)}`
        default: return formatIso(parsed)
    }
}
