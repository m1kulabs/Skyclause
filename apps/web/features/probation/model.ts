export type ProbationView = 'label' | 'resolve' | 'progress'

/** The `?view=` query value; anything else falls back to labelling. */
export function parseView(value: unknown): ProbationView {
  return value === 'resolve' || value === 'progress' ? value : 'label'
}

export interface WilsonInterval {
  lo: number
  hi: number
}

/**
 * Wilson 95% score interval for `successes` settled frames out of `n`, bounds
 * rounded to two decimals. Null when there is nothing to rate, so the progress
 * view prints `n=0` with no interval instead of a bare percentage.
 */
export function wilson(successes: number, n: number): WilsonInterval | null {
  if (!Number.isFinite(successes) || !Number.isFinite(n) || n <= 0) return null
  const z = 1.96
  const p = Math.min(1, Math.max(0, successes / n))
  const denominator = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator
  const round = (value: number) => Math.round(value * 100) / 100
  return { lo: round(centre - half), hi: round(centre + half) }
}

/** Agreement rate over `n` settled frames as whole counted frames for the interval. */
export function agreementInterval(agreement: number | null, n: number): WilsonInterval | null {
  if (agreement === null || !Number.isFinite(agreement)) return null
  return wilson(Math.round(agreement * n), n)
}
