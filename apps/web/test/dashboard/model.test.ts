import { describe, expect, test } from 'vitest'
import {
  daySpan,
  mytDay,
  slaLeft,
  sortNeedsReviewBySla,
  stripInput,
  verdictState,
  wilsonInterval
} from '../../features/dashboard/model'
import { dashboardOperations } from '../../features/dashboard/operations'

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

  test('a day strip spans the MYT day of the instant it is given', () => {
    expect(mytDay('2026-11-02T07:00:00Z')).toEqual({
      from: '2026-11-01T16:00:00.000Z',
      to: '2026-11-02T16:00:00.000Z'
    })
    // 23:30 MYT is still the same MYT day, a UTC date later than its start.
    expect(mytDay('2026-11-02T15:30:00Z').from).toBe('2026-11-01T16:00:00.000Z')
  })

  test('a verdict draws as its mode, Storm watch or No call', () => {
    const verdict = { mode: null, watch: false, no_call: null }
    expect(verdictState({ ...verdict, mode: 'commute_disruption' })).toBe('commute_disruption')
    expect(verdictState({ ...verdict, mode: 'normal', watch: true })).toBe('storm_watch')
    expect(verdictState({ ...verdict, mode: 'normal' })).toBe('normal')
    expect(verdictState({ ...verdict, mode: 'normal', no_call: { inputs: [] } })).toBe('no_call')
    expect(verdictState(verdict)).toBe('no_call')
  })

  test('SLA time left counts down from the read and its share of the whole SLA', () => {
    const bundle = { needs_review_at: '2026-11-02T07:05:00Z', sla_due_at: '2026-11-02T07:15:00Z' }
    expect(slaLeft(bundle, 300, 0)).toEqual({ minutes: 5, share: 0.5, passed: false })
    expect(slaLeft(bundle, 300, 2)).toEqual({ minutes: 3, share: 0.3, passed: false })
    expect(slaLeft(bundle, 30, 1)).toEqual({ minutes: 0, share: 0, passed: true })
    // Without the review start, the share is unknown and the capsule draws full.
    expect(slaLeft({ needs_review_at: null, sla_due_at: bundle.sla_due_at }, 61, 0)).toEqual({
      minutes: 2,
      share: 1,
      passed: false
    })
  })

  test('the strip spans its windows with an hour either side, at least six hours, inside their MYT day', () => {
    const at = (time: string) => `2026-11-02T${time}:00+08:00`
    const iso = (time: string) => new Date(at(time)).toISOString()
    const elsewhere = '2026-11-12T09:00:00+08:00'
    // One short window, now on another day: 14:00 to 20:00, the six hours start an hour before it.
    expect(daySpan([{ from: at('15:30'), to: at('15:45') }], elsewhere)).toEqual({
      from: iso('14:00'),
      to: iso('20:00')
    })
    // Now on the same day widens the span to hold it.
    expect(daySpan([{ from: at('15:30'), to: at('15:45') }], at('12:10'))).toEqual({
      from: iso('11:00'),
      to: iso('17:00')
    })
    // Late windows keep six hours by starting earlier, never past midnight.
    expect(daySpan([{ from: at('22:30'), to: at('23:30') }], elsewhere)).toEqual({
      from: iso('18:00'),
      to: new Date('2026-11-02T16:00:00Z').toISOString()
    })
  })

  test('the strip reads the rain lanes under the keys getProjectStrip answers with', () => {
    // The series names packages/api/src/services/signals/strip.ts writes, parsed by the operation's own contract.
    const strip = dashboardOperations.getProjectStrip.response.parse({
      project_id: '019a45b0-0000-7000-8000-000000000003',
      range: { from: '2026-11-02T06:00:00Z', to: '2026-11-02T08:00:00Z' },
      window: null,
      series: {
        'site.rain_5m_mm': [
          ['2026-11-02T07:00:00Z', 9.5, 'received'],
          ['2026-11-02T07:05:00Z', null, 'missed']
        ],
        'site.rain_60m_mm': [['2026-11-02T07:00:00Z', 39, 'received']]
      },
      inputs: [],
      packs: [],
      verdicts: [],
      nights: []
    })
    const input = stripInput(strip, '2026-11-02T07:10:00Z')
    expect(input.rain5).toEqual([
      { at: '2026-11-02T07:00:00Z', value: 9.5, state: 'received' },
      { at: '2026-11-02T07:05:00Z', value: null, state: 'missed' }
    ])
    expect(input.rain60).toEqual([{ at: '2026-11-02T07:00:00Z', value: 39 }])
  })
})
