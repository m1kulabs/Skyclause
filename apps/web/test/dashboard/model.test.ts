import { describe, expect, test } from 'vitest'
import { sortNeedsReviewBySla, wilsonInterval } from '../../features/dashboard/model'

const review = (id: string, seconds_remaining: number) => ({
  id,
  project: { id: '019a45b0-0000-7000-8000-000000000003', slug: 'test-project', org_slug: 'test-org' },
  pack: 'sky' as const,
  sla_due_at: '2026-11-02T07:15:00Z',
  seconds_remaining
})

describe('dashboard model', () => {
  test('places the bundle with least SLA time first without mutating the read', () => {
    const bundles = [
      review('019a45b0-0000-7000-8000-000000000004', 600),
      review('019a45b0-0000-7000-8000-000000000005', 60)
    ]

    expect(sortNeedsReviewBySla(bundles).map((bundle) => bundle.id)).toEqual([
      '019a45b0-0000-7000-8000-000000000005',
      '019a45b0-0000-7000-8000-000000000004'
    ])
    expect(bundles[0]?.seconds_remaining).toBe(600)
  })

  test('returns a Wilson 95% interval for the grade count', () => {
    const interval = wilsonInterval(7, 8)

    expect(interval).not.toBeNull()
    if (!interval) return
    expect(interval.low).toBeCloseTo(0.53, 2)
    expect(interval.high).toBeCloseTo(0.98, 2)
  })

  test('returns no interval for a zero-sample grade', () => {
    expect(wilsonInterval(0, 0)).toBeNull()
  })
})
