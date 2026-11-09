import { canonicalHash } from './canonical-hash'
import { buildTypeEnv, evalCelCondition, indicatorValToCel, toCelDuration, toCelTimestamp } from './cel'
import { formatInstant, resolveWindowSpan } from './span'
import { toLocalMinutes, toMytDateString } from './snapshot'
import { INDICATOR_NAMES } from './types'
import type {
  BlockedInput,
  CheckedSheet,
  Clause,
  ClauseExplanation,
  ClauseResult,
  CrowdMode,
  Evaluate,
  Explain,
  IndicatorSnapshot,
  IndicatorValue,
  InputState,
  InputStatus,
  Instant,
  NightInput,
  Recommendation,
  SkyMode,
  Verdict,
  Verdicts,
  Window
} from './types'

const MINUTE_MS = 60_000

const SKY_MODE_RANK: Readonly<Record<SkyMode, number>> = {
  normal: 0,
  outdoor_limited: 1,
  commute_disruption: 2,
  hybrid_recommended: 3
}

const CROWD_MODE_RANK: Readonly<Record<CrowdMode, number>> = {
  normal: 0,
  surge_night: 1
}

function modeRank(mode: SkyMode | CrowdMode | undefined | null): number {
  if (!mode) return 0
  if (mode in SKY_MODE_RANK) return SKY_MODE_RANK[mode as SkyMode]
  if (mode in CROWD_MODE_RANK) return CROWD_MODE_RANK[mode as CrowdMode]
  return 0
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

const KNOWN_INDICATOR_UNITS: Readonly<Record<string, string>> = {
  'site.rain_60m_mm': 'mm',
  'w.rain_max_60m_mm': 'mm',
  'w.rain_max_4h_mm': 'mm',
  'site.api_max': 'API',
  'site.api_0600_min_last3_max': 'API',
  'site.met_warning_in_force': '',
  'w.met_warning_in_force': '',
  'site.met_afternoon_thunderstorm': '',
  'site.camera_far_low_frames': 'frames',
  'site.night.baseline': 'exits',
  'site.night.uplift': 'exits',
  'site.night.forecast': 'exits',
  'site.night.band_low': 'exits',
  'site.night.band_high': 'exits',
  'site.night.doors': '',
  'site.night.show': '',
  'site.night.arrival_start': '',
  'site.night.arrival_end': '',
  'site.night.exit_start': '',
  'site.night.exit_end': '',
  'site.night.single_source': ''
}

const DEFAULT_TYPE_ENV = buildTypeEnv(
  INDICATOR_NAMES.map((name) => ({
    name,
    celType: name.endsWith('_mm')
      ? 'double'
      : name.includes('warning') || name.includes('thunderstorm') || name === 'site.night.single_source'
        ? 'bool'
        : name === 'site.night.doors' || name === 'site.night.show' || name.endsWith('_start') || name.endsWith('_end')
          ? 'timestamp'
          : 'int',
    unit: KNOWN_INDICATOR_UNITS[name] ?? '',
    scope: name.startsWith('w.') ? 'window' : 'site',
    sourceKind: 'jps_rain'
  }))
)

function interpolateWordingText(text: string | undefined, inputs: readonly IndicatorValue[]): string | undefined {
  if (text === undefined) return undefined
  const byName = new Map<string, IndicatorValue>()
  for (const inp of inputs) {
    byName.set(inp.name, inp)
  }
  return text.replace(/\{([^{}]+)\.([^{}.]+)\}/g, (full, indName: string, field: string) => {
    const iv = byName.get(indName)
    if (!iv) return full
    switch (field) {
      case 'value':
        return iv.value !== null && iv.value !== undefined ? String(iv.value) : full
      case 'unit':
        return iv.unit || full
      case 'age':
        return iv.ageS !== null && iv.ageS !== undefined ? String(iv.ageS) : full
      case 'station':
        return iv.sourceIds[0] ?? full
      case 'observed_at':
        return iv.observedAt ?? full
      default:
        return full
    }
  })
}

function formatWording(
  wording: { en?: string | undefined; ms?: string | undefined },
  inputs: readonly IndicatorValue[]
): { en?: string; ms?: string } {
  const out: { en?: string; ms?: string } = {}
  const en = interpolateWordingText(wording.en, inputs)
  const ms = interpolateWordingText(wording.ms, inputs)
  if (en !== undefined) out.en = en
  if (ms !== undefined) out.ms = ms
  return out
}

function computeWindowRainIndicator(
  indName: 'w.rain_max_60m_mm' | 'w.rain_max_4h_mm',
  snapshot: IndicatorSnapshot,
  fromMs: number,
  toMs: number,
  tEvalMs: number
): IndicatorValue {
  const durationMinutes = indName === 'w.rain_max_60m_mm' ? 60 : 240
  const durationMs = durationMinutes * MINUTE_MS
  const upperBoundMs = Math.min(toMs, tEvalMs)

  const inputStatus =
    snapshot.inputs.find((i) => i.name === indName) ?? snapshot.inputs.find((i) => i.name === 'site.rain_60m_mm')
  const state: InputState = inputStatus?.state ?? 'stale'
  const since: Instant = inputStatus?.since ?? snapshot.tEval
  const sourceIds = inputStatus?.sourceId
    ? [inputStatus.sourceId]
    : (snapshot.site['site.rain_60m_mm']?.sourceIds ?? [])

  const rawSeries =
    snapshot.series[indName] ?? snapshot.series['w.rain_max_60m_mm'] ?? snapshot.series['jps_rain'] ?? []

  if (state !== 'fresh' || rawSeries.length === 0 || upperBoundMs < fromMs) {
    return {
      name: indName,
      value: null,
      unit: 'mm',
      state,
      since,
      ageS: null,
      sourceIds,
      readingIds: [],
      observedAt: null
    }
  }

  const parsedSamples = rawSeries
    .map(([iso, val, id]) => ({
      iso,
      ms: Date.parse(iso),
      val,
      id
    }))
    .filter((s) => Number.isFinite(s.ms) && s.ms <= tEvalMs)
    .sort((a, b) => a.ms - b.ms)

  if (parsedSamples.length === 0) {
    return {
      name: indName,
      value: null,
      unit: 'mm',
      state: 'stale',
      since,
      ageS: null,
      sourceIds,
      readingIds: [],
      observedAt: null
    }
  }

  // Candidate evaluation instants t inside [fromMs, upperBoundMs]
  const candidatePoints = new Set<number>([fromMs, upperBoundMs])
  for (const s of parsedSamples) {
    if (s.ms >= fromMs && s.ms <= upperBoundMs) {
      candidatePoints.add(s.ms)
    }
  }
  const sortedCandidates = Array.from(candidatePoints).sort((a, b) => a - b)

  let bestTotal: number | null = null
  let bestObservedAt: Instant | null = null
  let bestObservedMs: number | null = null
  let bestReadingIds: string[] = []
  let sawNullSample = false

  for (const tMs of sortedCandidates) {
    const startExclusive = tMs - durationMs
    const contributing = parsedSamples.filter((s) => s.ms > startExclusive && s.ms <= tMs)
    if (contributing.length === 0) continue

    if (contributing.some((s) => s.val === null || typeof s.val !== 'number' || !Number.isFinite(s.val))) {
      sawNullSample = true
      break
    }

    const total = roundMetric(contributing.reduce((acc, s) => acc + (s.val as number), 0))
    const latestContributing = contributing[contributing.length - 1]!
    if (bestTotal === null || total > bestTotal) {
      bestTotal = total
      bestObservedAt = latestContributing.iso
      bestObservedMs = latestContributing.ms
      bestReadingIds = contributing.map((c) => c.id)
    }
  }

  if (sawNullSample || bestTotal === null) {
    return {
      name: indName,
      value: null,
      unit: 'mm',
      state: sawNullSample ? 'stale' : state,
      since,
      ageS: null,
      sourceIds,
      readingIds: [],
      observedAt: null
    }
  }

  const ageS = bestObservedMs !== null ? Math.max(0, Math.floor((tEvalMs - bestObservedMs) / 1_000)) : null
  return {
    name: indName,
    value: bestTotal,
    unit: 'mm',
    state: 'fresh',
    since,
    ageS,
    sourceIds,
    readingIds: bestReadingIds,
    observedAt: bestObservedAt
  }
}

function computeWindowWarningIndicator(snapshot: IndicatorSnapshot, window: Window, tEvalMs: number): IndicatorValue {
  const indName = 'w.met_warning_in_force'
  const inputStatus =
    snapshot.inputs.find((i) => i.name === indName) ??
    snapshot.inputs.find((i) => i.name === 'site.met_warning_in_force')
  const state: InputState = inputStatus?.state ?? 'stale'
  const since: Instant = inputStatus?.since ?? snapshot.tEval
  const sourceIds = inputStatus?.sourceId
    ? [inputStatus.sourceId]
    : (snapshot.site['site.met_warning_in_force']?.sourceIds ?? [])

  if (state !== 'fresh') {
    return {
      name: indName,
      value: null,
      unit: '',
      state,
      since,
      ageS: null,
      sourceIds,
      readingIds: [],
      observedAt: null
    }
  }

  const startMs = Date.parse(window.startsAt)
  const endMs = Date.parse(window.endsAt)
  const warnSeries = snapshot.series[indName] ?? []

  const matchingIds: string[] = []
  let latestObsIso: Instant | null = null
  let latestObsMs: number | null = null

  for (const [fromIso, toVal, id] of warnSeries) {
    const validFromMs = Date.parse(fromIso)
    if (!Number.isFinite(validFromMs)) continue
    let overlaps = false
    if (typeof toVal === 'number' && toVal > 1) {
      overlaps = validFromMs <= endMs && toVal >= startMs
    } else if (toVal === 1) {
      overlaps = validFromMs <= endMs
    }
    if (overlaps) {
      matchingIds.push(id)
      if (latestObsMs === null || validFromMs > latestObsMs) {
        latestObsMs = validFromMs
        latestObsIso = fromIso
      }
    }
  }

  const fallbackSite = snapshot.site['site.met_warning_in_force']
  const inForce = matchingIds.length > 0 || (warnSeries.length === 0 && fallbackSite?.value === true)
  const obsIso = latestObsIso ?? fallbackSite?.observedAt ?? since
  const obsMs = obsIso ? Date.parse(obsIso) : null
  const ageS = obsMs !== null && Number.isFinite(obsMs) ? Math.max(0, Math.floor((tEvalMs - obsMs) / 1_000)) : 0

  return {
    name: indName,
    value: inForce,
    unit: '',
    state: 'fresh',
    since,
    ageS,
    sourceIds,
    readingIds: matchingIds,
    observedAt: obsIso
  }
}

function buildNightIndicators(
  night: NightInput | undefined,
  snapshot: IndicatorSnapshot,
  tEvalMs: number
): Map<string, IndicatorValue> {
  const map = new Map<string, IndicatorValue>()
  if (!night) return map

  const nightState: InputState =
    night.state === 'fresh' ||
    night.state === 'stale' ||
    night.state === 'error' ||
    night.state === 'recovered' ||
    night.state === 'pending' ||
    night.state === 'probation' ||
    night.state === 'off_hours'
      ? night.state
      : 'stale'

  const entries: Array<[string, IndicatorValue['value'], string]> = [
    ['site.night.baseline', night.baseline, 'exits'],
    ['site.night.uplift', night.uplift, 'exits'],
    ['site.night.forecast', night.forecast, 'exits'],
    ['site.night.band_low', night.band?.low ?? null, 'exits'],
    ['site.night.band_high', night.band?.high ?? null, 'exits'],
    ['site.night.doors', night.doors, ''],
    ['site.night.show', night.show, ''],
    ['site.night.arrival_start', night.arrivalStart, ''],
    ['site.night.arrival_end', night.arrivalEnd, ''],
    ['site.night.exit_start', night.exitStart, ''],
    ['site.night.exit_end', night.exitEnd, ''],
    ['site.night.single_source', night.singleSource, '']
  ]

  for (const [name, rawVal, unit] of entries) {
    const inputStatus = snapshot.inputs.find((i) => i.name === name)
    const effectiveState: InputState =
      rawVal === null || rawVal === undefined
        ? 'stale'
        : nightState !== 'fresh'
          ? nightState
          : (inputStatus?.state ?? 'fresh')
    const since = inputStatus?.since ?? snapshot.tEval
    const sourceIds = inputStatus?.sourceId
      ? [inputStatus.sourceId]
      : night.forecastId
        ? [night.forecastId]
        : [night.id]

    map.set(name, {
      name,
      value: effectiveState === 'fresh' ? rawVal : null,
      unit,
      state: effectiveState,
      since,
      ageS: effectiveState === 'fresh' ? 0 : Math.max(0, Math.floor((tEvalMs - Date.parse(since)) / 1_000)),
      sourceIds,
      readingIds: night.forecastId ? [night.forecastId] : [],
      observedAt: snapshot.tEval
    })
  }

  return map
}

function buildWindowIntrinsicValues(
  window: Window,
  tEvalIso: Instant
): Map<string, { iv: IndicatorValue; celVal: unknown }> {
  const map = new Map<string, { iv: IndicatorValue; celVal: unknown }>()
  const startMs = Date.parse(window.startsAt)
  const endMs = Date.parse(window.endsAt)
  const startIso = formatInstant(startMs)
  const endIso = formatInstant(endMs)
  const startLocalMin = toLocalMinutes(startMs, window.tz)
  const endLocalMin = toLocalMinutes(endMs, window.tz)
  const durationSec = Math.max(0, Math.floor((endMs - startMs) / 1_000))

  const baseIv = (name: string, value: IndicatorValue['value'], unit = ''): IndicatorValue => ({
    name,
    value,
    unit,
    state: 'fresh',
    since: tEvalIso,
    ageS: 0,
    sourceIds: [window.id],
    readingIds: [],
    observedAt: tEvalIso
  })

  map.set('w.start', {
    iv: baseIv('w.start', startIso),
    celVal: toCelTimestamp(startIso)
  })
  map.set('w.end', {
    iv: baseIv('w.end', endIso),
    celVal: toCelTimestamp(endIso)
  })
  map.set('w.start_local_min', {
    iv: baseIv('w.start_local_min', startLocalMin, 'min'),
    celVal: BigInt(startLocalMin)
  })
  map.set('w.end_local_min', {
    iv: baseIv('w.end_local_min', endLocalMin, 'min'),
    celVal: BigInt(endLocalMin)
  })
  map.set('w.kind', {
    iv: baseIv('w.kind', window.kind),
    celVal: window.kind
  })
  map.set('w.duration', {
    iv: baseIv('w.duration', durationSec, 's'),
    celVal: toCelDuration(BigInt(durationSec))
  })

  return map
}

function setNestedBinding(
  root: { site: Record<string, unknown>; w: Record<string, unknown> },
  fullName: string,
  celVal: unknown
) {
  if (celVal === undefined || celVal === null) return
  const parts = fullName.split('.')
  if (parts[0] === 'site') {
    if (parts.length === 2) {
      root.site[parts[1]!] = celVal
    } else if (parts.length === 3 && parts[1] === 'night') {
      const nightObj = (root.site.night as Record<string, unknown> | undefined) ?? {}
      nightObj[parts[2]!] = celVal
      root.site.night = nightObj
    }
  } else if (parts[0] === 'w' && parts.length === 2) {
    root.w[parts[1]!] = celVal
  }
}

function evaluateClauseInScope(
  clause: Clause,
  snapshot: IndicatorSnapshot,
  tEvalMs: number,
  tEvalIso: Instant,
  window: Window | undefined,
  night: NightInput | undefined
): ClauseExplanation {
  let spanInfo: { from: Instant; to: Instant; complete: boolean; fromMs: number; toMs: number } | undefined
  if (window && clause.scope === 'window' && clause.span) {
    const resolved = resolveWindowSpan(window, clause.span)
    const complete = tEvalMs >= resolved.toMs
    spanInfo = {
      from: resolved.from,
      to: resolved.to,
      complete,
      fromMs: resolved.fromMs,
      toMs: resolved.toMs
    }

    if (tEvalMs < resolved.fromMs) {
      const resultObj: ClauseExplanation = {
        key: clause.key,
        result: 'not_open',
        blockedBy: [],
        span: { from: resolved.from, to: resolved.to, complete: false },
        inputs: [],
        cel: clause.when,
        wording: formatWording(clause.wording, [])
      }
      return resultObj
    }
  }

  const nightIndicators = buildNightIndicators(night, snapshot, tEvalMs)
  const windowIntrinsics = window ? buildWindowIntrinsicValues(window, tEvalIso) : new Map()

  const resolveIndicatorValue = (name: string): { iv: IndicatorValue; status: InputStatus; celVal: unknown } => {
    if (windowIntrinsics.has(name)) {
      const winEntry = windowIntrinsics.get(name)!
      return {
        iv: winEntry.iv,
        status: { name, sourceId: window!.id, state: 'fresh', since: tEvalIso },
        celVal: winEntry.celVal
      }
    }

    if (name.startsWith('site.night.')) {
      const niv = nightIndicators.get(name)
      const inpStatus = snapshot.inputs.find((i) => i.name === name)
      if (niv) {
        const typeEntry = DEFAULT_TYPE_ENV.get(name)
        return {
          iv: niv,
          status: {
            name,
            sourceId: niv.sourceIds[0] ?? inpStatus?.sourceId ?? null,
            state: niv.state,
            since: niv.since ?? tEvalIso
          },
          celVal: niv.state === 'fresh' ? indicatorValToCel(niv.value, typeEntry?.celType) : undefined
        }
      }
      return {
        iv: {
          name,
          value: null,
          unit: KNOWN_INDICATOR_UNITS[name] ?? '',
          state: 'stale',
          since: tEvalIso,
          ageS: null,
          sourceIds: [],
          readingIds: [],
          observedAt: null
        },
        status: { name, sourceId: inpStatus?.sourceId ?? null, state: 'stale', since: tEvalIso },
        celVal: undefined
      }
    }

    if (window && (name === 'w.rain_max_60m_mm' || name === 'w.rain_max_4h_mm')) {
      const defaultRainSpan = resolveWindowSpan(window, { from: 'end-30m', to: 'end+60m' })
      const fromMs = spanInfo ? spanInfo.fromMs : defaultRainSpan.fromMs
      const toMs = spanInfo ? spanInfo.toMs : defaultRainSpan.toMs
      const wiv = computeWindowRainIndicator(name, snapshot, fromMs, toMs, tEvalMs)
      const inpStatus =
        snapshot.inputs.find((i) => i.name === name) ?? snapshot.inputs.find((i) => i.name === 'site.rain_60m_mm')
      return {
        iv: wiv,
        status: {
          name,
          sourceId: inpStatus?.sourceId ?? wiv.sourceIds[0] ?? null,
          state: wiv.state,
          since: wiv.since ?? tEvalIso
        },
        celVal: wiv.state === 'fresh' && wiv.value !== null ? indicatorValToCel(wiv.value, 'double') : undefined
      }
    }

    if (window && name === 'w.met_warning_in_force') {
      const wiv = computeWindowWarningIndicator(snapshot, window, tEvalMs)
      const inpStatus =
        snapshot.inputs.find((i) => i.name === name) ??
        snapshot.inputs.find((i) => i.name === 'site.met_warning_in_force')
      return {
        iv: wiv,
        status: {
          name,
          sourceId: inpStatus?.sourceId ?? wiv.sourceIds[0] ?? null,
          state: wiv.state,
          since: wiv.since ?? tEvalIso
        },
        celVal: wiv.state === 'fresh' && wiv.value !== null ? indicatorValToCel(wiv.value, 'bool') : undefined
      }
    }

    const siteIv = snapshot.site[name]
    const inpStatus = snapshot.inputs.find((i) => i.name === name)
    const state: InputState = siteIv?.state ?? inpStatus?.state ?? 'stale'
    const since: Instant = siteIv?.since ?? inpStatus?.since ?? tEvalIso
    const sourceId: string | null = inpStatus !== undefined ? inpStatus.sourceId : (siteIv?.sourceIds[0] ?? null)

    const iv: IndicatorValue = siteIv ?? {
      name,
      value: null,
      unit: KNOWN_INDICATOR_UNITS[name] ?? '',
      state,
      since,
      ageS: null,
      sourceIds: sourceId ? [sourceId] : [],
      readingIds: [],
      observedAt: null
    }

    const typeEntry = DEFAULT_TYPE_ENV.get(name)
    const usable = iv.state === 'fresh' && iv.value !== null && iv.value !== undefined
    return {
      iv,
      status: { name, sourceId, state: iv.state, since: iv.since ?? tEvalIso },
      celVal: usable ? indicatorValToCel(iv.value, typeEntry?.celType) : undefined
    }
  }

  const blockedBy: BlockedInput[] = []
  const inputs: IndicatorValue[] = []
  const bindings: { site: Record<string, unknown>; w: Record<string, unknown> } = { site: {}, w: {} }

  for (const reqName of clause.requires) {
    const resolved = resolveIndicatorValue(reqName)
    if (!windowIntrinsics.has(reqName)) {
      inputs.push(resolved.iv)
    }
    if (resolved.status.state !== 'fresh' || resolved.celVal === undefined) {
      blockedBy.push({
        name: reqName,
        sourceId: resolved.status.sourceId,
        state: resolved.status.state,
        since: resolved.status.since
      })
    } else {
      setNestedBinding(bindings, reqName, resolved.celVal)
    }
  }

  for (const optName of clause.optional ?? []) {
    const resolved = resolveIndicatorValue(optName)
    if (resolved.status.state === 'fresh' && resolved.celVal !== undefined) {
      inputs.push(resolved.iv)
      setNestedBinding(bindings, optName, resolved.celVal)
    }
  }

  const spanProp =
    clause.span && spanInfo ? { span: { from: spanInfo.from, to: spanInfo.to, complete: spanInfo.complete } } : {}

  if (blockedBy.length > 0) {
    return {
      key: clause.key,
      result: 'blocked',
      blockedBy,
      ...spanProp,
      inputs,
      cel: clause.when,
      wording: formatWording(clause.wording, inputs)
    }
  }

  const fired = evalCelCondition(clause.when, bindings)
  return {
    key: clause.key,
    result: fired ? 'fired' : 'not_fired',
    blockedBy: [],
    ...spanProp,
    inputs,
    cel: clause.when,
    wording: formatWording(clause.wording, inputs)
  }
}

function finalizeScopeVerdict(
  scope: Verdict['scope'],
  pack: CheckedSheet['pack'],
  clausesWithMeta: Array<{ clause: Clause; evaluation: ClauseExplanation }>
): Verdict {
  // Handle builtin silent_input clause if present
  const nonBuiltinBlockedInputs: BlockedInput[] = []
  const seenBlockedNames = new Set<string>()
  for (const { clause, evaluation } of clausesWithMeta) {
    if (clause.builtin === 'silent_input') continue
    if (evaluation.result === 'blocked') {
      for (const b of evaluation.blockedBy) {
        if (!seenBlockedNames.has(b.name)) {
          seenBlockedNames.add(b.name)
          nonBuiltinBlockedInputs.push(b)
        }
      }
    }
  }

  const finalClauseResults: ClauseExplanation[] = []
  let highestFiredRank = 0
  let highestFiredMode: SkyMode | CrowdMode = 'normal'
  let highestBlockedRank = -1
  let hasBlockedRecommendationWithoutFiredMode = false
  let watch = false
  const recommendations: Recommendation[] = []
  const seenRecs = new Set<Recommendation>()
  let earliestOpenFromMs: number | null = null
  let earliestOpenFromIso: Instant | null = null

  for (const { clause, evaluation } of clausesWithMeta) {
    if (clause.builtin === 'silent_input') {
      const silentFired = nonBuiltinBlockedInputs.length > 0
      finalClauseResults.push({
        ...evaluation,
        result: silentFired ? 'fired' : 'not_fired',
        blockedBy: nonBuiltinBlockedInputs
      })
      continue
    }

    finalClauseResults.push(evaluation)

    if (evaluation.result === 'not_open' && evaluation.span) {
      const fromMs = Date.parse(evaluation.span.from)
      if (Number.isFinite(fromMs) && (earliestOpenFromMs === null || fromMs < earliestOpenFromMs)) {
        earliestOpenFromMs = fromMs
        earliestOpenFromIso = evaluation.span.from
      }
      continue
    }

    if (evaluation.result === 'fired') {
      if (clause.proposes.watch) {
        watch = true
      }
      if (clause.proposes.mode) {
        const r = modeRank(clause.proposes.mode)
        if (r > highestFiredRank) {
          highestFiredRank = r
          highestFiredMode = clause.proposes.mode
        }
      }
      if (clause.proposes.recommendations) {
        for (const rec of clause.proposes.recommendations) {
          if (!seenRecs.has(rec)) {
            seenRecs.add(rec)
            recommendations.push(rec)
          }
        }
      }
    } else if (evaluation.result === 'blocked') {
      if (clause.proposes.mode) {
        const r = modeRank(clause.proposes.mode)
        if (r > highestBlockedRank) {
          highestBlockedRank = r
        }
      } else if (clause.proposes.recommendations && clause.proposes.recommendations.length > 0) {
        hasBlockedRecommendationWithoutFiredMode = true
      }
    }
  }

  const isNoCall =
    highestBlockedRank > highestFiredRank ||
    (pack === 'crowd' &&
      hasBlockedRecommendationWithoutFiredMode &&
      highestFiredRank === 0 &&
      nonBuiltinBlockedInputs.length > 0)

  const noCallBlockingInputs: BlockedInput[] = []
  if (isNoCall) {
    const seen = new Set<string>()
    for (const { clause, evaluation } of clausesWithMeta) {
      if (clause.builtin === 'silent_input' || evaluation.result !== 'blocked') continue
      const r = modeRank(clause.proposes.mode)
      if (r > highestFiredRank || (pack === 'crowd' && clause.proposes.recommendations?.length)) {
        for (const b of evaluation.blockedBy) {
          if (!seen.has(b.name)) {
            seen.add(b.name)
            noCallBlockingInputs.push(b)
          }
        }
      }
    }
  }

  return {
    scope,
    pack,
    mode: isNoCall ? null : highestFiredMode,
    watch,
    noCall: isNoCall ? { inputs: noCallBlockingInputs } : null,
    recommendations,
    clauses: finalClauseResults,
    openFrom: earliestOpenFromIso
  }
}

export const evaluate: Evaluate = (
  sheet: CheckedSheet,
  snapshot: IndicatorSnapshot,
  windows: Window[],
  tEval: Instant
): Verdicts => {
  const tEvalMs = Date.parse(tEval)
  const tEvalIso = formatInstant(tEvalMs)
  const enabledClauses = sheet.clauses.filter((c) => c.enabled)

  const siteClauses = enabledClauses.filter((c) => c.scope === 'site')
  const nightClauses = enabledClauses.filter((c) => c.scope === 'night' || c.builtin === 'silent_input')

  // 1. Site verdicts (for Sky pack or whenever non-builtin site clauses exist)
  const siteVerdicts: Verdict[] = []
  if (sheet.pack === 'sky' || siteClauses.some((c) => c.builtin !== 'silent_input')) {
    const evals = siteClauses.map((clause) => ({
      clause,
      evaluation: evaluateClauseInScope(clause, snapshot, tEvalMs, tEvalIso, undefined, snapshot.nights[0])
    }))
    siteVerdicts.push(finalizeScopeVerdict({ kind: 'site', id: null }, sheet.pack, evals))
  }

  // 2. Night verdicts
  const nightVerdicts: Verdict[] = []
  for (const night of snapshot.nights) {
    const evals = nightClauses.map((clause) => ({
      clause,
      evaluation: evaluateClauseInScope(clause, snapshot, tEvalMs, tEvalIso, undefined, night)
    }))
    nightVerdicts.push(finalizeScopeVerdict({ kind: 'night', id: night.id }, sheet.pack, evals))
  }

  // 3. Window verdicts (site clauses + window clauses in sheet order)
  const windowApplicableClauses = enabledClauses.filter((c) => c.scope === 'window' || c.scope === 'site')
  const windowVerdicts: Verdict[] = []
  for (const win of windows) {
    const winDate = toMytDateString(Date.parse(win.startsAt))
    const matchingNight = snapshot.nights.find((n) => n.date === winDate) ?? snapshot.nights[0]
    const evals = windowApplicableClauses.map((clause) => ({
      clause,
      evaluation: evaluateClauseInScope(clause, snapshot, tEvalMs, tEvalIso, win, matchingNight)
    }))
    windowVerdicts.push(finalizeScopeVerdict({ kind: 'window', id: win.id }, sheet.pack, evals))
  }

  const baseVerdicts = {
    tEval: tEvalIso,
    pack: sheet.pack,
    contentHash: sheet.contentHash,
    snapshotHash: snapshot.hash,
    site: siteVerdicts,
    windows: windowVerdicts,
    nights: nightVerdicts
  }

  return {
    ...baseVerdicts,
    hash: canonicalHash(baseVerdicts)
  }
}

export const explain: Explain = (v: Verdicts): ClauseExplanation[] => {
  const allVerdicts: Verdict[] = [...v.windows, ...v.nights, ...v.site]
  const out: ClauseExplanation[] = []

  for (const verdict of allVerdicts) {
    for (const clause of verdict.clauses) {
      const withMeta = clause as ClauseResult & {
        cel?: string
        wording?: { en?: string; ms?: string }
      }
      out.push({
        ...clause,
        cel: typeof withMeta.cel === 'string' ? withMeta.cel : '',
        wording: withMeta.wording ? formatWording(withMeta.wording, clause.inputs) : {}
      })
    }
  }

  return out
}
