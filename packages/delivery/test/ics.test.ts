// #154 c-ics-feed: the RFC 5545 writer for the conditions calendar, read back with ical.js.
import ICAL from 'ical.js'
import { expect, test } from 'vitest'
import { writeCalendar, type IcsEvent } from '../src/ics'

// DESIGN "Voice and content": the 2 November replay's call wording and the MET warning's Malay verbatim.
const REPLAY =
  'Commute disruption for the 15:30 release wave, Monday 2 November 2026. Why: Storm confirmed, gauge 39.0 mm in ' +
  '60 min to 15:00 (Lebat), 5 min old at the 15:05 poll.'
const MALAY = 'Amaran Ribut Petir: Ribut petir, hujan lebat dan angin kencang dijangka di negeri …'

const event = (overrides: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: 'call-019a4b2c-0000-7000-8000-000000000001@skyclause.m1ku.tech',
  sequence: 0,
  stamp: new Date('2026-11-02T07:10:12Z'),
  start: new Date('2026-11-02T07:30:00Z'),
  end: new Date('2026-11-02T07:45:00Z'),
  summary: 'Commute disruption · 15:30–15:45 MYT',
  description: REPLAY,
  url: 'https://skyclause.m1ku.tech/c/019a4b2c-0000-7000-8000-000000000001',
  status: 'CONFIRMED',
  ...overrides
})

const parse = (body: string) => new ICAL.Component(ICAL.parse(body))
const lines = (body: string) => body.split('\r\n').slice(0, -1)

test('the calendar carries the ticket’s properties and one Asia/Kuala_Lumpur VTIMEZONE (NTC-2)', () => {
  const calendar = parse(writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [event()] }))
  expect(calendar.name).toBe('vcalendar')
  expect(calendar.getFirstPropertyValue('version')).toBe('2.0')
  expect(calendar.getFirstPropertyValue('prodid')).toBe('-//Skyclause//Conditions calendar//EN')
  expect(calendar.getFirstPropertyValue('method')).toBe('PUBLISH')
  expect(calendar.getFirstPropertyValue('x-wr-calname')).toBe('Bukit Jalil conditions calendar')
  const refresh = calendar.getFirstProperty('refresh-interval')!
  expect(refresh.type).toBe('duration')
  expect(refresh.getFirstValue()!.toString()).toBe('PT15M')
  expect(calendar.getFirstPropertyValue('x-published-ttl')).toBe('PT15M')
  const zones = calendar.getAllSubcomponents('vtimezone')
  expect(zones.map((zone) => zone.getFirstPropertyValue('tzid'))).toEqual(['Asia/Kuala_Lumpur'])
  const standard = zones[0]!.getFirstSubcomponent('standard')!
  expect(standard.getFirstPropertyValue('tzoffsetfrom')!.toString()).toBe('+08:00')
  expect(standard.getFirstPropertyValue('tzoffsetto')!.toString()).toBe('+08:00')
})

test('each VEVENT round-trips UID, SEQUENCE, DTSTAMP in UTC, local DTSTART and DTEND, text, URL and STATUS', () => {
  const body = writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [event({ sequence: 2 })] })
  const calendar = parse(body)
  ICAL.TimezoneService.register(calendar.getFirstSubcomponent('vtimezone')!)
  const vevent = calendar.getFirstSubcomponent('vevent')!
  const read = new ICAL.Event(vevent)
  expect(read.uid).toBe('call-019a4b2c-0000-7000-8000-000000000001@skyclause.m1ku.tech')
  expect(read.sequence).toBe(2)
  expect(body).toContain('\r\nDTSTAMP:20261102T071012Z\r\n')
  expect(body).toContain('\r\nDTSTART;TZID=Asia/Kuala_Lumpur:20261102T153000\r\n')
  expect(body).toContain('\r\nDTEND;TZID=Asia/Kuala_Lumpur:20261102T154500\r\n')
  expect(read.startDate.toJSDate().toISOString()).toBe('2026-11-02T07:30:00.000Z')
  expect(read.endDate.toJSDate().toISOString()).toBe('2026-11-02T07:45:00.000Z')
  expect(read.summary).toBe('Commute disruption · 15:30–15:45 MYT')
  expect(read.description).toBe(REPLAY)
  expect(vevent.getFirstPropertyValue('url')).toBe('https://skyclause.m1ku.tech/c/019a4b2c-0000-7000-8000-000000000001')
  expect(vevent.getFirstPropertyValue('status')).toBe('CONFIRMED')
  ICAL.TimezoneService.reset()
})

test('long non-ASCII text folds at 75 octets without splitting a UTF-8 sequence, on CRLF line ends', () => {
  const description = `${MALAY}\n${REPLAY}\n${MALAY} · ${MALAY}`
  const body = writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [event({ description })] })
  expect(body.endsWith('\r\n')).toBe(true)
  expect(body.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/)
  const strict = new TextDecoder('utf-8', { fatal: true })
  const encoder = new TextEncoder()
  const physical = lines(body)
  const folded = physical.filter((line) => line.startsWith(' '))
  expect(folded.length).toBeGreaterThan(3)
  for (const line of physical) {
    const octets = encoder.encode(line)
    expect(octets.length).toBeLessThanOrEqual(75)
    // A line that ends inside a multi-octet sequence wouldn't decode on its own.
    expect(strict.decode(octets)).toBe(line)
  }
  expect(new ICAL.Event(parse(body).getFirstSubcomponent('vevent')!).description).toBe(description)
})

test('a fold that would split “…” (3 octets) at octet 75 moves the whole character to the next line', () => {
  // "DESCRIPTION:" is 12 octets, so 62 more reach 74 and the ellipsis would end at 77.
  const body = writeCalendar({
    name: 'Bukit Jalil conditions calendar',
    events: [event({ description: `${'x'.repeat(62)}…` })]
  })
  const at = lines(body).findIndex((line) => line.startsWith('DESCRIPTION:'))
  expect(lines(body)[at]).toBe(`DESCRIPTION:${'x'.repeat(62)}`)
  expect(lines(body)[at + 1]).toBe(' …')
})

test('text escapes backslash, semicolon, comma and newline (RFC 5545 §3.3.11)', () => {
  const summary = 'Outdoor limited; haze, API 152 \\ station CA0016'
  const description = 'Haze watch: API 152 (Unhealthy).\r\nApproved 07:10 MYT.\nNot a safety or emergency service.'
  const body = writeCalendar({ name: 'Rooftop; level 5, block B', events: [event({ summary, description })] })
  expect(body).toContain('SUMMARY:Outdoor limited\\; haze\\, API 152 \\\\ station CA0016\r\n')
  expect(body).toContain('X-WR-CALNAME:Rooftop\\; level 5\\, block B\r\n')
  expect(body.replaceAll('\r\n ', '')).toContain(
    'DESCRIPTION:Haze watch: API 152 (Unhealthy).\\nApproved 07:10 MYT.\\nNot a safety or emergency service.\r\n'
  )
  const read = new ICAL.Event(parse(body).getFirstSubcomponent('vevent')!)
  expect(read.summary).toBe(summary)
  expect(read.description).toBe(description.replace('\r\n', '\n'))
})

test('text drops control characters TEXT can’t carry, keeping HTAB (RFC 5545 §3.3.11 TSAFE-CHAR)', () => {
  const body = writeCalendar({
    name: 'Bukit Jalil conditions calendar',
    events: [event({ summary: 'Storm\u0007 watch\u0000\tgauge\u007f 75' })]
  })
  expect(body).toContain('\r\nSUMMARY:Storm watch\tgauge 75\r\n')
})

test('a zero-length span omits DTEND, which RFC 5545 §3.6.1 ends at DTSTART (§3.8.2.2 bars an equal DTEND)', () => {
  const at = new Date('2026-11-02T07:30:00Z')
  const body = writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [event({ start: at, end: at })] })
  expect(body).not.toContain('DTEND')
  const calendar = parse(body)
  ICAL.TimezoneService.register(calendar.getFirstSubcomponent('vtimezone')!)
  const read = new ICAL.Event(calendar.getFirstSubcomponent('vevent')!)
  expect(read.endDate.toJSDate().toISOString()).toBe('2026-11-02T07:30:00.000Z')
  ICAL.TimezoneService.reset()
})

test('events are ordered by start, then UID, so the same entries give the same bytes', () => {
  const late = event({ uid: 'night-b@skyclause.m1ku.tech', start: new Date('2026-11-14T10:00:00Z') })
  const early = event({ uid: 'call-a@skyclause.m1ku.tech', start: new Date('2026-11-02T07:30:00Z') })
  const twin = event({ uid: 'call-0@skyclause.m1ku.tech', start: new Date('2026-11-02T07:30:00Z') })
  const body = writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [late, early, twin] })
  expect(writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [twin, late, early] })).toBe(body)
  const uids = parse(body)
    .getAllSubcomponents('vevent')
    .map((vevent) => vevent.getFirstPropertyValue('uid'))
  expect(uids).toEqual(['call-0@skyclause.m1ku.tech', 'call-a@skyclause.m1ku.tech', 'night-b@skyclause.m1ku.tech'])
})

test('a calendar with no entries is still valid: its VTIMEZONE is the one component', () => {
  const calendar = parse(writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [] }))
  expect(calendar.getAllSubcomponents('vevent')).toEqual([])
  expect(calendar.getAllSubcomponents('vtimezone')).toHaveLength(1)
})

test('a cancelled entry says STATUS:CANCELLED', () => {
  const body = writeCalendar({ name: 'Bukit Jalil conditions calendar', events: [event({ status: 'CANCELLED' })] })
  expect(parse(body).getFirstSubcomponent('vevent')!.getFirstPropertyValue('status')).toBe('CANCELLED')
})
