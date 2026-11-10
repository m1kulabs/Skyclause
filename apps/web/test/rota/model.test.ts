import { expect, test } from 'vitest'
import { formatMytClock, isoWeekday, nextSevenDays } from '../../features/rota/model'

test('rota dates use MYT days and ISO weekdays', () => {
  const days = nextSevenDays(new Date('2026-11-09T16:30:00Z'))

  expect(days[0]).toEqual({ date: '2026-11-10', isoWeekday: 2 })
  expect(days).toHaveLength(7)
  expect(days.map((day) => day.isoWeekday)).toEqual([2, 3, 4, 5, 6, 7, 1])
  expect(isoWeekday('2026-11-16')).toBe(1)
})

test('rota clock output uses 24-hour MYT', () => {
  expect(formatMytClock('2026-11-09T16:30:00Z', 'en')).toBe('00:30')
})
