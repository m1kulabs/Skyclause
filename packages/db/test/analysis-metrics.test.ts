// #162 c-analysis-api: TRD grading's figures from grade, delay and evidence facts, and pooling across projects. Pure.
import { describe, expect, test } from 'vitest'
import { computeMetrics, killLine, pool, wilson, type Facts, type GradeFact, type MetricRow } from '../src/analysis'

const range = { from: '2026-11-01', to: '2026-11-07' }
const sky = (outcome: string, o: Partial<GradeFact> = {}): GradeFact => ({
  pack: 'sky',
  outcome,
  callGrade: true,
  agrees: true,
  staleInputs: false,
  clauses: [],
  localDate: '2026-11-03',
  actual: null,
  forecast: null,
  ...o
})
const crowd = (outcome: string, actual: number | null, forecast: number | null): GradeFact => ({
  ...sky(outcome, { pack: 'crowd', callGrade: false, agrees: false }),
  actual,
  forecast
})
const none: Facts = { grades: [], delays: [], evidence: [] }
const find = (rows: MetricRow[], pack: string | null, metric: string, clause: string | null = null) =>
  rows.find((r) => r.pack === pack && r.metric === metric && r.clause === clause)
const rate = (x: number, n: number) => ({ x, n, value: x / n, ...wilson(x, n)!, samples: null })

describe('computeMetrics', () => {
  const storm = ['storm_watch']
  const facts: Facts = {
    grades: [
      sky('hit', { clauses: storm }),
      sky('hit', { clauses: storm }),
      sky('hit', { clauses: storm, agrees: false }),
      sky('false_alarm', { clauses: ['storm_watch', 'haze_watch'] }),
      sky('miss', { clauses: ['haze_watch'], agrees: false, staleInputs: true }),
      sky('miss', { callGrade: false, agrees: false }),
      sky('correct_normal'),
      sky('no_call'),
      sky('no_call', { callGrade: false, agrees: false }),
      // Outside the range: counts nowhere.
      sky('hit', { clauses: storm, localDate: '2026-10-31' }),
      crowd('in_band', 25_000, 27_044),
      // ANL-3's 4 November 2026 night (labelled replay of the SP17 capture): 33,804 against 27,044.
      crowd('out_of_band', 33_804, 27_044),
      crowd('unlisted_surge', 9_000, null)
    ],
    delays: [
      ...[10, 40, 20, 30].map((minutes) => ({
        pack: 'sky' as const,
        kind: 'crossing_to_approved' as const,
        minutes,
        localDate: '2026-11-02'
      })),
      { pack: 'sky', kind: 'approved_to_sent', minutes: 2, localDate: '2026-11-02' },
      { pack: 'sky', kind: 'approved_to_sent', minutes: 99, localDate: '2026-11-08' }
    ],
    evidence: [
      { minutes: 90, localDate: '2026-11-05' },
      { minutes: 30, localDate: '2026-11-01' }
    ]
  }
  const rows = computeMetrics(facts, range, ['haze_watch', 'storm_watch'])

  test('precision, recall and false-alarm ratio count hits, misses and false alarms; No call apart', () => {
    expect(find(rows, 'sky', 'precision')).toMatchObject(rate(3, 4))
    expect(find(rows, 'sky', 'recall')).toMatchObject(rate(3, 5))
    expect(find(rows, 'sky', 'false_alarm_ratio')).toMatchObject(rate(1, 4))
    // Its own count: 2 No call grades of the 9 Sky grades in range.
    expect(find(rows, 'sky', 'no_call')).toMatchObject(rate(2, 9))
  })

  test('per clause, a grade counts for each clause its shadow verdict fired', () => {
    expect(find(rows, 'sky', 'precision', 'storm_watch')).toMatchObject(rate(3, 4))
    expect(find(rows, 'sky', 'recall', 'storm_watch')).toMatchObject(rate(3, 3))
    expect(find(rows, 'sky', 'precision', 'haze_watch')).toMatchObject(rate(0, 1))
    expect(find(rows, 'sky', 'recall', 'haze_watch')).toMatchObject(rate(0, 1))
    expect(find(rows, 'sky', 'false_alarm_ratio', 'haze_watch')).toMatchObject(rate(1, 1))
  })

  test('agreement is agreeing calls over call grades, without stale-input cases', () => {
    // Call grades: 3 hits (one disagrees), the false alarm, the stale miss (out), Correct Normal and a No call.
    expect(find(rows, 'sky', 'agreement')).toMatchObject(rate(5, 6))
  })

  test('band coverage is in band over graded nights; forecast error is the median APE', () => {
    // In band, out of band and the unlisted surge are all graded nights (TRD grading).
    expect(find(rows, 'crowd', 'band_coverage')).toMatchObject(rate(1, 3))
    const ape = find(rows, 'crowd', 'ape_median')!
    expect(ape).toMatchObject({ x: null, n: 2, low: null, high: null })
    // (2,044 ÷ 25,000 + 6,760 ÷ 33,804) ÷ 2.
    expect(ape.value).toBeCloseTo(0.140868167, 9)
  })

  test('delays and evidence-assembly minutes at p50 and p95, with n', () => {
    expect(find(rows, 'sky', 'crossing_to_approved_p50')).toMatchObject({ x: null, n: 4, value: 25, low: null })
    expect(find(rows, 'sky', 'crossing_to_approved_p95')!.value).toBeCloseTo(38.5, 9)
    expect(find(rows, 'sky', 'approved_to_sent_p95')).toMatchObject({ n: 1, value: 2 })
    expect(find(rows, null, 'evidence_minutes_p50')).toMatchObject({ n: 2, value: 60, samples: [30, 90] })
    expect(find(rows, null, 'evidence_minutes_p95')!.value).toBeCloseTo(87, 9)
  })

  test('with nothing graded, every figure is n = 0 with no value and no interval', () => {
    const empty = computeMetrics(none, range, [])
    expect(empty.map((r) => `${r.pack} ${r.metric}`)).toEqual([
      'sky precision',
      'sky recall',
      'sky false_alarm_ratio',
      'sky no_call',
      'sky agreement',
      'sky crossing_to_approved_p50',
      'sky crossing_to_approved_p95',
      'sky approved_to_sent_p50',
      'sky approved_to_sent_p95',
      'crowd band_coverage',
      'crowd ape_median',
      'crowd crossing_to_approved_p50',
      'crowd crossing_to_approved_p95',
      'crowd approved_to_sent_p50',
      'crowd approved_to_sent_p95',
      'null evidence_minutes_p50',
      'null evidence_minutes_p95'
    ])
    for (const row of empty) expect(row).toMatchObject({ n: 0, value: null, low: null, high: null })
  })
})

describe('pool', () => {
  test('sums counts and re-takes the interval; joins samples and re-takes the quantile', () => {
    const a = computeMetrics(
      {
        ...none,
        grades: [sky('hit'), sky('false_alarm')],
        delays: [{ pack: 'sky', kind: 'crossing_to_approved', minutes: 10, localDate: '2026-11-02' }]
      },
      range,
      []
    )
    const b = computeMetrics(
      {
        ...none,
        grades: [sky('hit'), sky('hit')],
        delays: [{ pack: 'sky', kind: 'crossing_to_approved', minutes: 30, localDate: '2026-11-02' }]
      },
      range,
      []
    )
    const pooled = pool([...a, ...b])
    expect(find(pooled, 'sky', 'precision')).toMatchObject(rate(3, 4))
    expect(find(pooled, 'sky', 'crossing_to_approved_p50')).toMatchObject({ n: 2, value: 20 })
    expect(pooled).toHaveLength(a.length)
  })
})

describe('killLine', () => {
  test('is crossed above 1 disagreement in 10, never at n = 0', () => {
    const agreement = (agree: number, disagree: number) =>
      computeMetrics(
        {
          ...none,
          grades: [
            ...Array.from({ length: agree }, () => sky('hit')),
            ...Array.from({ length: disagree }, () => sky('hit', { agrees: false }))
          ]
        },
        range,
        []
      )
    expect(killLine(agreement(9, 1))).toBe(false)
    expect(killLine(agreement(17, 3))).toBe(true)
    expect(killLine(agreement(0, 0))).toBe(false)
  })
})
