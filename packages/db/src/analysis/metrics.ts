import { quantile, wilson } from './wilson'

// #162 c-analysis-api: TRD grading's figures, from the facts the materialiser reads (or a what-if's replayed grades).
// Pure, so live figures, the roll-up and what-if replays use the same formulas.

export type AnalysisPack = 'sky' | 'crowd'

/** One non-guest grade. `clauses`: the clauses its shadow verdict fired; `forecast`: the Crowd figure it was graded on. */
export interface GradeFact {
  pack: AnalysisPack
  outcome: string
  /** A grade of a call; night and callless-window grades carry `agrees = false` and stay out of agreement. */
  callGrade: boolean
  agrees: boolean
  staleInputs: boolean
  clauses: string[]
  localDate: string
  actual: number | null
  forecast: number | null
}

export type DelayKind = 'crossing_to_approved' | 'approved_to_sent'
export interface DelayFact {
  pack: AnalysisPack
  kind: DelayKind
  minutes: number
  localDate: string
}

/** LED-6's evidence-assembly minutes, `drafted_at − received_at`; an evidence request belongs to no pack. */
export interface EvidenceFact {
  minutes: number
  localDate: string
}

export interface Facts {
  grades: GradeFact[]
  delays: DelayFact[]
  evidence: EvidenceFact[]
}

/**
 * One figure. A rate has `x` of `n`, `value = x ÷ n` and its Wilson interval; a quantile has no `x` and no interval,
 * `n` samples, kept so figures can be pooled across projects. n = 0 leaves value, low and high null.
 */
export interface MetricRow {
  pack: AnalysisPack | null
  clause: string | null
  metric: string
  x: number | null
  n: number
  value: number | null
  low: number | null
  high: number | null
  samples: number[] | null
}

/** Each quantile figure and the quantile it takes. */
export const QUANTILES: Record<string, number> = {
  ape_median: 0.5,
  crossing_to_approved_p50: 0.5,
  crossing_to_approved_p95: 0.95,
  approved_to_sent_p50: 0.5,
  approved_to_sent_p95: 0.95,
  evidence_minutes_p50: 0.5,
  evidence_minutes_p95: 0.95
}

export function rateRow(pack: AnalysisPack | null, clause: string | null, metric: string, x: number, n: number) {
  const interval = wilson(x, n)
  return {
    pack,
    clause,
    metric,
    x,
    n,
    value: n ? x / n : null,
    low: interval?.low ?? null,
    high: interval?.high ?? null,
    samples: null
  } satisfies MetricRow
}

function quantileRow(pack: AnalysisPack | null, metric: string, samples: number[]): MetricRow {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    pack,
    clause: null,
    metric,
    x: null,
    n: sorted.length,
    value: quantile(sorted, QUANTILES[metric]!),
    low: null,
    high: null,
    samples: sorted
  }
}

const count = (grades: GradeFact[], outcome: string) => grades.filter((g) => g.outcome === outcome).length

/**
 * Precision = hits ÷ (hits + false alarms), recall = hits ÷ (hits + misses), false-alarm ratio = false alarms ÷ (hits
 * + false alarms). No call grades count in none of them (they are reported apart).
 */
export function skillRows(pack: AnalysisPack, clause: string | null, grades: GradeFact[]): MetricRow[] {
  const hit = count(grades, 'hit')
  const miss = count(grades, 'miss')
  const falseAlarm = count(grades, 'false_alarm')
  return [
    rateRow(pack, clause, 'precision', hit, hit + falseAlarm),
    rateRow(pack, clause, 'recall', hit, hit + miss),
    rateRow(pack, clause, 'false_alarm_ratio', falseAlarm, hit + falseAlarm)
  ]
}

/** No call grades, apart: their count of the pack's grades. */
export const noCallRow = (pack: AnalysisPack, grades: GradeFact[]) =>
  rateRow(pack, null, 'no_call', count(grades, 'no_call'), grades.length)

function delayRows(pack: AnalysisPack, delays: DelayFact[]): MetricRow[] {
  return (['crossing_to_approved', 'approved_to_sent'] as const).flatMap((kind) => {
    const minutes = delays.filter((d) => d.pack === pack && d.kind === kind).map((d) => d.minutes)
    return [quantileRow(pack, `${kind}_p50`, minutes), quantileRow(pack, `${kind}_p95`, minutes)]
  })
}

/**
 * Every figure over `range` (project-local dates, inclusive), per pack, with Sky's skill figures also per clause in
 * `clauses`. Every figure is present, at n = 0 when nothing counts.
 */
export function computeMetrics(facts: Facts, range: { from: string; to: string }, clauses: string[]): MetricRow[] {
  const within = <T extends { localDate: string }>(rows: T[]) =>
    rows.filter((r) => range.from <= r.localDate && r.localDate <= range.to)
  const grades = within(facts.grades)
  const delays = within(facts.delays)
  const sky = grades.filter((g) => g.pack === 'sky')
  const crowd = grades.filter((g) => g.pack === 'crowd')
  // Agent–shadow agreement: agreeing calls ÷ graded calls, without stale-input cases.
  const calls = sky.filter((g) => g.callGrade && !g.staleInputs)
  const inBand = count(crowd, 'in_band')
  const nights = inBand + count(crowd, 'out_of_band') + count(crowd, 'unlisted_surge')
  // Absolute percentage error |actual − forecast| ÷ actual, for nights graded against a forecast.
  const errors = crowd.flatMap((g) =>
    g.forecast !== null && g.actual !== null && g.actual > 0 ? [Math.abs(g.actual - g.forecast) / g.actual] : []
  )
  const evidence = within(facts.evidence).map((e) => e.minutes)
  return [
    ...skillRows('sky', null, sky),
    noCallRow('sky', sky),
    rateRow('sky', null, 'agreement', calls.filter((g) => g.agrees).length, calls.length),
    ...delayRows('sky', delays),
    ...clauses.flatMap((clause) =>
      skillRows(
        'sky',
        clause,
        sky.filter((g) => g.clauses.includes(clause))
      )
    ),
    rateRow('crowd', null, 'band_coverage', inBand, nights),
    quantileRow('crowd', 'ape_median', errors),
    ...delayRows('crowd', delays),
    quantileRow(null, 'evidence_minutes_p50', evidence),
    quantileRow(null, 'evidence_minutes_p95', evidence)
  ]
}

/**
 * The same figures over several projects: rates sum `x` and `n` and take the interval again; quantiles join their
 * samples and take the quantile again. Order is the first project's.
 */
export function pool(rows: MetricRow[]): MetricRow[] {
  const groups = new Map<string, MetricRow[]>()
  for (const row of rows) {
    const key = `${row.pack}\u0000${row.clause}\u0000${row.metric}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map((group) => {
    const { pack, clause, metric } = group[0]!
    if (metric in QUANTILES)
      return {
        ...quantileRow(
          pack,
          metric,
          group.flatMap((r) => r.samples ?? [])
        ),
        clause
      }
    const sum = (pick: (r: MetricRow) => number | null) => group.reduce((total, r) => total + (pick(r) ?? 0), 0)
    return rateRow(
      pack,
      clause,
      metric,
      sum((r) => r.x),
      sum((r) => r.n)
    )
  })
}

/** The kill line: agent–shadow disagreement above 1 in 10 graded calls, over the figures' pooled agreement. */
export function killLine(rows: MetricRow[]): boolean {
  const agreement = rows.filter((r) => r.metric === 'agreement' && r.clause === null)
  const x = agreement.reduce((total, r) => total + (r.x ?? 0), 0)
  const n = agreement.reduce((total, r) => total + r.n, 0)
  return 10 * (n - x) > n
}
