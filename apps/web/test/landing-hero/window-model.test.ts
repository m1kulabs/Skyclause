import { expect, test } from 'vitest'
import {
  addDaysLocalDate,
  clampWindow,
  datesTodayPlusSeven,
  localDateOf,
  nextHourWindow,
  parseLocalTime,
  parseTimeInput,
  parseWindowFromSearch,
  snapToStep,
  TIME_INPUT_PATTERN
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
  expect(parseWindowFromSearch('date=2026-11-13&start=21%3A30&end=23%3A00', now)).toBeNull()
  expect(parseWindowFromSearch('date=2026-11-06&start=21%3A31&end=23%3A00', now)).toBeNull()
  expect(parseWindowFromSearch('', now)).toBeNull()
  expect(parseWindowFromSearch('date=2026-11-06&end=23%3A00', now)).toBeNull()
})

test('a query without an end (the closing sentence asks for one time) reads the hour from its start', () => {
  const now = new Date('2026-11-05T13:12:00Z')
  expect(parseWindowFromSearch('date=2026-11-06&start=15%3A30', now)).toEqual({
    date: '2026-11-06',
    startMin: 930,
    endMin: 990
  })
  expect(parseWindowFromSearch('date=2026-11-06&start=15%3A30&end=', now)).toEqual({
    date: '2026-11-06',
    startMin: 930,
    endMin: 990
  })
  // Late starts keep the day's last step.
  expect(parseWindowFromSearch('date=2026-11-06&start=23%3A30', now)).toEqual({
    date: '2026-11-06',
    startMin: 1410,
    endMin: 1425
  })
  expect(parseWindowFromSearch('date=2026-11-06&start=15%3A20', now)).toBeNull()
})

test('a typed time takes any common form on the quarter hour, so a phone number pad is never needed', () => {
  for (const [typed, minutes] of [
    ['15:30', 930],
    ['1530', 930],
    ['15.30', 930],
    ['15h30', 930],
    ['930', 570],
    ['9:30', 570],
    ['09:30', 570],
    ['3.30pm', 930],
    ['3:30 pm', 930],
    ['3:30 P.M.', 930],
    ['3pm', 900],
    ['12am', 0],
    ['12:15pm', 735],
    ['15', 900],
    [' 15:30 ', 930]
  ] as const)
    expect(parseTimeInput(typed), typed).toBe(minutes)
  for (const typed of ['15:20', '24:00', '1560', '13pm', '0pm', '', 'soon', '15:30:00'])
    expect(parseTimeInput(typed), typed).toBeNull()
  // The pattern the no-JS fields carry accepts exactly the forms the parser reads.
  const pattern = new RegExp(`^(?:${TIME_INPUT_PATTERN})$`)
  for (const typed of ['15:30', '1530', '3.30pm', '3pm', '12am', '15']) expect(pattern.test(typed), typed).toBe(true)
  for (const typed of ['15:20', '24:00', '13pm', 'soon']) expect(pattern.test(typed), typed).toBe(false)
})

test('the window query reads the same common forms', () => {
  const now = new Date('2026-11-05T13:12:00Z')
  expect(parseWindowFromSearch('date=2026-11-06&start=1530', now)).toEqual({
    date: '2026-11-06',
    startMin: 930,
    endMin: 990
  })
  expect(parseWindowFromSearch('date=2026-11-06&start=3.30pm&end=5pm', now)).toEqual({
    date: '2026-11-06',
    startMin: 930,
    endMin: 1020
  })
})
