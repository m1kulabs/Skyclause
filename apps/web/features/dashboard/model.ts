import type { Verdict } from '@skyclause/contracts'
import type { StripInput, StripWindow } from '@skyclause/elements'
import { formatDateKey } from '@skyclause/i18n/format'
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
  // The lanes getProjectStrip answers with (packages/api services/signals/strip.ts), as the bundle and overview read them.
  const rain5 = strip.series['site.rain_5m_mm'] ?? []
  const rain60 = strip.series['site.rain_60m_mm'] ?? []
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

/** The MYT day (UTC+8, no daylight saving) that holds an instant: the span a day strip draws. */
export function mytDay(at: string | Date): { from: string; to: string } {
  const from = new Date(`${formatDateKey(at)}T00:00:00+08:00`)
  return { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() }
}

const HOUR = 3_600_000

/**
 * The span a day strip draws for some windows: their hours with an hour either side (and now, when it falls on their
 * day), at least six hours long so a short window reads as a capsule, kept inside the MYT day of the earliest.
 */
export function daySpan(
  windows: ReadonlyArray<{ from: string; to: string }>,
  now: string
): { from: string; to: string } {
  const sorted = [...windows].sort((a, b) => Date.parse(a.from) - Date.parse(b.from))
  const day = mytDay(sorted[0]?.from ?? now)
  const dayFrom = Date.parse(day.from)
  const dayTo = Date.parse(day.to)
  const nowMs = Date.parse(now)
  const times = sorted.flatMap((item) => [Date.parse(item.from), Date.parse(item.to)])
  if (nowMs >= dayFrom && nowMs < dayTo) times.push(nowMs)
  let from = Math.max(dayFrom, Math.floor(Math.min(...times) / HOUR) * HOUR - HOUR)
  let to = Math.min(dayTo, Math.ceil(Math.max(...times) / HOUR) * HOUR + HOUR)
  if (to - from < 6 * HOUR) to = Math.min(dayTo, from + 6 * HOUR)
  if (to - from < 6 * HOUR) from = Math.max(dayFrom, to - 6 * HOUR)
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
}

/** How an engine verdict draws on the day strip: No call when an input blocks it, Storm watch on a Normal watch. */
export function verdictState(verdict: Pick<Verdict, 'mode' | 'watch' | 'no_call'>): NonNullable<StripWindow['state']> {
  if (verdict.no_call) return 'no_call'
  if (verdict.mode === 'normal' && verdict.watch) return 'storm_watch'
  return verdict.mode ?? (verdict.watch ? 'storm_watch' : 'no_call')
}

/**
 * The SLA left on a bundle, counted down from the read by the whole minutes since: the minutes left and their share
 * of the bundle's whole SLA (from needing review to due), which the countdown capsule fills.
 */
export function slaLeft(
  bundle: { needs_review_at: string | null; sla_due_at: string | null },
  secondsRemaining: number,
  minutesSinceRead: number
): { minutes: number; share: number; passed: boolean } {
  const left = secondsRemaining - minutesSinceRead * 60
  const whole =
    bundle.needs_review_at && bundle.sla_due_at
      ? (Date.parse(bundle.sla_due_at) - Date.parse(bundle.needs_review_at)) / 1000
      : null
  const share = whole && whole > 0 ? Math.min(1, Math.max(0, left / whole)) : left > 0 ? 1 : 0
  return { minutes: Math.ceil(Math.max(0, left) / 60), share, passed: left <= 0 }
}

export const DASHBOARD_BLOCK_ORDER = [
  'needs_review',
  'windows_at_risk',
  'signal_health',
  'upcoming_risks',
  'yesterday_grades'
] as const
