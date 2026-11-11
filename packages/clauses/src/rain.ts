// JPS samples cover (T - 5 minutes, T]; poll cadence is not measurement cadence.
export const RAIN_STEP_MS = 300_000
interface RainSample {
  iso: string
  ms: number
  value: number | null
  id: string
}

export function rainPeriod<T extends RainSample>(
  samples: readonly T[],
  atMs: number,
  durationMs: number,
  allowLiveEdgeCarry = true
): {
  samples: T[]
  total: number | null
  observedAt: string
  endMs: number
} | null {
  const available = samples.filter((sample) => Number.isFinite(sample.ms) && sample.ms <= atMs)
  const end = available.reduce<T | undefined>(
    (latest, sample) => (!latest || sample.ms > latest.ms ? sample : latest),
    undefined
  )
  if (!end) return null
  const requestedEndMs = Math.floor(atMs / RAIN_STEP_MS) * RAIN_STEP_MS
  // Only a current live edge may carry an older period. Later recorded samples
  // prove a missing historical endpoint is a hole, not a pending next receipt.
  if (
    end.ms !== requestedEndMs &&
    (!allowLiveEdgeCarry || samples.some((sample) => Number.isFinite(sample.ms) && sample.ms > requestedEndMs))
  )
    return null
  const contributing = available.filter((sample) => sample.ms > end.ms - durationMs)
  const stamps = new Set(contributing.map((sample) => sample.ms))
  let complete = end.ms % RAIN_STEP_MS === 0
  for (let stamp = end.ms - durationMs + RAIN_STEP_MS; stamp <= end.ms; stamp += RAIN_STEP_MS) {
    if (!stamps.has(stamp)) complete = false
  }
  if (contributing.some((sample) => typeof sample.value !== 'number' || !Number.isFinite(sample.value)))
    complete = false
  const total = complete
    ? Math.round(contributing.reduce((sum, sample) => sum + sample.value!, 0) * 1_000_000) / 1_000_000
    : null
  return { samples: contributing, total, observedAt: end.iso, endMs: end.ms }
}
