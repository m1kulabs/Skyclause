// #154 c-ics-feed: the conditions calendar's RFC 5545 writer (#79 §1 "ICS"). Pure: entries in, the feed's bytes out,
// so the same entries always give the same body and the feed's SHA-256 ETag holds between polls.

/** One `VEVENT`: a conditions calendar entry. */
export interface IcsEvent {
  /** D20: `call-{first sent call id}@skyclause.m1ku.tech` or `night-{id}@skyclause.m1ku.tech`. */
  uid: string
  sequence: number
  /** `DTSTAMP`: the entry's last change, in UTC. */
  stamp: Date
  start: Date
  /** Equal to `start` for a zero-length span (D13), which omits `DTEND`. */
  end: Date
  summary: string
  description: string
  /** The call's permalink. */
  url: string
  status: 'CONFIRMED' | 'CANCELLED'
}

export interface IcsCalendar {
  /** `X-WR-CALNAME`. */
  name: string
  events: IcsEvent[]
}

export const ICS_TIME_ZONE = 'Asia/Kuala_Lumpur'
// Malaysia keeps UTC+8 all year (no daylight saving), so one STANDARD rule covers every P1 date.
const OFFSET_MS = 8 * 60 * 60 * 1000

const TIME_ZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${ICS_TIME_ZONE}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'TZNAME:MYT',
  'END:STANDARD',
  'END:VTIMEZONE'
]

/** TEXT can't carry a control character other than HTAB (RFC 5545 §3.3.11, TSAFE-CHAR). */
const isTextSafe = (character: string) => {
  const code = character.codePointAt(0)!
  return code === 0x09 || (code >= 0x20 && code !== 0x7f)
}

/**
 * RFC 5545 §3.3.11 TEXT: backslash, semicolon and comma are escaped, and every line break becomes `\n`. Other control
 * characters are dropped.
 */
export function escapeText(value: string): string {
  const escaped = value.replace(/[\\;,]/g, (character) => `\\${character}`).replace(/\r\n|\r|\n/g, '\\n')
  return [...escaped].filter(isTextSafe).join('')
}

const encoder = new TextEncoder()

/**
 * RFC 5545 §3.1: a content line over 75 octets folds into lines of at most 75, each continuation starting with one
 * space. It splits between characters, never inside a UTF-8 sequence.
 */
export function foldLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    if (octets + size > 75) {
      parts.push(current)
      current = ' '
      octets = 1
    }
    current += character
    octets += size
  }
  parts.push(current)
  return parts.join('\r\n')
}

const pad = (n: number) => String(n).padStart(2, '0')

function stamp(date: Date, offsetMs: number) {
  const d = new Date(date.getTime() + offsetMs)
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  )
}

const utc = (date: Date) => `${stamp(date, 0)}Z`
const local = (date: Date) => `;TZID=${ICS_TIME_ZONE}:${stamp(date, OFFSET_MS)}`

function vevent(event: IcsEvent): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART${local(event.start)}`,
    // §3.8.2.2: DTEND must be later than DTSTART; with none, §3.6.1 ends the event at DTSTART.
    ...(event.end.getTime() > event.start.getTime() ? [`DTEND${local(event.end)}`] : []),
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `URL:${event.url}`,
    `STATUS:${event.status}`,
    'END:VEVENT'
  ]
}

const byStartThenUid = (a: IcsEvent, b: IcsEvent) =>
  a.start.getTime() - b.start.getTime() || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)

/**
 * The conditions calendar (ticket decision): `METHOD:PUBLISH`, a 15-minute `REFRESH-INTERVAL` (RFC 7986 §5.7) and
 * `X-PUBLISHED-TTL`, one `VTIMEZONE` and the events by start, then UID; CRLF line ends throughout.
 */
export function writeCalendar(calendar: IcsCalendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Skyclause//Conditions calendar//EN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...TIME_ZONE,
    ...[...calendar.events].sort(byStartThenUid).flatMap(vevent),
    'END:VCALENDAR'
  ]
  return lines.map((line) => `${foldLine(line)}\r\n`).join('')
}
