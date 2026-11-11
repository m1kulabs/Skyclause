import {
  metForecastDateBoundaries,
  dedupeReadingsAt,
  effectiveWindowSpan,
  isKlMetWarningReading,
  latestMytMorning,
  nextSourceChangeAt,
  RAIN_STEP_MS,
  type CheckedSheet,
  type IndicatorSnapshot,
  type Instant,
  type ReadingHistory,
  type Window
} from '@skyclause/clauses'

/** Every candidate is a condition boundary; elapsed deadlines are never re-enqueued. */
export function nextEvaluationAt(q: {
  history: ReadingHistory
  sheet: CheckedSheet
  windows: Window[]
  snapshot: IndicatorSnapshot
  tEval: Instant
}): Instant | null {
  const at = Date.parse(q.tEval),
    candidates: number[] = []
  const add = (value: string | number | null | undefined) => {
    const ms = typeof value === 'string' ? Date.parse(value) : value
    if (ms != null && Number.isFinite(ms) && ms > at) candidates.push(ms)
  }
  const clauses = q.sheet.clauses.filter((c) => c.enabled)
  const names = new Set(clauses.flatMap((c) => [...c.requires, ...(c.optional ?? [])]))
  for (const source of q.history.sources) add(nextSourceChangeAt(q.history, source.id, q.tEval))
  const readings = dedupeReadingsAt(q.history, at)
  if (names.has('site.met_warning_in_force') || names.has('w.met_warning_in_force')) {
    const sources = new Set(q.history.sources.filter((s) => s.kind === 'met_warning').map((s) => s.id))
    for (const reading of readings.filter((r) => sources.has(r.sourceId))) {
      const validity = isKlMetWarningReading(reading)
      if (!validity.isKlWarning || !validity.completeValidity || validity.validToMs === null) continue
      add(validity.validFromMs)
      add(validity.validToMs + 1)
    }
  }
  if (names.has('site.met_afternoon_thunderstorm')) {
    const sources = new Set(q.history.sources.filter((s) => s.kind === 'met_forecast').map((s) => s.id))
    for (const boundary of metForecastDateBoundaries(readings.filter((r) => sources.has(r.sourceId)))) add(boundary)
  }
  if (names.has('site.api_0600_min_last3_max') && q.snapshot.site['site.api_0600_min_last3_max']?.value != null)
    add(latestMytMorning(at) + 86400000)
  for (const window of q.windows)
    for (const clause of clauses.filter((c) => c.scope === 'window')) {
      const span = effectiveWindowSpan(clause, window),
        from = Date.parse(span.from),
        to = Date.parse(span.to)
      if (from >= to) continue
      add(from)
      add(to)
      if (
        at >= from &&
        at < to &&
        [...clause.requires, ...(clause.optional ?? [])].some(
          (n) => n === 'w.rain_max_60m_mm' || n === 'w.rain_max_4h_mm'
        )
      )
        add(Math.min(to, (Math.floor(at / RAIN_STEP_MS) + 1) * RAIN_STEP_MS))
    }
  // Only actual supplied bounds; absent arrival/exit ends remain unknown.
  for (const night of q.snapshot.nights)
    for (const value of [night.doors, night.show, night.arrivalStart, night.arrivalEnd, night.exitStart, night.exitEnd])
      add(value)
  if (!candidates.length) return null
  return new Date(Math.min(...candidates)).toISOString().replace('.000Z', 'Z')
}

/** Keep the exact terminal evaluation, including explicit spans beyond the window's own end. */
export function evaluatorWindows(sheet: CheckedSheet, windows: Window[], tEval: Instant): Window[] {
  const at = Date.parse(tEval)
  return windows.filter((w) => {
    const ends = [
      Date.parse(w.endsAt),
      ...sheet.clauses
        .filter((c) => c.enabled && c.scope === 'window')
        .map((c) => Date.parse(effectiveWindowSpan(c, w).to))
    ]
    return Math.max(...ends) >= at
  })
}
