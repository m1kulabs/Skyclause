import { toMytIso } from '../../shared/time.ts'

export type EvidenceKind = 'evidence' | 'call' | 'unsubscribe' | 'unparseable'

export type ParsedEvidenceRequest =
  | { kind: 'evidence' | 'call'; spanStart: string; spanEnd: string }
  | { kind: 'unsubscribe' | 'unparseable'; spanStart: null; spanEnd: null }

export function firstUnquotedLine(body: string): string {
  for (const rawLine of body.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (
      /^>/.test(line) ||
      /^On\b.*\bwrote:$/i.test(line) ||
      /^-{2,}\s*(?:Forwarded message|Original Message)\s*-{2,}$/i.test(line) ||
      /^Begin forwarded message:$/i.test(line)
    ) {
      return ''
    }
    return line
  }
  return ''
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_MS = 24 * 60 * 60 * 1000

function dayStart(date: string): number | null {
  const ms = Date.parse(`${date}T00:00:00+08:00`)
  return Number.isFinite(ms) && toMytIso(new Date(ms)).slice(0, 10) === date ? ms : null
}

function namedDay(year: string, day: string, month: string): number | null {
  const monthNumber = MONTHS.indexOf(month.toLowerCase()) + 1
  const date = `${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}`
  return dayStart(date)
}

function parseLine(line: string, receiptDay: string): ParsedEvidenceRequest | null {
  if (/[\r\n]/.test(line)) return null
  const call = /^call[ \t]+for[ \t]+(today|tomorrow|([0-9]{1,2})[ \t]+([a-z]{3}))$/i.exec(line)
  if (call) {
    const relative = call[1]!.toLowerCase()
    const start =
      relative === 'today' || relative === 'tomorrow'
        ? Date.parse(`${receiptDay}T00:00:00+08:00`) + (relative === 'tomorrow' ? DAY_MS : 0)
        : namedDay(receiptDay.slice(0, 4), call[2]!, call[3]!)
    if (start === null) return null
    return { kind: 'call', spanStart: toMytIso(new Date(start)), spanEnd: toMytIso(new Date(start + DAY_MS)) }
  }

  const evidence =
    /^evidence[ \t]+for[ \t]+([0-9]{1,2})[ \t]+([a-z]{3})[ \t]+([0-9]{2}):([0-9]{2})[ \t]*[–-][ \t]*([0-9]{2}):([0-9]{2})$/i.exec(
      line
    )
  if (!evidence) return null
  const start = namedDay(receiptDay.slice(0, 4), evidence[1]!, evidence[2]!)
  if (start === null) return null
  const startMinutes = Number(evidence[3]) * 60 + Number(evidence[4])
  const endMinutes = Number(evidence[5]) * 60 + Number(evidence[6])
  if (
    Number(evidence[3]) > 23 ||
    Number(evidence[4]) > 59 ||
    Number(evidence[5]) > 24 ||
    Number(evidence[6]) > 59 ||
    (Number(evidence[5]) === 24 && Number(evidence[6]) !== 0) ||
    endMinutes < startMinutes
  ) {
    return null
  }
  return {
    kind: 'evidence',
    spanStart: toMytIso(new Date(start + startMinutes * 60_000)),
    spanEnd: toMytIso(new Date(start + endMinutes * 60_000))
  }
}

export function parseEvidenceRequest(input: {
  subject: string
  body: string
  receivedAt: string
}): ParsedEvidenceRequest {
  const receipt = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(input.receivedAt)
  const receiptMs = Date.parse(input.receivedAt)
  if (
    !receipt ||
    dayStart(receipt[1]!) === null ||
    Number(receipt[2]) > 23 ||
    Number(receipt[3]) > 59 ||
    Number(receipt[4]) > 59 ||
    !Number.isFinite(receiptMs)
  ) {
    throw new Error('invalid receipt instant')
  }
  const receiptDay = toMytIso(new Date(receiptMs)).slice(0, 10)
  const subject = input.subject.trim()
  const body = firstUnquotedLine(input.body)
  if (/^unsubscribe$/i.test(subject) || /^unsubscribe$/i.test(body)) {
    return { kind: 'unsubscribe', spanStart: null, spanEnd: null }
  }
  const parsed = parseLine(subject, receiptDay) ?? parseLine(body, receiptDay)
  if (parsed) return parsed
  return { kind: 'unparseable', spanStart: null, spanEnd: null }
}
