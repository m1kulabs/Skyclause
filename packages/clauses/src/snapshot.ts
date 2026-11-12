import { canonicalHash } from './canonical-hash'
import { formatInstant } from './span'
import { rainPeriod } from './rain'
import type {
  DeriveInputState,
  IndicatorDefinition,
  IndicatorRegistry,
  IndicatorSnapshot,
  IndicatorValue,
  InputState,
  InputStatus,
  Instant,
  Pack,
  ReadingHistory,
  SnapshotAt,
  SourceKind,
  WarningObservation
} from './types'

const MYT_OFFSET_MS = 8 * 3_600_000
const MINUTE_MS = 60_000

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface NormalizedReading {
  id: string
  pollId?: string | null
  sourceId: string
  metric: string
  observedAt: Instant
  observedMs: number
  receivedAt: Instant
  receivedMs: number
  value: IndicatorValue['value']
  valueText: string | null
  valueJson: Record<string, unknown> | null
  itemKey: string
  revision: number
}

export type { WarningObservation } from './types'

export interface NormalizedPoll {
  id: string
  sourceId: string
  startedAt: Instant
  startedMs: number
  outcome: 'ok' | 'unchanged' | 'error'
  httpStatus: number | null
}

function parseClockMinutes(clock: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(clock.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

export function latestMytMorning(epochMs: number): number {
  return (
    Math.floor((epochMs + MYT_OFFSET_MS - 6 * 60 * MINUTE_MS) / 86400000) * 86400000 +
    6 * 60 * MINUTE_MS -
    MYT_OFFSET_MS
  )
}
function cameraHours(source: ReadingHistory['sources'][number]): [number, number] {
  const start =
    typeof source.meta?.cameraDayStart === 'string' ? source.meta.cameraDayStart : source.meta?.camera_day_start
  const end = typeof source.meta?.cameraDayEnd === 'string' ? source.meta.cameraDayEnd : source.meta?.camera_day_end
  return [
    typeof start === 'string' ? (parseClockMinutes(start) ?? 435) : 435,
    typeof end === 'string' ? (parseClockMinutes(end) ?? 1140) : 1140
  ]
}
function pendingInstant(source: ReadingHistory['sources'][number]): number {
  const value =
    source.meta.next_update ?? source.meta.nextUpdate ?? source.meta.pending_until ?? source.meta.pendingUntil
  return typeof value === 'string' ? Date.parse(value) : NaN
}
function calendarExpiry(source: ReadingHistory['sources'][number]): number {
  return typeof source.meta.calendar_end === 'string'
    ? Date.parse(`${source.meta.calendar_end}T00:00:00+08:00`) + 86400000
    : NaN
}
function freshnessBasis(
  source: ReadingHistory['sources'][number],
  readings: NormalizedReading[],
  polls: NormalizedPoll[]
): number | null {
  const latest = readings.at(-1)
  return source.freshness === 'observed'
    ? (latest?.observedMs ?? null)
    : (polls.filter((p) => p.outcome !== 'error').at(-1)?.startedMs ?? latest?.observedMs ?? null)
}
function freshnessLimit(source: ReadingHistory['sources'][number]): number {
  return source.staleAfterS > 0 ? source.staleAfterS : source.cadenceS * 2
}

function metForecastDates(r: NormalizedReading): { jsonDate: string | null; keyDate: string | null } {
  return {
    jsonDate: typeof r.valueJson?.date === 'string' ? r.valueJson.date : null,
    keyDate: /^\d{4}-\d{2}-\d{2}$/.test(r.itemKey) ? r.itemKey : null
  }
}
export function metForecastDateBoundaries(readings: NormalizedReading[]): number[] {
  return readings.flatMap((r) =>
    Object.values(metForecastDates(r)).flatMap((date) => {
      if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
      const start = Date.parse(`${date}T00:00:00+08:00`)
      return [start, start + 86400000]
    })
  )
}

export function toLocalMinutes(epochMs: number): number {
  const shifted = new Date(epochMs + MYT_OFFSET_MS)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

export function toMytDateString(epochMs: number): string {
  return new Date(epochMs + MYT_OFFSET_MS).toISOString().slice(0, 10)
}

export function dedupeReadingsAt(h: ReadingHistory, tEvalMs: number): NormalizedReading[] {
  const byKey = new Map<string, NormalizedReading>()

  for (const r of h.readings) {
    const observedMs = Date.parse(r.observedAt)
    const receivedMs = Date.parse(r.receivedAt)
    if (!Number.isFinite(observedMs) || !Number.isFinite(receivedMs)) continue
    if (receivedMs > tEvalMs || observedMs > tEvalMs) continue

    const identityKey = JSON.stringify([r.sourceId, r.metric, observedMs, r.itemKey])
    const existing = byKey.get(identityKey)
    const candidate: NormalizedReading = {
      id: r.id,
      pollId: r.pollId,
      sourceId: r.sourceId,
      metric: r.metric,
      observedAt: formatInstant(observedMs),
      observedMs,
      receivedAt: formatInstant(receivedMs),
      receivedMs,
      value: r.value,
      valueText: r.valueText,
      valueJson: r.valueJson,
      itemKey: r.itemKey,
      revision: r.revision
    }

    if (!existing) {
      byKey.set(identityKey, candidate)
      continue
    }

    if (
      candidate.revision > existing.revision ||
      (candidate.revision === existing.revision &&
        (candidate.receivedMs > existing.receivedMs ||
          (candidate.receivedMs === existing.receivedMs && candidate.id > existing.id)))
    ) {
      byKey.set(identityKey, candidate)
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.observedMs !== b.observedMs) return a.observedMs - b.observedMs
    if (a.sourceId !== b.sourceId) return compareIds(a.sourceId, b.sourceId)
    if (a.metric !== b.metric) return compareIds(a.metric, b.metric)
    return compareIds(a.id, b.id)
  })
}

export function filterPollsAt(h: ReadingHistory, tEvalMs: number): NormalizedPoll[] {
  const out: NormalizedPoll[] = []
  for (const p of h.polls) {
    const startedMs = Date.parse(p.startedAt)
    if (!Number.isFinite(startedMs) || startedMs > tEvalMs) continue
    if (
      p.receivedAt !== undefined &&
      (!Number.isFinite(Date.parse(p.receivedAt)) || Date.parse(p.receivedAt) > tEvalMs)
    )
      continue
    out.push({
      id: p.id,
      sourceId: p.sourceId,
      startedAt: formatInstant(startedMs),
      startedMs,
      outcome: p.outcome,
      httpStatus: p.httpStatus
    })
  }
  return out.sort((a, b) => {
    if (a.startedMs !== b.startedMs) return a.startedMs - b.startedMs
    return compareIds(a.id, b.id)
  })
}

export interface SourceResolution {
  sourceId: string
  state: InputState
  since: Instant
  observedAt: Instant | null
  ageS: number | null
  readingIds: string[]
}

export function resolveSourceAt(
  h: ReadingHistory,
  sourceId: string,
  tEval: Instant,
  dedupedReadings?: NormalizedReading[],
  filteredPolls?: NormalizedPoll[]
): SourceResolution {
  const tEvalMs = Date.parse(tEval)
  const tEvalIso = formatInstant(tEvalMs)
  const source = h.sources.find((s) => s.id === sourceId)
  if (!source) {
    return {
      sourceId,
      state: 'stale',
      since: tEvalIso,
      observedAt: null,
      ageS: null,
      readingIds: []
    }
  }

  const readings = (dedupedReadings ?? dedupeReadingsAt(h, tEvalMs)).filter((r) => r.sourceId === sourceId)
  const polls = (filteredPolls ?? filterPollsAt(h, tEvalMs)).filter((p) => p.sourceId === sourceId)
  const staleLimitS = freshnessLimit(source)
  const staleLimitMs = staleLimitS * 1_000

  const latestReading = readings.length > 0 ? readings[readings.length - 1]! : null
  const latestPoll = polls.length > 0 ? polls[polls.length - 1]! : null
  const goodPolls = polls.filter((p) => p.outcome === 'ok' || p.outcome === 'unchanged')
  const latestGoodPoll = goodPolls.length > 0 ? goodPolls[goodPolls.length - 1]! : null
  const captures = new Map(goodPolls.map((poll) => [poll.id, poll.startedMs]))
  // Only matched normal successes establish a physical capture. Legacy pure callers
  // without poll identity retain their receipt clock; unproved associations cannot clear errors.
  const captureClock = (reading: NormalizedReading) =>
    reading.pollId ? (captures.get(reading.pollId) ?? Number.NEGATIVE_INFINITY) : reading.receivedMs

  const observedAt =
    source.freshness === 'observed'
      ? (latestReading?.observedAt ?? null)
      : (latestReading?.observedAt ?? latestGoodPoll?.startedAt ?? null)
  const basisMs = freshnessBasis(source, readings, polls)
  const ageS = basisMs !== null ? Math.max(0, Math.floor((tEvalMs - basisMs) / 1_000)) : null
  const readingIds = latestReading ? [latestReading.id] : []

  if (source.kind === 'camera') {
    if (source.probation) {
      return {
        sourceId,
        state: 'probation',
        since: latestReading?.observedAt ?? tEvalIso,
        observedAt,
        ageS,
        readingIds
      }
    }
    const [startMin, endMin] = cameraHours(source)
    const curMin = toLocalMinutes(tEvalMs)
    if (curMin < startMin || curMin >= endMin) {
      return {
        sourceId,
        state: 'off_hours',
        since: tEvalIso,
        observedAt,
        ageS,
        readingIds
      }
    }
  }

  if (source.kind === 'rapidrail_od') {
    const nextUpdateMs = pendingInstant(source)
    if (Number.isFinite(nextUpdateMs) && tEvalMs < nextUpdateMs) {
      return {
        sourceId,
        state: 'pending',
        since: formatInstant(nextUpdateMs),
        observedAt,
        ageS,
        readingIds
      }
    }
  }

  if (latestPoll && latestPoll.outcome === 'error') {
    const supersededByNewerReading =
      source.freshness === 'observed' &&
      latestReading !== null &&
      captureClock(latestReading) > latestPoll.startedMs &&
      (!latestGoodPoll || captureClock(latestReading) > latestGoodPoll.startedMs)
    if (!supersededByNewerReading) {
      return {
        sourceId,
        state: 'error',
        since: latestPoll.startedAt,
        observedAt,
        ageS,
        readingIds
      }
    }
  }

  if (basisMs === null || ageS === null || ageS > staleLimitS) {
    const staleSince = basisMs !== null ? formatInstant(basisMs + staleLimitMs) : tEvalIso
    return {
      sourceId,
      state: 'stale',
      since: staleSince,
      observedAt,
      ageS,
      readingIds
    }
  }

  if (source.kind === 'gtfs_static' && typeof source.meta?.calendar_end === 'string') {
    // The provider supplies a validated local feed date. Polls do not renew it.
    const calendarEndMs = calendarExpiry(source)
    if (Number.isFinite(calendarEndMs) && tEvalMs >= calendarEndMs) {
      return {
        sourceId,
        state: 'stale',
        since: formatInstant(calendarEndMs),
        observedAt,
        ageS,
        readingIds
      }
    }
  }

  if (source.kind === 'met_forecast' && readings.length > 0) {
    const todayMyt = toMytDateString(tEvalMs)
    const coversToday = readings.some((r) => {
      const { jsonDate, keyDate } = metForecastDates(r)
      if (!jsonDate && !keyDate) return true
      return jsonDate === todayMyt || keyDate === todayMyt
    })
    if (!coversToday) {
      return {
        sourceId,
        state: 'stale',
        since: tEvalIso,
        observedAt,
        ageS,
        readingIds
      }
    }
  }

  if (source.freshness === 'observed') {
    // Metrics from one observed frame are one availability event, even if their
    // receipts differ. A delayed metric from an old frame cannot end recovery.
    const observations = new Map<number, NormalizedReading>()
    for (const reading of readings) {
      const existing = observations.get(reading.observedMs)
      if (!existing || reading.receivedMs < existing.receivedMs) {
        observations.set(reading.observedMs, reading)
      }
    }
    const latestObservation = observations.get(latestReading!.observedMs)!
    // A catch-up response can contain many missed frames but is one capture. Physical
    // poll time keeps normal 15-minute ingestion batches distinct from a provider outage.
    const latestCapture = captureClock(latestObservation)
    const priorObservations = Array.from(observations.values()).filter(
      (reading) =>
        reading.observedMs < latestObservation.observedMs &&
        reading.receivedMs <= latestObservation.receivedMs &&
        captureClock(reading) < latestCapture
    )
    const prevReading =
      priorObservations.sort((a, b) => a.observedMs - b.observedMs || a.receivedMs - b.receivedMs).at(-1) ?? null
    const gapMs = prevReading !== null ? latestObservation.observedMs - prevReading.observedMs : 0
    const captureGapMs = prevReading !== null ? latestCapture - captureClock(prevReading) : 0
    const hadStaleGapBeforeLatest = prevReading !== null && (gapMs > staleLimitMs || captureGapMs > staleLimitMs)
    const errorPolls = polls.filter((p) => p.outcome === 'error')
    const lastErrorPoll = errorPolls.length > 0 ? errorPolls[errorPolls.length - 1]! : null
    const hadErrorBeforeLatest =
      lastErrorPoll !== null &&
      (prevReading === null ||
        captureClock(prevReading) <= lastErrorPoll.startedMs ||
        latestCapture <= lastErrorPoll.startedMs)

    if (hadStaleGapBeforeLatest || hadErrorBeforeLatest) {
      return {
        sourceId,
        state: 'recovered',
        since: latestReading!.observedAt,
        observedAt,
        ageS,
        readingIds
      }
    }

    return {
      sourceId,
      state: 'fresh',
      since: latestReading!.observedAt,
      observedAt,
      ageS,
      readingIds
    }
  }

  // Polled freshness
  if (latestGoodPoll) {
    const latestIdx = polls.findIndex((p) => p.id === latestGoodPoll.id)
    const prevPoll = latestIdx > 0 ? polls[latestIdx - 1]! : null
    const prevGoodPoll = goodPolls.length >= 2 ? goodPolls[goodPolls.length - 2]! : null
    const hadErrorBeforeLatest = prevPoll !== null && prevPoll.outcome === 'error'
    const hadStaleGapBeforeLatest =
      prevGoodPoll !== null && latestGoodPoll.startedMs - prevGoodPoll.startedMs > staleLimitMs

    if (hadErrorBeforeLatest || hadStaleGapBeforeLatest) {
      return {
        sourceId,
        state: 'recovered',
        since: latestGoodPoll.startedAt,
        observedAt,
        ageS,
        readingIds
      }
    }

    return {
      sourceId,
      state: 'fresh',
      since: latestGoodPoll.startedAt,
      observedAt,
      ageS,
      readingIds
    }
  }

  return {
    sourceId,
    state: 'fresh',
    since: observedAt ?? tEvalIso,
    observedAt,
    ageS,
    readingIds
  }
}

export const deriveInputState: DeriveInputState = (h: ReadingHistory, sourceId: string, tEval: Instant): InputState => {
  return resolveSourceAt(h, sourceId, tEval).state
}

function stateSeverity(state: InputState): number {
  switch (state) {
    case 'error':
      return 6
    case 'stale':
      return 5
    case 'pending':
      return 4
    case 'recovered':
      return 3
    case 'probation':
      return 2
    case 'off_hours':
      return 1
    case 'fresh':
      return 0
  }
}

function aggregateSourcesForKind(
  kind: SourceKind,
  h: ReadingHistory,
  resolutions: ReadonlyMap<string, SourceResolution>,
  tEvalIso: Instant
): SourceResolution {
  const matching = h.sources
    .filter((s) => s.kind === kind)
    .map((s) => resolutions.get(s.id)!)
    .filter(Boolean)

  if (matching.length === 0) {
    return {
      sourceId: '',
      state: 'stale',
      since: tEvalIso,
      observedAt: null,
      ageS: null,
      readingIds: []
    }
  }

  if (matching.length === 1) {
    return matching[0]!
  }

  let worst = matching[0]!
  for (const res of matching.slice(1)) {
    if (stateSeverity(res.state) > stateSeverity(worst.state)) {
      worst = res
    }
  }
  return worst
}

export function metWarningValidity(
  r: NormalizedReading,
  areaTerms: readonly string[] = []
): { fromMs: number; toMs: number } | null {
  const json = r.valueJson ?? {}
  const issue = json.warning_issue as Record<string, unknown> | undefined
  const title = typeof issue?.title_en === 'string' ? issue.title_en.toLowerCase() : ''
  if (json.excluded === true || title === 'no advisory' || title.includes('rough seas')) return null
  // Eligibility uses normalized provider bounds only. Missing validity is never infinite.
  if (typeof json.valid_from_utc !== 'string' || typeof json.valid_to_utc !== 'string') return null
  const fromMs = Date.parse(json.valid_from_utc),
    toMs = Date.parse(json.valid_to_utc)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return null
  const texts = [json.text_en, json.text_bm]
    .filter((text): text is string => typeof text === 'string')
    .map((text) => text.toLowerCase())
  const matches = areaTerms.some(
    (term) => term.trim().length > 0 && texts.some((text) => text.includes(term.trim().toLowerCase()))
  )
  return matches ? { fromMs, toMs } : null
}

export const snapshotAt: SnapshotAt = (
  h: ReadingHistory,
  r: IndicatorRegistry,
  projectId: string,
  pack: Pack,
  tEval: Instant
): IndicatorSnapshot => {
  h = { ...h, sources: [...h.sources].sort((a, b) => compareIds(a.id, b.id)) }
  const tEvalMs = Date.parse(tEval)
  const tEvalIso = formatInstant(tEvalMs)
  const readings = dedupeReadingsAt(h, tEvalMs)
  const polls = filterPollsAt(h, tEvalMs)

  const resolutions = new Map<string, SourceResolution>()
  for (const s of h.sources) {
    resolutions.set(s.id, resolveSourceAt(h, s.id, tEvalIso, readings, polls))
  }

  const inputs: InputStatus[] = []
  const site: Record<string, IndicatorValue> = {}
  const series: Record<string, Array<[Instant, number | null, string]>> = {}
  const warningObservations: Record<string, WarningObservation> = {}

  for (const def of r) {
    const agg = aggregateSourcesForKind(def.sourceKind, h, resolutions, tEvalIso)
    inputs.push({
      name: def.name,
      sourceId: agg.sourceId || null,
      state: agg.state,
      since: agg.since
    })
  }

  const makeSiteIndicator = (
    def: IndicatorDefinition,
    res: SourceResolution,
    value: IndicatorValue['value'],
    sourceIds: string[],
    readingIds: string[],
    observedAt: Instant | null,
    ageS: number | null
  ): IndicatorValue => {
    const usable = res.state === 'fresh'
    return {
      name: def.name,
      value: usable ? value : null,
      unit: def.unit,
      state: res.state,
      since: res.since,
      ageS: usable ? ageS : res.ageS,
      sourceIds,
      readingIds,
      observedAt
    }
  }

  // Build series for jps_rain
  const jpsSources = h.sources.filter((s) => s.kind === 'jps_rain')
  const jpsSourceIds = new Set(jpsSources.map((s) => s.id))
  const jpsReadings = readings.filter(
    (rd) =>
      jpsSourceIds.has(rd.sourceId) &&
      (rd.metric === 'rain_5m_mm' || rd.metric === 'rf' || rd.metric === 'site.rain_60m_mm')
  )

  const rainSeries: Array<[Instant, number | null, string]> = jpsReadings.map((rd) => [
    rd.observedAt,
    typeof rd.value === 'number' && Number.isFinite(rd.value) ? rd.value : null,
    rd.id
  ])

  for (const def of r) {
    const res = aggregateSourcesForKind(def.sourceKind, h, resolutions, tEvalIso)
    const boundSourceIds = h.sources.filter((s) => s.kind === def.sourceKind).map((s) => s.id)

    if (def.name === 'w.rain_max_60m_mm' || def.name === 'w.rain_max_4h_mm') {
      series[def.name] = rainSeries
      continue
    }

    if (def.name === 'w.met_warning_in_force') {
      const warnSourceIds = new Set(boundSourceIds)
      const warnReadings = readings.filter((rd) => warnSourceIds.has(rd.sourceId))
      const warnSeries: Array<[Instant, number | null, string]> = []
      for (const wr of warnReadings) {
        const validity = metWarningValidity(wr, h.warningAreaTerms)
        if (validity) {
          warnSeries.push([wr.observedAt, validity.toMs, wr.id])
          warningObservations[wr.id] = {
            sourceId: wr.sourceId,
            observedAt: wr.observedAt,
            receivedAt: wr.receivedAt,
            validFrom: formatInstant(validity.fromMs),
            validTo: formatInstant(validity.toMs)
          }
        }
      }
      series[def.name] = warnSeries
      continue
    }

    if (def.scope === 'window') {
      continue
    }

    // Check for direct indicator metric override first
    const directReadings = readings.filter((rd) => boundSourceIds.includes(rd.sourceId) && rd.metric === def.name)
    if (directReadings.length > 0) {
      const newest = directReadings[directReadings.length - 1]!
      const obsAgeS = Math.max(0, Math.floor((tEvalMs - newest.observedMs) / 1_000))
      site[def.name] = makeSiteIndicator(
        def,
        res,
        newest.value,
        [newest.sourceId],
        [newest.id],
        newest.observedAt,
        obsAgeS
      )
      continue
    }

    if (def.name === 'site.rain_60m_mm') {
      const period = rainPeriod(
        jpsReadings.map((rd) => ({
          iso: rd.observedAt,
          ms: rd.observedMs,
          value: typeof rd.value === 'number' ? rd.value : null,
          id: rd.id,
          sourceId: rd.sourceId
        })),
        tEvalMs,
        60 * MINUTE_MS
      )
      const coverageState = period?.total === null || !period ? 'stale' : res.state
      const effective = res.state === 'fresh' ? { ...res, state: coverageState } : res
      const input = inputs.find((input) => input.name === def.name)
      if (input) input.state = effective.state
      site[def.name] = makeSiteIndicator(
        def,
        effective,
        period?.total ?? null,
        boundSourceIds,
        period?.samples.map((sample) => sample.id) ?? [],
        period?.observedAt ?? null,
        period ? Math.max(0, Math.floor((tEvalMs - period.endMs) / 1000)) : null
      )
      continue
    }

    if (def.name === 'site.api_max') {
      let best: NormalizedReading | null = null
      for (const sid of boundSourceIds) {
        const stReadings = readings.filter(
          (rd) =>
            rd.sourceId === sid && (rd.metric === 'api' || rd.metric === 'site.api_max') && typeof rd.value === 'number'
        )
        const latest = stReadings.length > 0 ? stReadings[stReadings.length - 1]! : null
        if (!latest) continue
        if (
          !best ||
          (latest.value as number) > (best.value as number) ||
          (latest.value === best.value && latest.observedMs < best.observedMs)
        ) {
          best = latest
        }
      }
      const obsAgeS = best ? Math.max(0, Math.floor((tEvalMs - best.observedMs) / 1_000)) : null
      site[def.name] = makeSiteIndicator(
        def,
        res,
        best ? Math.round(best.value as number) : null,
        best ? [best.sourceId] : boundSourceIds,
        best ? [best.id] : [],
        best?.observedAt ?? null,
        obsAgeS
      )
      continue
    }

    if (def.name === 'site.api_0600_min_last3_max') {
      let maxAcrossStations: number | null = null
      const contributingIds: string[] = []
      let newestObsMs: number | null = null
      let newestObsIso: Instant | null = null
      let missingStationId: string | null = null

      for (const sid of boundSourceIds) {
        const dayMs = 24 * 60 * MINUTE_MS
        const latestMorningMs = latestMytMorning(tEvalMs)
        const morning: NormalizedReading[] = []
        for (let daysAgo = 2; daysAgo >= 0; daysAgo--) {
          const requiredMs = latestMorningMs - daysAgo * dayMs
          const matching = readings.filter(
            (rd) =>
              rd.sourceId === sid &&
              rd.metric === 'api' &&
              rd.observedMs === requiredMs &&
              typeof rd.value === 'number' &&
              Number.isFinite(rd.value)
          )
          const latest = matching.at(-1)
          if (latest) morning.push(latest)
        }

        if (morning.length === 3) {
          const stationMin = Math.min(...morning.map((m) => Math.round(m.value as number)))
          if (maxAcrossStations === null || stationMin > maxAcrossStations) maxAcrossStations = stationMin
        } else {
          missingStationId ??= sid
        }
        for (const m of morning) {
          contributingIds.push(m.id)
          if (newestObsMs === null || m.observedMs > newestObsMs) {
            newestObsMs = m.observedMs
            newestObsIso = m.observedAt
          }
        }
      }

      if (missingStationId !== null) maxAcrossStations = null
      const obsAgeS = newestObsMs !== null ? Math.max(0, Math.floor((tEvalMs - newestObsMs) / 1_000)) : null
      const morningResolution =
        maxAcrossStations === null && res.state === 'fresh' ? { ...res, state: 'stale' as const } : res
      const input = inputs.find((input) => input.name === def.name)
      if (input) {
        input.state = morningResolution.state
        if (missingStationId && res.state === 'fresh') input.sourceId = missingStationId
      }
      site[def.name] = makeSiteIndicator(
        def,
        { ...morningResolution, ageS: obsAgeS },
        maxAcrossStations,
        boundSourceIds,
        contributingIds,
        newestObsIso,
        newestObsMs === null ? null : obsAgeS
      )
      continue
    }

    if (def.name === 'site.met_warning_in_force') {
      const warnReadings = readings.filter((rd) => boundSourceIds.includes(rd.sourceId))
      const activeWarnings = warnReadings.filter((wr) => {
        const validity = metWarningValidity(wr, h.warningAreaTerms)
        return validity !== null && validity.fromMs <= tEvalMs && validity.toMs >= tEvalMs
      })
      const newest = activeWarnings.length > 0 ? activeWarnings[activeWarnings.length - 1]! : null
      site[def.name] = makeSiteIndicator(
        def,
        res,
        activeWarnings.length > 0,
        boundSourceIds,
        activeWarnings.map((w) => w.id),
        newest?.observedAt ?? res.observedAt,
        res.ageS
      )
      continue
    }

    if (def.name === 'site.met_afternoon_thunderstorm') {
      const todayMyt = toMytDateString(tEvalMs)
      const fcstReadings = readings.filter((rd) => boundSourceIds.includes(rd.sourceId))
      const matching = fcstReadings.filter((rd) => {
        const { jsonDate, keyDate } = metForecastDates(rd)
        if (jsonDate && jsonDate !== todayMyt) return false
        if (keyDate && keyDate !== todayMyt) return false
        if (rd.value === true || rd.value === 1) return true
        const text =
          `${rd.valueText ?? ''} ${String(rd.valueJson?.afternoon_forecast ?? '')} ${String(rd.valueJson?.text_bm ?? '')} ${String(rd.valueJson?.text_en ?? '')}`.toLowerCase()
        return text.includes('ribut petir') || text.includes('thunderstorm')
      })
      const newest = matching.length > 0 ? matching[matching.length - 1]! : null
      site[def.name] = makeSiteIndicator(
        def,
        res,
        matching.length > 0,
        boundSourceIds,
        matching.map((m) => m.id),
        newest?.observedAt ?? res.observedAt,
        res.ageS
      )
      continue
    }

    if (def.name === 'site.camera_far_low_frames') {
      if (res.state !== 'fresh') {
        // Optional camera input: omit or set state when probation / off_hours / stale
        site[def.name] = {
          name: def.name,
          value: null,
          unit: def.unit,
          state: res.state,
          since: res.since,
          ageS: res.ageS,
          sourceIds: boundSourceIds,
          readingIds: [],
          observedAt: res.observedAt
        }
        continue
      }
      const camSource = h.sources.find((s) => s.kind === 'camera')
      const threshold = typeof camSource?.meta?.farThreshold === 'number' ? camSource.meta.farThreshold : 0.5
      const camReadings = readings
        .filter(
          (rd) => boundSourceIds.includes(rd.sourceId) && rd.metric === 'contrast_far' && typeof rd.value === 'number'
        )
        .slice(-3)
      const lowCount = camReadings.filter((rd) => (rd.value as number) < threshold).length
      const newest = camReadings.length > 0 ? camReadings[camReadings.length - 1]! : null
      const obsAgeS = newest ? Math.max(0, Math.floor((tEvalMs - newest.observedMs) / 1_000)) : res.ageS
      site[def.name] = makeSiteIndicator(
        def,
        res,
        lowCount,
        boundSourceIds,
        camReadings.map((rd) => rd.id),
        newest?.observedAt ?? res.observedAt,
        obsAgeS
      )
      continue
    }

    // Default fallback for any other site indicator
    const fallbackReadings = readings.filter((rd) => boundSourceIds.includes(rd.sourceId))
    const newest = fallbackReadings.length > 0 ? fallbackReadings[fallbackReadings.length - 1]! : null
    const obsAgeS = newest ? Math.max(0, Math.floor((tEvalMs - newest.observedMs) / 1_000)) : res.ageS
    site[def.name] = makeSiteIndicator(
      def,
      res,
      newest?.value ?? null,
      boundSourceIds,
      newest ? [newest.id] : [],
      newest?.observedAt ?? res.observedAt,
      obsAgeS
    )
  }

  const registryHash = canonicalHash(JSON.parse(JSON.stringify(r)))
  const baseSnapshot = {
    projectId,
    pack,
    tEval: tEvalIso,
    inputs,
    site,
    series,
    warningObservations,
    nights: [],
    registryHash
  }

  return {
    ...baseSnapshot,
    hash: canonicalHash(baseSnapshot)
  }
}

/** Candidate clocks share the resolver's exact rules; only actual state changes survive. */
export function nextSourceChangeAt(h: ReadingHistory, sourceId: string, tEval: Instant): Instant | null {
  const at = Date.parse(tEval),
    source = h.sources.find((s) => s.id === sourceId)
  if (!source) return null
  const readings = dedupeReadingsAt(h, at).filter((r) => r.sourceId === sourceId)
  const polls = filterPollsAt(h, at).filter((p) => p.sourceId === sourceId)
  const candidates: number[] = []
  const basis = freshnessBasis(source, readings, polls)
  if (basis !== null) candidates.push(basis + (Math.floor(freshnessLimit(source)) + 1) * 1000)
  if (source.kind === 'rapidrail_od') candidates.push(pendingInstant(source))
  if (source.kind === 'gtfs_static') candidates.push(calendarExpiry(source))
  if (source.kind === 'camera' && !source.probation) {
    const day = Date.parse(`${toMytDateString(at)}T00:00:00+08:00`)
    for (const minute of cameraHours(source))
      for (const offset of [0, 86400000]) candidates.push(day + minute * 60000 + offset)
  }
  if (source.kind === 'met_forecast') candidates.push(...metForecastDateBoundaries(readings))
  const before = resolveSourceAt(h, sourceId, tEval).state
  for (const candidate of candidates.filter((n) => Number.isFinite(n) && n > at).sort((a, b) => a - b))
    if (resolveSourceAt(h, sourceId, formatInstant(candidate)).state !== before) return formatInstant(candidate)
  return null
}
