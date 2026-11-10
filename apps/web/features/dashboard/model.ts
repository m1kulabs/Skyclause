import type { StripInput } from '@skyclause/elements'
import type { DashboardReview, DashboardStrip } from './operations'

export function sortNeedsReviewBySla<T extends Pick<DashboardReview, 'seconds_remaining'>>(reviews: readonly T[]): T[] {
  return [...reviews].sort((a, b) => a.seconds_remaining - b.seconds_remaining)
}

export function wilsonInterval(successes: number, n: number): { low: number; high: number } | null {
  if (n <= 0) return null
  const z = 1.96
  const proportion = successes / n
  const denominator = 1 + (z * z) / n
  const centre = (proportion + (z * z) / (2 * n)) / denominator
  const margin = (z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * n)) / n)) / denominator
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) }
}

export function stripInput(strip: DashboardStrip, now = new Date().toISOString()): StripInput {
  const rain5 = strip.series.rain5 ?? []
  const rain60 = strip.series.rain60 ?? []
  return {
    from: strip.range.from,
    to: strip.range.to,
    now,
    window: strip.window ? { from: strip.window.starts_at, to: strip.window.ends_at } : null,
    rain5: rain5.map(([at, value, state]) => ({
      at,
      value,
      state: state === 'missed' || state === 'error' ? state : 'received'
    })),
    rain60: rain60.map(([at, value]) => ({ at, value })),
    ages: strip.inputs.map((input) => ({ name: input.name, observedAt: input.observed_at }))
  }
}

export const DASHBOARD_BLOCK_ORDER = [
  'needs_review',
  'windows_at_risk',
  'signal_health',
  'upcoming_risks',
  'yesterday_grades'
] as const
