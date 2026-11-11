import { expect, test } from 'vitest'
import {
  addDaysLocalDate,
  clampWindow,
  datesTodayPlusSeven,
  localDateOf,
  nextHourWindow,
  parseLocalTime,
  parseWindowFromSearch,
  snapToStep
} from '../../features/landing-hero/window-model'

test('dates today plus seven run eight days in MYT, today first', () => {
  // 2026-11-05 13:12 UTC is 21:12 MYT on 5 November.
  const dates = datesTodayPlusSeven(new Date('2026-11-05T13:12:00Z'))
  expect(dates).toHaveLength(8)
  expect(dates[0]).toBe('2026-11-05')
  expect(dates[7]).toBe('2026-11-12')
  expect(localDateOf(new Date('2026-11-05T16:30:00Z'))).toBe('2026-11-06')
  expect(addDaysLocalDate('2026-11-30', 1)).toBe('2026-12-01')
})

test('the next hour is the hour after now, rolling the date past midnight', () => {
  expect(nextHourWindow(new Date('2026-11-05T13:12:00Z'))).toEqual({ date: '2026-11-05', startMin: 1320, endMin: 1380 })
  // 23:30 MYT nexts to midnight.
  expect(nextHourWindow(new Date('2026-11-05T15:30:00Z'))).toEqual({ date: '2026-11-06', startMin: 0, endMin: 60 })
  // On the hour still means the next hour, never the current one.
  expect(nextHourWindow(new Date('2026-11-05T13:00:00Z'))).toEqual({ date: '2026-11-05', startMin: 1320, endMin: 1380 })
})

test('times snap to 15-minute steps and windows hold range limits', () => {
  expect(parseLocalTime('09:15')).toBe(555)
  expect(parseLocalTime('09:16')).toBeNull()
  expect(parseLocalTime('24:00')).toBeNull()
  expect(parseLocalTime('9:15')).toBeNull()
  expect(snapToStep(556)).toBe(555)
  expect(snapToStep(558)).toBe(555)
  expect(snapToStep(563)).toBe(570)
  expect(clampWindow(0, 0)).toEqual({ start: 0, end: 15 })
  expect(clampWindow(1425, 1425)).toEqual({ start: 1410, end: 1425 })
  expect(clampWindow(60, 1440)).toEqual({ start: 60, end: 1425 })
  expect(clampWindow(1440, 1440)).toEqual({ start: 1410, end: 1425 })
})

test('a GET query gives a window only when every part validates inside today plus seven', () => {
  const now = new Date('2026-11-05T13:12:00Z')
  expect(parseWindowFromSearch('date=2026-11-06&start=21%3A30&end=23%3A00', now)).toEqual({
    date: '2026-11-06',
    startMin: 1290,
    endMin: 1380
  })
  expect(parseWindowFromSearch('date=2026-11-06&start=21%3A30', now)).toBeNull()
  expect(parseWindowFromSearch('date=2026-11-13&start=21%3A30&end=23%3A00', now)).toBeNull()
  expect(parseWindowFromSearch('date=2026-11-06&start=21%3A31&end=23%3A00', now)).toBeNull()
  expect(parseWindowFromSearch('', now)).toBeNull()
})
