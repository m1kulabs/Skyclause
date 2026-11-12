import { expect, test } from 'vitest'
import { planCalendarDiff } from '../src/services/windows/calendar-diff'
import * as calendarDiff from '../src/services/windows/calendar-diff'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { withTenant, systemPrincipal } from '@skyclause/db'
import { testOrg } from './harness'
import { expandCalendar, parseCalendar } from '../src/services/windows/parse-ics'
import { resolveWindowLocalSpan } from '@skyclause/db'

test('source end time edits preserve the matching window identity and emit one update', async () => {
  const result = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    members: [
      {
        id: 'old-window',
        icsUid: 'CaseUID',
        icsRecurrenceId: '',
        startsAt: new Date('2026-11-14T10:00:00Z'),
        endsAt: new Date('2026-11-14T11:00:00Z'),
        title: 'Lecture',
        kind: 'class',
        tz: 'UTC',
        cancelledAt: null,
        cancellationOrigin: null,
        localOverride: false,
        seriesId: null
      }
    ],
    occurrences: [
      {
        uid: 'CaseUID',
        recurrenceId: '',
        recurring: false,
        startsAt: new Date('2026-11-14T10:00:00Z'),
        endsAt: new Date('2026-11-14T12:00:00Z'),
        title: 'Lecture',
        kind: 'class',
        tz: 'UTC'
      }
    ],
    protectedIdentities: [],
    stoppedSeriesIds: []
  })
  expect(result).toMatchObject({
    changes: [{ kind: 'update', id: 'old-window', patch: { endsAt: new Date('2026-11-14T12:00:00Z') } }],
    missing: []
  })
})

test('absence cancels only covered, unprotected, upcoming and unmodified identities', () => {
  const base = {
    startsAt: new Date('2026-11-14T10:00:00Z'),
    endsAt: new Date('2026-11-14T11:00:00Z'),
    title: 'Lecture',
    kind: 'class' as const,
    tz: 'UTC',
    cancelledAt: null,
    cancellationOrigin: null,
    localOverride: false,
    seriesId: null,
    icsRecurrenceId: ''
  }
  const result = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    occurrences: [],
    members: [
      { ...base, id: 'cancel', icsUid: 'a' },
      { ...base, id: 'protected', icsUid: 'b' },
      { ...base, id: 'override', icsUid: 'c', localOverride: true },
      { ...base, id: 'started', icsUid: 'd', startsAt: new Date('2026-11-11T00:00:00Z') },
      { ...base, id: 'beyond', icsUid: 'e', startsAt: new Date('2027-02-11T00:00:00Z') },
      { ...base, id: 'stopped', icsUid: 'f', seriesId: 'stopped-series' },
      {
        ...base,
        id: 'manual',
        icsUid: 'g',
        cancelledAt: new Date('2026-11-11T00:00:00Z'),
        cancellationOrigin: 'manual' as const
      }
    ],
    protectedIdentities: [{ uid: 'b', recurrenceId: null }],
    stoppedSeriesIds: ['stopped-series']
  })
  expect(result).toEqual({ changes: [{ kind: 'cancel', id: 'cancel', origin: 'source' }], missing: [] })
})

test('protected UID is not modified even when another occurrence was parsed', () => {
  const fields = {
    startsAt: new Date('2026-11-14T10:00:00Z'),
    endsAt: new Date('2026-11-14T11:00:00Z'),
    title: 'Before',
    kind: 'class' as const,
    tz: 'UTC'
  }
  const result = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    members: [
      {
        ...fields,
        id: 'one',
        icsUid: 'CaseUID',
        icsRecurrenceId: '',
        cancelledAt: null,
        cancellationOrigin: null,
        localOverride: false,
        seriesId: null
      }
    ],
    occurrences: [{ ...fields, uid: 'CaseUID', recurrenceId: '', recurring: false, title: 'After' }],
    protectedIdentities: [{ uid: 'CaseUID', recurrenceId: null }],
    stoppedSeriesIds: []
  })
  expect(result).toEqual({ changes: [], missing: [] })
})

test('a manually stopped series does not materialize newly encountered occurrences', () => {
  const result = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    members: [],
    occurrences: [
      {
        uid: 'Stopped',
        recurrenceId: 'next',
        recurring: true,
        startsAt: new Date('2026-11-14T10:00:00Z'),
        endsAt: new Date('2026-11-14T11:00:00Z'),
        title: 'Lecture',
        kind: 'class',
        tz: 'UTC'
      }
    ],
    protectedIdentities: [],
    stoppedSeriesIds: [],
    stoppedUids: ['Stopped']
  })
  expect(result).toEqual({ changes: [], missing: [] })
})

test('imported manual defaults shift the source local date once without changing identity', async () => {
  const orgId = testOrg('ics-defaults').id
  await makeOrganization({ id: orgId, slug: 'ics-defaults' })
  const result = await withTenant({ orgId, principal: systemPrincipal('test') }, (tx) =>
    calendarDiff.applyCalendarDefaults(
      tx,
      {
        uid: 'CaseUID',
        recurrenceId: 'original',
        recurring: true,
        title: 'Source',
        tz: 'Asia/Kuala_Lumpur',
        startsAt: new Date('2026-11-14T02:00:00Z'),
        endsAt: new Date('2026-11-14T03:00:00Z')
      },
      'class',
      { dateOffsetDays: 1, localStart: '11:00:00', localEnd: '12:00:00', endDayOffset: 0 }
    )
  )
  expect(result).toMatchObject({
    uid: 'CaseUID',
    recurrenceId: 'original',
    startsAt: new Date('2026-11-15T03:00:00Z'),
    endsAt: new Date('2026-11-15T04:00:00Z')
  })
})

test('real expansion applies per-UID offsets before the actual horizon filter', async () => {
  const orgId = testOrg('ics-shifted-horizon').id
  await makeOrganization({ id: orgId, slug: 'ics-shifted-horizon' })
  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:positive',
    'DTSTART:20261111T100000Z',
    'DTEND:20261111T110000Z',
    'SUMMARY:Early',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:negative',
    'DTSTART:20270211T100000Z',
    'DTEND:20270211T110000Z',
    'SUMMARY:Late',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')
  const [result, unchanged] = await withTenant({ orgId, principal: systemPrincipal('test') }, async (tx) => {
    const options = {
      projectTz: 'UTC',
      kind: 'class' as const,
      now: new Date('2026-11-12T00:00:00Z'),
      through: new Date('2027-02-10T00:00:00Z'),
      sourceThrough: new Date('2027-02-13T00:00:00Z'),
      resolveLocalSpan: (span: Parameters<typeof resolveWindowLocalSpan>[1]) => resolveWindowLocalSpan(tx, span),
      transformOccurrence: (occurrence: Parameters<typeof calendarDiff.applyCalendarDefaults>[1]) =>
        calendarDiff.applyCalendarDefaults(tx, occurrence, 'class', {
          dateOffsetDays: occurrence.uid === 'positive' ? 2 : -2
        })
    }
    const first = await parseCalendar(calendar, options)
    return [first, await expandCalendar(first.document, options)] as const
  })
  expect(result.occurrences.map((item) => [item.uid, item.startsAt.toISOString()])).toEqual([
    ['positive', '2026-11-13T10:00:00.000Z'],
    ['negative', '2027-02-09T10:00:00.000Z']
  ])
  const members = result.occurrences.map((item) => ({
    ...item,
    id: item.uid,
    icsUid: item.uid,
    icsRecurrenceId: item.recurrenceId,
    kind: 'class' as const,
    cancelledAt: null,
    cancellationOrigin: null,
    localOverride: false,
    seriesId: null
  }))
  const diff = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    members,
    occurrences: unchanged.occurrences.map((item) => ({ ...item, kind: 'class' as const })),
    protectedIdentities: unchanged.protectedIdentities,
    stoppedSeriesIds: []
  })
  expect(diff).toEqual({ changes: [], missing: [] })
})

test('a source cancellation can restore its ID with one final field patch, while manual tombstones remain', () => {
  const fields = {
    startsAt: new Date('2026-11-14T10:00:00Z'),
    endsAt: new Date('2026-11-14T11:00:00Z'),
    title: 'Old',
    kind: 'class' as const,
    tz: 'UTC'
  }
  const source = {
    ...fields,
    id: 'source',
    icsUid: 'UID',
    icsRecurrenceId: '',
    cancelledAt: new Date('2026-11-12T01:00:00Z'),
    cancellationOrigin: 'source' as const,
    localOverride: false,
    seriesId: null
  }
  const manual = { ...source, id: 'manual', icsUid: 'uid', cancellationOrigin: 'manual' as const }
  const occurrence = { ...fields, uid: 'UID', recurrenceId: '', recurring: false, title: 'New' }
  const result = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    members: [source, manual],
    occurrences: [occurrence, { ...occurrence, uid: 'uid' }],
    protectedIdentities: [],
    stoppedSeriesIds: []
  })
  expect(result).toEqual({ changes: [{ kind: 'restore-source', id: 'source', patch: { title: 'New' } }], missing: [] })
})

test('an identical source occurrence is a no-op and case-sensitive UIDs remain distinct', () => {
  const fields = {
    startsAt: new Date('2026-11-14T10:00:00Z'),
    endsAt: new Date('2026-11-14T11:00:00Z'),
    title: 'Lecture',
    kind: 'class' as const,
    tz: 'UTC'
  }
  const result = planCalendarDiff({
    now: new Date('2026-11-12T00:00:00Z'),
    through: new Date('2027-02-10T00:00:00Z'),
    members: [
      {
        ...fields,
        id: 'one',
        icsUid: 'UID',
        icsRecurrenceId: '',
        cancelledAt: null,
        cancellationOrigin: null,
        localOverride: false,
        seriesId: null
      }
    ],
    occurrences: [
      { ...fields, uid: 'UID', recurrenceId: '', recurring: false },
      { ...fields, uid: 'uid', recurrenceId: '', recurring: false }
    ],
    protectedIdentities: [],
    stoppedSeriesIds: []
  })
  expect(result.changes).toEqual([])
  expect(result.missing.map((item) => item.uid)).toEqual(['uid'])
})
