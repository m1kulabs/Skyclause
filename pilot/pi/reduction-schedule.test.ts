import { describe, expect, test } from 'bun:test'
import { blankState } from './ridership.ts'
import { ReductionSchedule } from './reduction-schedule.ts'

describe('ReductionSchedule', () => {
  test('runs at half-hour marks from noon MYT until yesterday is posted', () => {
    const schedule = new ReductionSchedule()
    const state = blankState()

    expect(schedule.due(new Date('2026-11-09T03:59:00Z'), state)).toBe(false)
    const noon = new Date('2026-11-09T04:00:00Z')
    expect(schedule.due(noon, state)).toBe(true)
    schedule.attempted(noon)
    expect(schedule.due(new Date('2026-11-09T04:01:00Z'), state)).toBe(false)
    expect(schedule.due(new Date('2026-11-09T04:30:00Z'), state)).toBe(true)
    expect(
      schedule.due(new Date('2026-11-09T05:00:00Z'), {
        ...state,
        nights: { '2026-11-08': { value: 17, revision: 1 } }
      })
    ).toBe(false)
  })
})
