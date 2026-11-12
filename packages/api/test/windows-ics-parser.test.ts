import { describe, expect, test } from 'vitest'
import type { CalendarOptions } from '../src/services/windows/calendar-types'
import { CalendarParseError, expandCalendar, parseCalendar } from '../src/services/windows/parse-ics'

const options: CalendarOptions = {
  projectTz: 'Asia/Kuala_Lumpur',
  kind: 'event',
  now: new Date('2026-11-13T00:00:00Z'),
  through: new Date('2027-02-11T00:00:00Z'),
  resolveLocalSpan: async (span) => {
    const start = Date.parse(`${span.date}T${span.start}+08:00`)
    const end = Date.parse(`${span.date}T${span.end}+08:00`) + span.endDayOffset * 86400000
    return { startsAt: new Date(start), endsAt: new Date(end) }
  }
}
const calendar = (...entries: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...entries, 'END:VCALENDAR'].join('\r\n')
const event = (uid = 'one', extra = '', start = '20261116T090000Z', end = '20261116T100000Z') =>
  ['BEGIN:VEVENT', `UID:${uid}`, 'SUMMARY:Lecture', `DTSTART:${start}`, `DTEND:${end}`, extra, 'END:VEVENT']
    .filter(Boolean)
    .join('\r\n')
const zone = (offset: string) =>
  [
    'BEGIN:VTIMEZONE',
    'TZID:Source/Local',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    'END:STANDARD',
    'END:VTIMEZONE'
  ].join('\r\n')
const zoned = () =>
  event()
    .replace('DTSTART:20261116T090000Z', 'DTSTART;TZID=Source/Local:20261116T090000')
    .replace('DTEND:20261116T100000Z', 'DTEND;TZID=Source/Local:20261116T100000')

async function rejected(text: string) {
  try {
    await parseCalendar(text, options)
    throw new Error('Expected CalendarParseError')
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarParseError)
    expect((error as CalendarParseError).issues.length).toBeGreaterThan(0)
    return error as CalendarParseError
  }
}

describe('bounded ICS normalization', () => {
  test('imports a standalone UID with project window zone and stable identity', async () => {
    const result = await parseCalendar(calendar(event()), options)
    expect(result.occurrences).toEqual([
      {
        uid: 'one',
        recurrenceId: '',
        recurring: false,
        startsAt: new Date('2026-11-16T09:00:00Z'),
        endsAt: new Date('2026-11-16T10:00:00Z'),
        title: 'Lecture',
        tz: options.projectTz
      }
    ])
    expect(result.skipped).toEqual([])
    expect(result.protectedIdentities).toEqual([])
    expect((await expandCalendar(JSON.parse(JSON.stringify(result.document)), options)).occurrences).toEqual(
      result.occurrences
    )
  })

  test('preserves weekly COUNT before EXDATE and unions RDATE', async () => {
    const result = await parseCalendar(
      calendar(event('one', 'RRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE:20261123T090000Z\r\nRDATE:20261202T090000Z')),
      options
    )
    expect(result.occurrences.map((entry) => entry.startsAt.toISOString())).toEqual([
      '2026-11-16T09:00:00.000Z',
      '2026-11-30T09:00:00.000Z',
      '2026-12-02T09:00:00.000Z'
    ])
  })

  test('UNTIL is inclusive and DTSTART remains the original anchor on extension', async () => {
    const first = await parseCalendar(calendar(event('one', 'RRULE:FREQ=WEEKLY;UNTIL=20261130T090000Z')), {
      ...options,
      through: new Date('2026-11-23T09:00:00Z')
    })
    expect(first.occurrences).toHaveLength(2)
    expect((await expandCalendar(first.document, options)).occurrences).toHaveLength(3)
  })

  test('RDATE alone includes DTSTART, and duplicate dates create one identity', async () => {
    const result = await parseCalendar(calendar(event('one', 'RDATE:20261123T090000Z,20261123T090000Z')), options)
    expect(result.occurrences.map((entry) => entry.recurrenceId)).toEqual([
      '2026-11-16T09:00:00Z',
      '2026-11-23T09:00:00Z'
    ])
  })

  test('moved exceptions keep the original identity and replace the original occurrence', async () => {
    const result = await parseCalendar(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=2'),
        event('one', 'RECURRENCE-ID:20261123T090000Z', '20261124T090000Z', '20261124T100000Z')
      ),
      options
    )
    expect(result.occurrences.map((entry) => [entry.recurrenceId, entry.startsAt.toISOString()])).toEqual([
      ['2026-11-16T09:00:00Z', '2026-11-16T09:00:00.000Z'],
      ['2026-11-23T09:00:00Z', '2026-11-24T09:00:00.000Z']
    ])
  })

  test('exceptions moving in from beyond the horizon or past are included', async () => {
    const result = await parseCalendar(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=30'),
        event('one', 'RECURRENCE-ID:20270301T090000Z', '20261120T090000Z', '20261120T100000Z'),
        event('one', 'RECURRENCE-ID:20261109T090000Z', '20261121T090000Z', '20261121T100000Z')
      ),
      options
    )
    expect(
      result.occurrences.find((entry) => entry.recurrenceId === '2027-03-01T09:00:00Z')?.startsAt.toISOString()
    ).toBe('2026-11-20T09:00:00.000Z')
    expect(
      result.occurrences.find((entry) => entry.recurrenceId === '2026-11-09T09:00:00Z')?.startsAt.toISOString()
    ).toBe('2026-11-21T09:00:00.000Z')
  })

  test('moving outside the horizon protects the old identity from inferred deletion', async () => {
    const result = await parseCalendar(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=2'),
        event('one', 'RECURRENCE-ID:20261123T090000Z', '20270301T090000Z', '20270301T100000Z')
      ),
      options
    )
    expect(result.occurrences).toHaveLength(1)
    expect(result.protectedIdentities).toContainEqual({ uid: 'one', recurrenceId: '2026-11-23T09:00:00Z' })
  })

  test('cancellation removes an instance or the complete master without protection', async () => {
    const instance = await parseCalendar(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=2'),
        'BEGIN:VEVENT\r\nUID:one\r\nRECURRENCE-ID:20261123T090000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT'
      ),
      options
    )
    expect(instance.occurrences).toHaveLength(1)
    expect(instance.protectedIdentities).toEqual([])
    const master = await parseCalendar(calendar('BEGIN:VEVENT\r\nUID:one\r\nSTATUS:CANCELLED\r\nEND:VEVENT'), options)
    expect(master.occurrences).toEqual([])
    expect(master.protectedIdentities).toEqual([])
  })

  test('duplicate master or exception identity rejects the document', async () => {
    for (const entries of [
      [event(), event()],
      [
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=2'),
        event('one', 'RECURRENCE-ID:20261123T090000Z'),
        event('one', 'RECURRENCE-ID:20261123T090000Z')
      ]
    ]) {
      await rejected(calendar(...entries))
    }
  })

  test('standalone start edits keep the empty source identity', async () => {
    const before = await parseCalendar(calendar(event()), options)
    const after = await parseCalendar(calendar(event('one', '', '20261117T090000Z', '20261117T100000Z')), options)
    expect(before.occurrences[0]?.recurrenceId).toBe('')
    expect(after.occurrences[0]?.recurrenceId).toBe('')
  })

  test('missing and unrepresentable identities reject, using UTF-8 byte bounds', async () => {
    for (const input of [
      event(''),
      event().replace('UID:one\r\n', ''),
      event('界'.repeat(342)),
      event('one', 'UID:two'),
      event('one', 'RECURRENCE-ID:invalid')
    ])
      await rejected(calendar(input))
    expect((await parseCalendar(calendar(event('x'.repeat(1024))), options)).occurrences).toHaveLength(1)
    await rejected(calendar(event('x'.repeat(1025))))
    const longZone = 'z'.repeat(1005)
    await rejected(
      calendar(
        zone('+0200').replaceAll('Source/Local', longZone),
        zoned().replaceAll('Source/Local', longZone).replace('END:VEVENT', 'RRULE:FREQ=WEEKLY;COUNT=1\r\nEND:VEVENT')
      )
    )
  })

  test('source-frame identity survives project timezone settings and equivalent UTC exceptions', async () => {
    const input = calendar(
      zone('+0200'),
      zoned().replace('END:VEVENT', 'RRULE:FREQ=WEEKLY;COUNT=2\r\nEND:VEVENT'),
      event('one', 'RECURRENCE-ID:20261123T070000Z', '20261124T090000Z', '20261124T100000Z')
    )
    const first = await parseCalendar(input, options)
    const changed = await expandCalendar(first.document, { ...options, projectTz: 'UTC' })
    expect(first.occurrences.map((entry) => entry.recurrenceId)).toEqual([
      'Source/Local:2026-11-16T09:00:00',
      'Source/Local:2026-11-23T09:00:00'
    ])
    expect(changed.occurrences.map((entry) => entry.recurrenceId)).toEqual(
      first.occurrences.map((entry) => entry.recurrenceId)
    )
  })

  test('inconsistent floating and UTC exception identities reject the document', async () => {
    await rejected(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=2', '20261116T090000', '20261116T100000'),
        event('one', 'RECURRENCE-ID:20261123T090000Z')
      )
    )
  })

  test.each([
    event().replace('SUMMARY:Lecture', 'SUMMARY: '),
    event().replace('SUMMARY:Lecture', `SUMMARY:${'x'.repeat(201)}`),
    event('one', '').replace('DTSTART:20261116T090000Z', 'DTSTART:20260230T090000Z')
  ])('skips invalid UID, title or civil time without losing known identity', async (input) => {
    const result = await parseCalendar(calendar(input), options)
    expect(result.occurrences).toEqual([])
    expect(result.skipped.length).toBeGreaterThan(0)
    if (input.includes('UID:one')) expect(result.protectedIdentities).toContainEqual({ uid: 'one', recurrenceId: null })
  })

  test('all-day and over-12-hour entries are skipped and protected', async () => {
    const result = await parseCalendar(
      calendar(
        event('day')
          .replace('DTSTART:20261116T090000Z', 'DTSTART;VALUE=DATE:20261116')
          .replace('DTEND:20261116T100000Z', 'DTEND;VALUE=DATE:20261117'),
        event('long', '', '20261116T090000Z', '20261116T220001Z')
      ),
      options
    )
    expect(result.occurrences).toEqual([])
    expect(result.skipped.map((entry) => entry.uid)).toEqual(['day', 'long'])
    expect(result.protectedIdentities).toEqual([
      { uid: 'day', recurrenceId: null },
      { uid: 'long', recurrenceId: null }
    ])
  })

  test('floating timestamps use the injected project-local resolver including overnight spans', async () => {
    const result = await parseCalendar(
      calendar(event('float', 'RRULE:FREQ=WEEKLY;COUNT=2', '20261116T233000', '20261117T003000')),
      options
    )
    expect(result.occurrences.map((entry) => entry.startsAt.toISOString())).toEqual([
      '2026-11-16T15:30:00.000Z',
      '2026-11-23T15:30:00.000Z'
    ])
    expect(result.occurrences[0]?.endsAt.toISOString()).toBe('2026-11-16T16:30:00.000Z')
  })

  test('source VTIMEZONE resolves TZID locally with no cross-document contamination', async () => {
    const first = await parseCalendar(calendar(zone('+0200'), zoned()), options)
    const second = await parseCalendar(calendar(zone('+0500'), zoned()), options)
    expect(first.occurrences[0]?.startsAt.toISOString()).toBe('2026-11-16T07:00:00.000Z')
    expect(second.occurrences[0]?.startsAt.toISOString()).toBe('2026-11-16T04:00:00.000Z')
    expect((await expandCalendar(first.document, options)).occurrences).toEqual(first.occurrences)
  })

  test('TZID without source VTIMEZONE is skipped and protects its UID', async () => {
    const result = await parseCalendar(calendar(zoned()), options)
    expect(result.occurrences).toEqual([])
    expect(result.skipped[0]?.detail).toContain('VTIMEZONE')
    expect(result.protectedIdentities).toEqual([{ uid: 'one', recurrenceId: null }])
  })

  test('invalid project zone and invalid bounds reject before expansion', async () => {
    await expect(parseCalendar(calendar(event()), { ...options, projectTz: 'Invalid/Zone' })).rejects.toBeInstanceOf(
      CalendarParseError
    )
    await expect(
      parseCalendar(calendar(event()), { ...options, through: new Date('2027-02-12T00:00:00Z') })
    ).rejects.toBeInstanceOf(CalendarParseError)
  })

  test('persists recurrence semantics and strips personal properties, parameters and nested alarms', async () => {
    const result = await parseCalendar(
      calendar(
        event(
          'one',
          'RRULE:FREQ=WEEKLY;COUNT=2\r\nEXDATE:20261123T090000Z\r\nDESCRIPTION:secret\r\nATTENDEE;CN=Private:mailto:private@example.org\r\nCONTACT:private\r\nORGANIZER:mailto:private@example.org\r\nATTACH:https://example.org/private\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:secret\r\nTRIGGER:-PT5M\r\nEND:VALARM'
        ).replace('SUMMARY:Lecture', 'SUMMARY;ALTREP="https://example.org/private":Lecture')
      ),
      options
    )
    const saved = JSON.stringify(result.document)
    expect(saved).toContain('rrule')
    expect(saved).toContain('exdate')
    for (const secret of [
      'secret',
      'private',
      'attendee',
      'description',
      'contact',
      'organizer',
      'attach',
      'valarm',
      'altrep'
    ])
      expect(saved).not.toContain(secret)
  })

  test('validates persisted jCal again instead of accepting arbitrary components', async () => {
    const valid = await parseCalendar(calendar(event()), options)
    const altered = JSON.parse(JSON.stringify(valid.document))
    altered.jcal[1].push(['description', {}, 'text', 'private'])
    await expect(expandCalendar(altered, options)).rejects.toBeInstanceOf(CalendarParseError)
    await expect(expandCalendar({ version: 1, jcal: ['vcalendar', [], [['vevent']]] }, options)).rejects.toBeInstanceOf(
      CalendarParseError
    )
  })

  test.each([
    'not a calendar',
    'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:one\r\nEND:VCALENDAR',
    'BEGIN:VCALENDAR\r\nVERSION:2.0'
  ])('malformed calendars reject the complete document', async (input) => {
    await rejected(input)
  })

  test('enforces 5 MiB UTF-8 bytes before parsing, including multibyte text', async () => {
    for (const fill of ['x'.repeat(5 * 1024 * 1024), '界'.repeat(Math.ceil((5 * 1024 * 1024) / 3))]) {
      const error = await rejected(calendar(event('one', `DESCRIPTION:${fill}`)))
      expect(error.issues[0]?.detail).toContain('5 MiB')
    }
  })

  test('rejects more than 10,000 VEVENTs even when cancelled', async () => {
    const error = await rejected(
      calendar(
        ...Array.from({ length: 10001 }, (_, index) => `BEGIN:VEVENT\r\nUID:${index}\r\nSTATUS:CANCELLED\r\nEND:VEVENT`)
      )
    )
    expect(error.issues[0]?.detail).toContain('10,000 VEVENT')
  })

  test('rejects more than 10,000 occurrences without returning partial output', async () => {
    const error = await rejected(
      calendar(event('one', 'RRULE:FREQ=SECONDLY;COUNT=10001', '20261116T090000Z', '20261116T090001Z'))
    )
    expect(error.issues[0]?.detail).toContain('10,000 occurrence')
  })

  test('counts historical recurrence steps and errors at 100,000 without resetting DTSTART', async () => {
    const error = await rejected(calendar(event('one', 'RRULE:FREQ=SECONDLY', '20200101T090000Z', '20200101T090001Z')))
    expect(error.issues[0]?.detail).toContain('100,000 iterator')
  })
  test('accepts the exact byte, event and output ceilings', async () => {
    const base = calendar(event('one', 'DESCRIPTION:'))
    expect(
      (
        await parseCalendar(
          base.replace('DESCRIPTION:', `DESCRIPTION:${'x'.repeat(5 * 1024 * 1024 - Buffer.byteLength(base))}`),
          options
        )
      ).occurrences
    ).toHaveLength(1)
    const cancelled = Array.from(
      { length: 10000 },
      (_, index) => `BEGIN:VEVENT\r\nUID:${index}\r\nSTATUS:CANCELLED\r\nEND:VEVENT`
    )
    expect((await parseCalendar(calendar(...cancelled), options)).occurrences).toEqual([])
    expect(
      (
        await parseCalendar(
          calendar(event('one', 'RRULE:FREQ=SECONDLY;COUNT=10000', '20261116T090000Z', '20261116T090001Z')),
          options
        )
      ).occurrences
    ).toHaveLength(10000)
  })

  test('the exact historical iterator ceiling is accepted and excluded positions still count', async () => {
    expect(
      (
        await parseCalendar(
          calendar(event('one', 'RRULE:FREQ=SECONDLY;COUNT=100000', '20200101T090000Z', '20200101T090001Z')),
          options
        )
      ).occurrences
    ).toEqual([])
    const exclusions = Array.from({ length: 100001 }, (_, index) =>
      new Date(Date.parse('2020-01-01T09:00:00Z') + index * 1000)
        .toISOString()
        .replaceAll('-', '')
        .replaceAll(':', '')
        .replace('.000', '')
    )
    const error = await rejected(
      calendar(
        event(
          'one',
          `RRULE:FREQ=SECONDLY;COUNT=100001\r\nEXDATE:${exclusions.join(',')}`,
          '20200101T090000Z',
          '20200101T090001Z'
        )
      )
    )
    expect(error.issues[0]?.detail).toContain('100,000 iterator')
  })

  test('source VTIMEZONE DST changes preserve weekly local clocks', async () => {
    const source = [
      'BEGIN:VTIMEZONE',
      'TZID:Source/Local',
      'BEGIN:DAYLIGHT',
      'DTSTART:20260329T020000',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'DTSTART:20261025T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE'
    ].join('\r\n')
    const input = zoned()
      .replaceAll('20261116', '20261019')
      .replace('END:VEVENT', 'RRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT')
    const result = await parseCalendar(calendar(source, input), {
      ...options,
      now: new Date('2026-10-18T00:00:00Z'),
      through: new Date('2026-11-10T00:00:00Z')
    })
    expect(result.occurrences.map((entry) => entry.startsAt.toISOString())).toEqual([
      '2026-10-19T07:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
      '2026-11-02T08:00:00.000Z'
    ])
  })

  test('duration and zero-duration commute semantics reuse WIN-8 validation', async () => {
    const duration = event().replace('DTEND:20261116T100000Z', 'DURATION:PT1H')
    expect((await parseCalendar(calendar(duration), options)).occurrences[0]?.endsAt.toISOString()).toBe(
      '2026-11-16T10:00:00.000Z'
    )
    const zero = calendar(event('one', '', '20261116T090000Z', '20261116T090000Z'))
    expect((await parseCalendar(zero, options)).skipped).toHaveLength(1)
    expect((await parseCalendar(zero, { ...options, kind: 'commute_wave' })).occurrences).toHaveLength(1)
  })

  test('cancelled masters still reject malformed or duplicated override identities', async () => {
    const master = event('one', 'STATUS:CANCELLED')
    await rejected(calendar(master, event('one', 'RECURRENCE-ID:invalid')))
    await rejected(
      calendar(master, event('one', 'RECURRENCE-ID:20261123T090000Z'), event('one', 'RECURRENCE-ID:20261123T090000Z'))
    )
  })

  test('invalid TZID on RECURRENCE-ID cannot silently use floating or a global timezone', async () => {
    await rejected(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=2'),
        event('one', 'RECURRENCE-ID;TZID=Unsupported/Zone:20261123T090000')
      )
    )
  })

  test('invalid time properties do not persist an occurrence from the affected UID', async () => {
    for (const extra of ['DTSTART:20261117T090000Z', 'DURATION:-PT1H']) {
      const result = await parseCalendar(calendar(event('one', extra)), options)
      expect(result.occurrences).toEqual([])
      expect(result.protectedIdentities).toContainEqual({ uid: 'one', recurrenceId: null })
    }
  })

  test('unreferenced timezone definitions are omitted from the persisted whitelist', async () => {
    const result = await parseCalendar(calendar(zone('+0200'), event()), options)
    expect(JSON.stringify(result.document)).not.toContain('Source/Local')
  })

  test('invalid master time cannot conceal duplicated exception identities', async () => {
    await rejected(
      calendar(
        event('one', '').replace('DTSTART:20261116T090000Z', 'DTSTART:20260230T090000Z'),
        event('one', 'RECURRENCE-ID:20261123T090000Z'),
        event('one', 'RECURRENCE-ID:20261123T090000Z')
      )
    )
  })

  test('unsupported EXRULE cannot silently change recurrence on persisted expansion', async () => {
    const error = await rejected(calendar(event('one', 'RRULE:FREQ=WEEKLY;COUNT=3\r\nEXRULE:FREQ=WEEKLY;COUNT=1')))
    expect(error.issues[0]?.detail).toContain('EXRULE')
  })
  test('unsupported RANGE protects the complete affected series on every expansion', async () => {
    const result = await parseCalendar(
      calendar(
        event('one', 'RRULE:FREQ=WEEKLY;COUNT=3'),
        event('one', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261123T090000Z', '20261124T090000Z', '20261124T100000Z')
      ),
      options
    )
    expect(result.occurrences).toEqual([])
    expect(result.protectedIdentities).toEqual([{ uid: 'one', recurrenceId: null }])
    expect((await expandCalendar(result.document, options)).protectedIdentities).toEqual(result.protectedIdentities)
  })

  test.each(['SECONDLY', 'MINUTELY', 'HOURLY'])(
    'subdaily %s with BY selectors is reported/protected before iterator work',
    async (frequency) => {
      const result = await parseCalendar(calendar(event('one', `RRULE:FREQ=${frequency};COUNT=2;BYSECOND=0`)), options)
      expect(result.occurrences).toEqual([])
      expect(result.skipped[0]?.detail).toContain('Subdaily')
      expect(result.protectedIdentities).toEqual([{ uid: 'one', recurrenceId: null }])
    }
  )

  test('source yearly observances with subday selectors reject before timezone hydration', async () => {
    const source = zone('+0200').replace(
      'DTSTART:19700101T000000',
      'DTSTART:19700101T000000\r\nRRULE:FREQ=YEARLY;BYSECOND=0'
    )
    const error = await rejected(calendar(source, zoned()))
    expect(error.issues[0]?.detail).toContain('VTIMEZONE')
  })

  test('historical source-observance work shares the 100,000-step ceiling before hydration', async () => {
    const observance = [
      'BEGIN:STANDARD',
      'DTSTART:18000101T000000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0200',
      'RRULE:FREQ=YEARLY;BYMONTH=1,2,3,4,5,6,7,8,9,10,11,12;BYDAY=MO,TU,WE,TH,FR,SA,SU',
      'END:STANDARD'
    ].join('\r\n')
    const source = [
      'BEGIN:VTIMEZONE',
      'TZID:Source/Local',
      observance,
      observance.replaceAll('STANDARD', 'DAYLIGHT'),
      'END:VTIMEZONE'
    ].join('\r\n')
    const error = await rejected(calendar(source, zoned()))
    expect(error.issues[0]?.detail).toContain('100,000 iterator')
  })

  test('a source zone with no covered transitions cannot fall back to zero offset or repeatedly hydrate', async () => {
    const source = zone('+0200').replace('DTSTART:19700101T000000', 'DTSTART:20990101T000000\r\nRRULE:FREQ=YEARLY')
    await rejected(calendar(source, zoned()))
  })
})
