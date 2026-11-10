// #162 c-analysis-api: the interval every rate prints (PRD ANL-5) and the quantile every delay prints. Pure.

/**
 * Wilson's score interval for `x` successes in `n` trials (TRD grading; NIST/SEMATECH e-Handbook 7.2.4.1; Wilson 1927):
 * `(p̂ + z²/2n ± z·√(p̂(1 − p̂)/n + z²/4n²)) ÷ (1 + z²/n)` with `p̂ = x/n`, at z = 1.96 for 95%. Null when n = 0: no
 * interval, never a default. `#187`'s public grades call it too.
 */
export function wilson(x: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (!Number.isInteger(x) || !Number.isInteger(n) || x < 0 || x > n) {
    throw new Error(`wilson needs whole counts 0 ≤ x ≤ n, not ${x} of ${n}`)
  }
  if (n === 0) return null
  const p = x / n
  const z2 = z * z
  const centre = p + z2 / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  const scale = 1 + z2 / n
  // At x = 0 or x = n the bound is exactly 0 or 1; clamping drops float error around it.
  return { low: x === 0 ? 0 : (centre - spread) / scale, high: x === n ? 1 : (centre + spread) / scale }
}

/** The `q` quantile of `values`, interpolating between the closest ranks (Hyndman and Fan's type 7); null for none. */
export function quantile(values: readonly number[], q: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const h = (sorted.length - 1) * q
  const below = Math.floor(h)
  const above = Math.min(below + 1, sorted.length - 1)
  return sorted[below]! + (h - below) * (sorted[above]! - sorted[below]!)
}
