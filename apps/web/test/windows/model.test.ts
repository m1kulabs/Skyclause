import { describe, expect, test } from 'vitest'
import {
  addDays,
  calendarDays,
  localDate,
  previewOccurrences,
  validateWindow,
  type WindowDraft
} from '../../features/windows/model'

const now = new Date('2026-11-02T01:00:00Z')
const draft: WindowDraft = {
  title: '2 November replay · release wave',
  kind: 'commute_wave',
  date: '2026-11-02',
  start: '15:30',
  end: '16:00',
  repeat: false,
  days: ['monday', 'wednesday'],
  repeatEnd: 'until',
  until: '2026-12-13',
  count: '12',
  skips: '2026-11-04'
}

describe('WIN-8 validation', () => {
  test('end before start is attached to end', () =>
    expect(validateWindow({ ...draft, end: '15:00' }, now).end).toBe('end_before_start'))
  test('more than 12 hours is attached to end', () =>
    expect(validateWindow({ ...draft, start: '01:00', end: '14:00', date: '2026-11-03' }, now).end).toBe('too_long'))
  test('more than 90 days ahead is attached to date', () =>
    expect(validateWindow({ ...draft, date: '2027-02-01' }, now).date).toBe('too_far'))
  test('past start is attached to start with evidence recovery', () =>
    expect(validateWindow({ ...draft, start: '08:00' }, now).start).toBe('past'))
  test('D13 accepts a zero-length commute wave', () =>
    expect(validateWindow({ ...draft, end: '15:30' }, now)).toEqual({}))
  test('zero-length class is invalid', () =>
    expect(validateWindow({ ...draft, kind: 'class', end: '15:30' }, now).end).toBe('end_before_start'))
  test('accepts exactly 90 days and exactly 12 hours', () =>
    expect(validateWindow({ ...draft, date: '2027-01-31', start: '09:00', end: '21:00' }, now)).toEqual({}))
  test('rejects impossible dates and missing time fields', () => {
    expect(validateWindow({ ...draft, date: '2026-02-30' }, now).date).toBe('required')
    expect(validateWindow({ ...draft, start: '' }, now).start).toBe('required')
  })
})

test('WIN-3 Monday and Wednesday for six weeks with one skip previews 11 occurrences', () => {
  const dates = previewOccurrences({ ...draft, repeat: true })
  expect(dates).toHaveLength(11)
  expect(dates[0]).toBe('2026-11-02')
  expect(dates).not.toContain('2026-11-04')
  expect(dates.at(-1)).toBe('2026-12-09')
})

test('count stops before skips and preview materialises only 90 days', () => {
  expect(previewOccurrences({ ...draft, repeat: true, repeatEnd: 'count' })).toHaveLength(11)
  expect(previewOccurrences({ ...draft, repeat: true, until: '2030-12-31' }).at(-1)).toBe('2027-01-27')
})

test('MYT today and month range are independent of the machine time zone', () => {
  expect(localDate('2026-11-01T17:00:00Z')).toBe('2026-11-02')
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(calendarDays('2026-11-15')).toHaveLength(42)
  expect(calendarDays('2026-11-15')[0]).toBe('2026-10-26')
})
