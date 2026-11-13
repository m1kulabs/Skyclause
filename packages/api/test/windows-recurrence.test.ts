import { describe, expect, test } from 'vitest'
import type { NativeRule, WindowFields } from '../src/services/windows/calendar-types'
import { expandWeeklyDates, validateRecurrence } from '../src/services/windows/recurrence'
import { validateWindowFields } from '../src/services/windows/validation'

const anchor = '2026-11-16'
const rule: NativeRule = {
  frequency: 'weekly',
  days_of_week: ['monday', 'wednesday'],
  until: '2026-12-23',
  skip_dates: ['2026-11-25']
}
const dates = [
  '2026-11-16',
  '2026-11-18',
  '2026-11-23',
  '2026-11-30',
  '2026-12-02',
  '2026-12-07',
  '2026-12-09',
  '2026-12-14',
  '2026-12-16',
  '2026-12-21',
  '2026-12-23'
]

describe('native weekly recurrence', () => {
  test('inclusive until and count-before-skips return the exact eleven scheduled dates', () => {
    expect(validateRecurrence(rule, anchor)).toEqual([])
    expect(expandWeeklyDates(rule, anchor, '2027-01-31')).toEqual(dates)
    const counted = { ...rule, until: undefined, count: 12 }
    expect(validateRecurrence(counted, anchor)).toEqual([])
    expect(expandWeeklyDates(counted, anchor, '2027-01-31')).toEqual(dates)
  })

  test('extending through preserves the original anchor, count and skipped membership', () => {
    const counted = { ...rule, until: undefined, count: 12 }
    expect(expandWeeklyDates(counted, anchor, '2026-11-25')).toEqual(['2026-11-16', '2026-11-18', '2026-11-23'])
    expect(expandWeeklyDates(counted, anchor, '2026-12-02')).toEqual(dates.slice(0, 5))
    expect(expandWeeklyDates(counted, anchor, '2027-06-01')).toEqual(dates)
  })

  test('refuses excessive historical enumeration without returning a partial schedule', () => {
    const old = { ...rule, days_of_week: ['monday'] as const, until: '9999-12-31', skip_dates: [] }
    expect(() =>
      expandWeeklyDates({ ...old, days_of_week: [...old.days_of_week] }, '0001-01-01', '9999-12-31')
    ).toThrow('Native recurrence work limit exceeded')
    expect(
      expandWeeklyDates(
        { ...old, days_of_week: [...old.days_of_week], until: undefined, count: 1 },
        '0001-01-01',
        '9999-12-31'
      )
    ).toEqual(['0001-01-01'])
  })

  test('skipping the anchor consumes count and never creates a replacement', () => {
    const skippedAnchor = { ...rule, until: undefined, count: 1, skip_dates: [anchor] }
    expect(expandWeeklyDates(skippedAnchor, anchor, '2026-12-31')).toEqual([])
  })

  test('through is inclusive and may precede the anchor', () => {
    expect(expandWeeklyDates(rule, anchor, anchor)).toEqual([anchor])
    expect(expandWeeklyDates(rule, anchor, '2026-11-15')).toEqual([])
  })

  test('enumerates civil dates across midnight, leap days, year changes and DST without process timezone', () => {
    const previousTz = process.env.TZ
    try {
      for (const tz of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
        process.env.TZ = tz
        expect(
          expandWeeklyDates(
            { ...rule, days_of_week: ['saturday', 'sunday'], until: '2026-11-02', skip_dates: [] },
            '2026-10-31',
            '2026-11-02'
          )
        ).toEqual(['2026-10-31', '2026-11-01'])
        expect(
          expandWeeklyDates(
            { ...rule, days_of_week: ['monday', 'tuesday'], until: '2028-03-01', skip_dates: [] },
            '2028-02-28',
            '2028-03-01'
          )
        ).toEqual(['2028-02-28', '2028-02-29'])
        expect(
          expandWeeklyDates(
            { ...rule, days_of_week: ['thursday', 'friday'], until: '2027-01-01', skip_dates: [] },
            '2026-12-31',
            '2027-01-01'
          )
        ).toEqual(['2026-12-31', '2027-01-01'])
      }
    } finally {
      if (previousTz === undefined) delete process.env.TZ
      else process.env.TZ = previousTz
    }
  })

  test.each([
    [{ days_of_week: ['monday', 'monday'] }, '/recurrence/days_of_week'],
    [{ days_of_week: [] }, '/recurrence/days_of_week'],
    [{ days_of_week: ['tuesday'] }, '/recurrence/days_of_week'],
    [{ days_of_week: ['Monday'] }, '/recurrence/days_of_week/0'],
    [{ frequency: 'daily' }, '/recurrence/frequency'],
    [{ until: undefined }, '/recurrence'],
    [{ count: 12 }, '/recurrence'],
    [{ until: '2026-11-15' }, '/recurrence/until'],
    [{ until: '2026-02-30' }, '/recurrence/until'],
    [{ until: '0000-12-23' }, '/recurrence/until'],
    [{ until: '2026-2-03' }, '/recurrence/until'],
    [{ until: undefined, count: 0 }, '/recurrence/count'],
    [{ until: undefined, count: -1 }, '/recurrence/count'],
    [{ until: undefined, count: 1.5 }, '/recurrence/count'],
    [{ until: undefined, count: Infinity }, '/recurrence/count'],
    [{ until: undefined, count: Number.MAX_SAFE_INTEGER + 1 }, '/recurrence/count'],
    [{ days_of_week: null }, '/recurrence/days_of_week'],
    [{ days_of_week: 'monday' }, '/recurrence/days_of_week'],
    [{ skip_dates: null }, '/recurrence/skip_dates'],
    [{ skip_dates: '2026-11-25' }, '/recurrence/skip_dates'],
    [{ skip_dates: ['2026-02-29'] }, '/recurrence/skip_dates/0'],
    [{ skip_dates: ['2026-11-25', '2026-13-01'] }, '/recurrence/skip_dates/1'],
    [{ extra: true }, '/recurrence/extra']
  ])('reports invalid recurrence %j at %s', (patch, pointer) => {
    expect(validateRecurrence({ ...rule, ...patch } as NativeRule, anchor).map((issue) => issue.pointer)).toContain(
      pointer
    )
  })

  test('retains independent recurrence errors', () => {
    const issues = validateRecurrence(
      { ...rule, days_of_week: ['monday', 'monday'], until: '2026-02-30', skip_dates: ['invalid'] },
      anchor
    )
    expect(issues.map((issue) => issue.pointer)).toEqual([
      '/recurrence/days_of_week',
      '/recurrence/until',
      '/recurrence/skip_dates/0'
    ])
  })

  test('invalid anchor and expansion bounds fail rather than silently normalize', () => {
    expect(validateRecurrence(rule, '2026-02-30').map((issue) => issue.pointer)).toContain('/starts_at')
    expect(() => expandWeeklyDates(rule, '2026-02-30', '2026-12-31')).toThrow()
    expect(() => expandWeeklyDates(rule, anchor, '2026-02-30')).toThrow()
    expect(() => expandWeeklyDates({ ...rule, until: undefined }, anchor, '2026-12-31')).toThrow()
  })

  test('accepts civil years below 100 without the Date constructor 1900 offset', () => {
    expect(
      expandWeeklyDates(
        { ...rule, days_of_week: ['monday'], until: '0001-01-08', skip_dates: [] },
        '0001-01-01',
        '0001-01-08'
      )
    ).toEqual(['0001-01-01', '0001-01-08'])
  })
})

const now = new Date('2026-11-13T00:00:00Z')
const fields: WindowFields = {
  starts_at: '2026-11-13T00:00:00Z',
  ends_at: '2026-11-13T12:00:00Z',
  kind: 'class',
  tz: 'Asia/Kuala_Lumpur'
}

describe('WIN-8 pure validation', () => {
  test.each([
    {},
    { starts_at: '2027-02-11T00:00:00Z', ends_at: '2027-02-11T12:00:00Z' },
    { starts_at: '2026-11-13T23:59:59.123Z', ends_at: '2026-11-14T00:00:00.123Z' },
    { starts_at: '2026-11-13T00:00:00.1Z', ends_at: '2026-11-13T00:00:00.12Z' },
    { kind: 'commute_wave', ends_at: fields.starts_at }
  ] as Partial<WindowFields>[])('allows exact boundaries and valid UTC milliseconds: %j', (patch) => {
    expect(validateWindowFields({ ...fields, ...patch }, now)).toEqual([])
  })

  test.each([
    [{ ends_at: '2026-11-13T12:00:00.001Z' }, '/ends_at'],
    [{ ends_at: '2026-11-12T23:59:59.999Z' }, '/ends_at'],
    [{ ends_at: fields.starts_at }, '/ends_at'],
    [{ ends_at: fields.starts_at, kind: 'event' }, '/ends_at'],
    [{ starts_at: '2026-11-12T23:59:59.999Z', ends_at: '2026-11-13T01:00:00Z' }, '/starts_at'],
    [{ starts_at: '2027-02-11T00:00:00.001Z', ends_at: '2027-02-11T01:00:00Z' }, '/starts_at'],
    [{ starts_at: '2027-02-11T00:00:00.0001Z', ends_at: '2027-02-11T01:00:00Z' }, '/starts_at'],
    [{ ends_at: '2026-11-13T12:00:00.0001Z' }, '/ends_at']
  ] as Array<[Partial<WindowFields>, string]>)('rejects invalid boundary %j at %s', (patch, pointer) => {
    expect(validateWindowFields({ ...fields, ...patch }, now).map((issue) => issue.pointer)).toEqual([pointer])
  })

  test.each([
    'invalid',
    '2026-11-13',
    '2026-11-13T00:00:00',
    '2026-11-13T00:00:00+00:00',
    '2026-02-30T00:00:00Z',
    '2026-11-13T24:00:00Z',
    '2026-11-13T00:00:60Z',
    '0000-11-13T00:00:00Z',
    '+010000-11-13T00:00:00Z',
    '2026-11-13T00:00:00.0000Z',
    '2026-11-13T00:00:00Z\n'
  ])('rejects malformed or unrepresentable instants at each affected field: %s', (instant) => {
    expect(
      validateWindowFields({ ...fields, starts_at: instant, ends_at: instant }, now).map((issue) => issue.pointer)
    ).toEqual(['/starts_at', '/ends_at'])
  })

  test('retains independent start/horizon and end/duration errors', () => {
    expect(
      validateWindowFields({ ...fields, starts_at: '2026-11-12T23:59:59.999Z' }, now).map((issue) => issue.pointer)
    ).toEqual(['/starts_at', '/ends_at'])
  })

  test('does not depend on process timezone or mutate the injected clock', () => {
    const previousTz = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(validateWindowFields(fields, now)).toEqual([])
      expect(now.toISOString()).toBe('2026-11-13T00:00:00.000Z')
    } finally {
      if (previousTz === undefined) delete process.env.TZ
      else process.env.TZ = previousTz
    }
  })
})
