import type { InputState, Poll } from '@skyclause/contracts'
import { t } from './catalogue'

const STATE_ORDER: Record<InputState, number> = {
  error: 0,
  stale: 1,
  pending: 2,
  recovered: 3,
  probation: 4,
  off_hours: 5,
  fresh: 6
}

export interface SourceHealthLike {
  id: string
  external_id?: string
  state: { state: InputState }
  age_s: number | null
}

export function orderSources<T extends SourceHealthLike>(sources: readonly T[]): T[] {
  return [...sources].sort((left, right) => {
    const stateOrder = STATE_ORDER[left.state.state] - STATE_ORDER[right.state.state]
    if (stateOrder !== 0) return stateOrder
    return (right.age_s ?? -1) - (left.age_s ?? -1)
  })
}

export function findingLine(
  sources: readonly Pick<SourceHealthLike, 'state' | 'age_s'>[],
  locale: 'en' | 'ms'
): string {
  // With nothing bound there is no oldest age to print: "oldest 0 min" would be a made-up zero.
  if (!sources.length) return t('signals.finding_empty', {}, locale)
  const reporting = sources.filter(({ state }) => state.state === 'fresh' || state.state === 'recovered').length
  const oldest = Math.max(0, ...sources.map(({ age_s }) => age_s ?? 0))
  return t('signals.finding', { count: reporting, age: Math.round(oldest / 60) }, locale)
}

export function errorsWithinLastDay<T extends Pick<Poll, 'outcome' | 'http_status' | 'started_at'>>(
  polls: readonly T[],
  now: number
): T[] {
  const from = now - 24 * 60 * 60 * 1000
  return polls
    .filter((poll) => {
      const at = Date.parse(poll.started_at)
      // A timeout has no HTTP status but is still an error row (SIG-2, SIG-5): listed, never hidden.
      return poll.outcome === 'error' && at >= from && at <= now
    })
    .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))
}

export function ageAt(ageS: number | null, readAt: number, now: number): number | null {
  if (ageS === null) return null
  return ageS + Math.max(0, Math.floor((now - readAt) / 1000))
}

export function markEventSeen(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  return true
}

export interface NumericPoint {
  at: string
  value: number | null
}

/** Add explicit null points between observations so a chart line cannot bridge a missing interval. */
export function withGaps(points: readonly NumericPoint[], cadenceS: number): NumericPoint[] {
  const ordered = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const result: NumericPoint[] = []
  for (const point of ordered) {
    const previous = result.at(-1)
    if (previous) {
      let missingAt = Date.parse(previous.at) + cadenceS * 1000
      const nextAt = Date.parse(point.at)
      while (missingAt + 1000 < nextAt) {
        result.push({ at: new Date(missingAt).toISOString(), value: null })
        missingAt += cadenceS * 1000
      }
    }
    result.push(point)
  }
  return result
}

/** Wilson 95% interval. Pass the agreement count and total labelled frames. */
export function wilsonInterval(agreements: number, n: number): { low: number; high: number } | null {
  if (n <= 0) return null
  const z = 1.96
  const p = Math.min(1, Math.max(0, agreements / n))
  const z2 = z * z
  const denominator = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denominator
  return {
    low: Math.round(Math.max(0, center - margin) * 1000) / 1000,
    high: Math.round(Math.min(1, center + margin) * 1000) / 1000
  }
}

export function tailCommand(org: string, project: string): string {
  return `skyclause signals tail ${org}/${project}`
}
