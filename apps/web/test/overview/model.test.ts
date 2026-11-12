import { expect, test } from 'vitest'
import { localDateAt, overviewFilterState, selectTodayAtRisk, todaysWindows } from '../../features/overview/model'

function riskWindow(id: string, startsAt: string, atRisk = true) {
  return {
    id,
    title: `Window ${id}`,
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
    at_risk: atRisk
  }
}

test('project-local today follows the project time zone across UTC midnight', () => {
  expect(localDateAt(new Date('2026-11-05T15:50:00.000Z'), 'Asia/Kuala_Lumpur')).toBe('2026-11-05')
  expect(localDateAt(new Date('2026-11-05T16:30:00.000Z'), 'Asia/Kuala_Lumpur')).toBe('2026-11-06')
})

test('today at-risk windows are sorted, filtered and capped at six', () => {
  const today = [
    ...Array.from({ length: 8 }, (_, i) =>
      riskWindow(`today-${i}`, `2026-11-05T${String(8 + i).padStart(2, '0')}:00:00.000Z`)
    ),
    riskWindow('outside', '2026-11-06T01:00:00.000Z'),
    riskWindow('not-at-risk', '2026-11-05T07:00:00.000Z', false)
  ]

  const result = selectTodayAtRisk(today, 'Asia/Kuala_Lumpur', new Date('2026-11-05T13:12:00.000Z'))

  expect(result.total).toBe(8)
  expect(result.windows).toHaveLength(6)
  expect(result.windows.map((window) => window.id)).toEqual([
    'today-0',
    'today-1',
    'today-2',
    'today-3',
    'today-4',
    'today-5'
  ])
})

test('overview pack filter defaults to all and restores valid URL state', () => {
  expect(overviewFilterState(new URLSearchParams())).toEqual({ pack: 'all' })
  expect(overviewFilterState(new URLSearchParams('pack=crowd'))).toEqual({ pack: 'crowd' })
  expect(overviewFilterState(new URLSearchParams('pack=other'))).toEqual({ pack: 'all' })
})

test('today’s windows overlap the project’s day, including one still running from before midnight, never a cancelled one', () => {
  const now = new Date('2026-11-05T01:00:00.000Z') // 09:00 MYT on 5 November
  const windows = [
    riskWindow('tomorrow', '2026-11-05T16:30:00.000Z'), // 00:30 MYT on 6 November
    riskWindow('today', '2026-11-05T02:00:00.000Z'),
    { ...riskWindow('cancelled', '2026-11-05T03:00:00.000Z'), cancelled_at: '2026-11-05T00:30:00.000Z' },
    riskWindow('yesterday', '2026-11-04T10:00:00.000Z'), // 18:00–19:00 MYT on 4 November
    { ...riskWindow('overnight', '2026-11-04T15:30:00.000Z'), ends_at: '2026-11-04T17:30:00.000Z' } // 23:30–01:30 MYT
  ]
  expect(todaysWindows(windows, 'Asia/Kuala_Lumpur', now).map((window) => window.id)).toEqual(['overnight', 'today'])
  expect(selectTodayAtRisk(windows, 'Asia/Kuala_Lumpur', now).windows.map((window) => window.id)).toEqual([
    'overnight',
    'today'
  ])
})
