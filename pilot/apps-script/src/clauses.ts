import { toMytIso } from '../../shared/time.ts'
import type { IndicatorEvidence, ResolvedInputState, SkySnapshotFacts } from './indicators.ts'
import type { Cell, Row } from './schema.ts'

export const SKY_CLAUSE_KEYS = [
  'haze_watch',
  'haze_severe',
  'storm_watch',
  'storm_confirmed',
  'flash_flood_risk',
  'silent_input'
] as const

export type SkyClauseKey = (typeof SKY_CLAUSE_KEYS)[number]

export type SkyMode = 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended'

export type SkyVerdictValue = SkyMode | 'no_call'

export type SkyClauseProposal = SkyMode | 'watch' | 'no_call'

export type SkyClauseStatus = 'fired' | 'not' | `blocked:${string}`

export const SKY_MODE_RANKS: Record<SkyMode, number> = {
  normal: 0,
  outdoor_limited: 1,
  commute_disruption: 2,
  hybrid_recommended: 3
}

const RANK_TO_MODE: Record<number, SkyMode> = {
  0: 'normal',
  1: 'outdoor_limited',
  2: 'commute_disruption',
  3: 'hybrid_recommended'
}

export interface SkyClauseResult {
  key: string
  status: SkyClauseStatus
  proposes: SkyClauseProposal | null
  rank: number | null
  blockedInput: string | null
  stateSince: string | null
  reason: string | null
  wordingEn: string
  evidence: IndicatorEvidence[]
}

export interface SkyBlockedInputDetail {
  input: string
  state: string | null
  stateSince: string | null
  clauses: string[]
}

export interface SkyClauseInput {
  tEval: string
  snapshot: SkySnapshotFacts
  clauses: readonly Row<'clauses'>[]
  windows?: readonly Row<'windows'>[]
  clauseVersion?: string | number | null
}

export interface SkyVerdict {
  scope: string
  snapshotId: string
  clauseVersion: string | number | null
  spanFrom: string | null
  spanTo: string | null
  watch: boolean
  mode: SkyMode
  verdict: SkyVerdictValue
  clauses: Record<SkyClauseKey, SkyClauseResult>
  firedClauses: SkyClauseKey[]
  blockedClauses: SkyClauseKey[]
  blockedInputs: string[]
  blockedDetails: SkyBlockedInputDetail[]
  shadowRow: Row<'shadow'>
}

type NumericOp = '>' | '>=' | '<' | '<=' | '=='

const VALID_NUMERIC_OPS = new Set<NumericOp>(['>', '>=', '<', '<=', '=='])
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const MAX_MODE_RANK = SKY_MODE_RANKS.hybrid_recommended

const DEFAULT_SKY_CLAUSE_ROWS: readonly Row<'clauses'>[] = [
  {
    pack: 'sky',
    Clause: 'Haze watch',
    Reads: 'API at Cheras, Petaling Jaya, Putrajaya; camera',
    'Fires when (default)':
      'API 101 or more at any station, or (after probation) the far-skyline contrast below its threshold on three daylight frames with no gauge rain',
    Proposes: 'Outdoor-limited',
    key: 'haze_watch',
    requires: JSON.stringify(['site.api_max']),
    span_from: '',
    span_to: '',
    threshold: JSON.stringify({
      api_max: 101,
      camera_far_ratio: 0.5,
      gauge_rain_last3frames_mm: 0
    }),
    op: JSON.stringify({
      api_max: '>=',
      camera_far_ratio: '<',
      gauge_rain_last3frames_mm: '==',
      join: 'or'
    }),
    proposes_key: 'outdoor_limited',
    rank: 1,
    wording_en: 'Limit outdoor activity for the window',
    enabled: true
  },
  {
    pack: 'sky',
    Clause: 'Haze severe',
    Reads: 'API, last three 06:00 readings',
    'Fires when (default)':
      'API above 180, or above 150 at 06:00 on three consecutive days at one station (the 8 October school rule)',
    Proposes: 'Hybrid recommended',
    key: 'haze_severe',
    requires: JSON.stringify(['site.api_max', 'site.api_0600']),
    span_from: '',
    span_to: '',
    threshold: JSON.stringify({ api_max: 180, api_0600: 150, days: 3 }),
    op: JSON.stringify({ api_max: '>', api_0600: '>', join: 'or' }),
    proposes_key: 'hybrid_recommended',
    rank: 3,
    wording_en: "Hybrid is recommended; teaching mode is the lecturer's and the university's decision",
    enabled: true
  },
  {
    pack: 'sky',
    Clause: 'Storm watch',
    Reads: 'MET warnings',
    'Fires when (default)':
      'A warning, not No Advisory or marine, naming Kuala Lumpur in `text_en` or `text_bm`, with `valid_from` ≤ window end and `valid_to` ≥ start',
    Proposes: 'Nothing alone; printed as context',
    key: 'storm_watch',
    requires: JSON.stringify(['w.met_kl_warning_in_force']),
    span_from: 'start',
    span_to: 'end',
    threshold: true,
    op: '==',
    proposes_key: 'watch',
    rank: '',
    wording_en: '',
    enabled: true
  },
  {
    pack: 'sky',
    Clause: 'Storm confirmed',
    Reads: 'JPS gauge',
    'Fires when (default)':
      'At least 31 mm in 60 minutes ("Lebat") from 30 minutes before to 60 minutes after a window ends',
    Proposes: 'Commute disruption',
    key: 'storm_confirmed',
    requires: JSON.stringify(['w.rain_max_60m_mm']),
    span_from: 'end-30m',
    span_to: 'end+60m',
    threshold: 31,
    op: '>=',
    proposes_key: 'commute_disruption',
    rank: 2,
    wording_en: 'Storm confirmed at the JPS gauge (Lebat class)',
    enabled: true
  },
  {
    pack: 'sky',
    Clause: 'Flash-flood risk',
    Reads: 'JPS gauge',
    'Fires when (default)': "More than 60 mm in 2–4 hours, Public Infobanjir's flash-flood note",
    Proposes: 'Commute disruption, flood note',
    key: 'flash_flood_risk',
    requires: JSON.stringify(['w.rain_max_4h_mm']),
    span_from: 'end-30m',
    span_to: 'end+60m',
    threshold: 60,
    op: '>',
    proposes_key: 'commute_disruption',
    rank: 2,
    wording_en: 'Expect disruption getting to or leaving the window',
    enabled: true
  },
  {
    pack: 'sky',
    Clause: 'Silent input',
    Reads: 'Every feed',
    'Fires when (default)': 'No reading for two intervals, or an error row',
    Proposes: 'No call for clauses needing it',
    key: 'silent_input',
    requires: JSON.stringify(['every_input']),
    span_from: '',
    span_to: '',
    threshold: 'not_fresh',
    op: '!=',
    proposes_key: 'no_call',
    rank: '',
    wording_en: '',
    enabled: true
  }
]

export function defaultSkyClauseRows(): Row<'clauses'>[] {
  return DEFAULT_SKY_CLAUSE_ROWS.map((row) => ({ ...row }))
}

function normalizeIsoCell(cell: Cell | undefined): string | null {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : null
  }
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return toMytIso(new Date(ms))
}

function toFiniteNumber(cell: Cell | undefined): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function isEnabledCell(cell: Cell | undefined): boolean {
  if (typeof cell === 'boolean') return cell
  if (typeof cell === 'string') {
    const lower = cell.trim().toLowerCase()
    if (lower === 'false' || lower === '0' || lower === 'no') return false
    if (lower === 'true' || lower === '1' || lower === 'yes' || lower === '') return true
  }
  return cell !== 0
}

function isNumericOp(value: unknown): value is NumericOp {
  return typeof value === 'string' && VALID_NUMERIC_OPS.has(value as NumericOp)
}

function compareNumeric(actual: number, op: NumericOp, threshold: number): boolean {
  switch (op) {
    case '>':
      return actual > threshold
    case '>=':
      return actual >= threshold
    case '<':
      return actual < threshold
    case '<=':
      return actual <= threshold
    case '==':
      return actual === threshold
  }
}

function parseJsonStringArray(raw: Cell | undefined): string[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    if (!parsed.every((item): item is string => typeof item === 'string' && item.trim().length > 0)) {
      return null
    }
    return parsed.map((s) => s.trim())
  } catch {
    return null
  }
}

function parsePlainJsonObject(raw: Cell | undefined): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

interface ValidatedHazeWatchSpec {
  kind: 'haze_watch'
  apiMaxThreshold: number
  apiMaxOp: NumericOp
  cameraRatioThreshold: number
  cameraRatioOp: NumericOp
  gaugeRainThreshold: number
  gaugeRainOp: NumericOp
  join: 'or' | 'and'
}

interface ValidatedHazeSevereSpec {
  kind: 'haze_severe'
  apiMaxThreshold: number
  apiMaxOp: NumericOp
  api0600Threshold: number
  api0600Op: NumericOp
  days: number
  join: 'or' | 'and'
}

interface ValidatedStormWatchSpec {
  kind: 'storm_watch'
  expectedBool: boolean
}

interface ValidatedRainSpec {
  kind: 'storm_confirmed' | 'flash_flood_risk'
  metric: 'w.rain_max_60m_mm' | 'w.rain_max_4h_mm'
  threshold: number
  op: NumericOp
}

type ValidatedClauseSpec =
  ValidatedHazeWatchSpec | ValidatedHazeSevereSpec | ValidatedStormWatchSpec | ValidatedRainSpec

interface ParsedClauseRow {
  key: string
  knownKey: SkyClauseKey | null
  enabled: boolean
  proposes: SkyClauseProposal | null
  rank: number | null
  effectiveBlockRank: number
  wordingEn: string
  isWindowScoped: boolean
  spec: ValidatedClauseSpec | null
  errorReason: string | null
}

function parseKnownProposalAndRank(
  key: SkyClauseKey,
  proposesRaw: Cell | undefined,
  rankRaw: Cell | undefined
): { proposes: SkyClauseProposal; rank: number | null } | null {
  const proposes = String(proposesRaw ?? '').trim()
  const rankStr = String(rankRaw ?? '').trim()

  if (key === 'haze_watch') {
    if (proposes !== 'outdoor_limited' || toFiniteNumber(rankRaw) !== 1) return null
    return { proposes: 'outdoor_limited', rank: 1 }
  }
  if (key === 'haze_severe') {
    if (proposes !== 'hybrid_recommended' || toFiniteNumber(rankRaw) !== 3) return null
    return { proposes: 'hybrid_recommended', rank: 3 }
  }
  if (key === 'storm_watch') {
    if (proposes !== 'watch' || rankStr !== '') return null
    return { proposes: 'watch', rank: null }
  }
  if (key === 'storm_confirmed' || key === 'flash_flood_risk') {
    if (proposes !== 'commute_disruption' || toFiniteNumber(rankRaw) !== 2) return null
    return { proposes: 'commute_disruption', rank: 2 }
  }
  if (key === 'silent_input') {
    if (proposes !== 'no_call' || rankStr !== '') return null
    return { proposes: 'no_call', rank: null }
  }
  return null
}

function parseAndValidateClauseRow(row: Row<'clauses'>): ParsedClauseRow {
  const key = String(row.key ?? '').trim()
  const knownKey = (SKY_CLAUSE_KEYS as readonly string[]).includes(key) ? (key as SkyClauseKey) : null
  const enabled = isEnabledCell(row.enabled)
  const wordingEn = String(row.wording_en ?? '').trim()
  const isWindowScoped = knownKey === 'storm_watch' || knownKey === 'storm_confirmed' || knownKey === 'flash_flood_risk'

  if (!knownKey) {
    return {
      key: key || 'unknown',
      knownKey: null,
      enabled,
      proposes: null,
      rank: null,
      effectiveBlockRank: MAX_MODE_RANK,
      wordingEn,
      isWindowScoped: false,
      spec: null,
      errorReason: `Unknown Sky clause key: ${key || '(blank)'}`
    }
  }

  const proposalMeta = parseKnownProposalAndRank(knownKey, row.proposes_key, row.rank)
  const fallbackRank =
    knownKey === 'haze_watch'
      ? 1
      : knownKey === 'storm_confirmed' || knownKey === 'flash_flood_risk'
        ? 2
        : MAX_MODE_RANK
  const proposes = proposalMeta?.proposes ?? null
  const rank = proposalMeta ? proposalMeta.rank : fallbackRank
  const effectiveBlockRank = proposalMeta ? (proposalMeta.rank ?? MAX_MODE_RANK) : MAX_MODE_RANK

  if (!enabled || knownKey === 'silent_input') {
    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes: proposes ?? (knownKey === 'silent_input' ? 'no_call' : null),
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: null,
      errorReason: proposalMeta ? null : 'Invalid proposes_key or rank'
    }
  }

  if (!proposalMeta) {
    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank: MAX_MODE_RANK,
      wordingEn,
      isWindowScoped,
      spec: null,
      errorReason: 'Invalid proposes_key or rank'
    }
  }

  const requires = parseJsonStringArray(row.requires)
  const spanFrom = String(row.span_from ?? '').trim()
  const spanTo = String(row.span_to ?? '').trim()

  if (!requires) {
    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: null,
      errorReason: 'Malformed requires JSON array'
    }
  }

  if (knownKey === 'haze_watch') {
    const allowedReq = new Set(['site.api_max', 'site.camera_far_ratio_last3', 'site.gauge_rain_last3frames_mm'])
    if (
      spanFrom !== '' ||
      spanTo !== '' ||
      !requires.includes('site.api_max') ||
      !requires.every((r) => allowedReq.has(r))
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Unsupported requires or span on haze_watch'
      }
    }

    const threshObj = parsePlainJsonObject(row.threshold)
    const opObj = parsePlainJsonObject(row.op)
    const allowedKeys = new Set(['api_max', 'camera_far_ratio', 'gauge_rain_last3frames_mm', 'join'])
    if (
      !threshObj ||
      !opObj ||
      !Object.keys(threshObj).every((k) => allowedKeys.has(k)) ||
      !Object.keys(opObj).every((k) => allowedKeys.has(k))
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Malformed threshold or op JSON on haze_watch'
      }
    }

    const apiMaxThreshold = toFiniteNumber(threshObj.api_max as Cell)
    const apiMaxOp = opObj.api_max
    const cameraRatioThreshold =
      threshObj.camera_far_ratio !== undefined ? toFiniteNumber(threshObj.camera_far_ratio as Cell) : 0.5
    const cameraRatioOp = opObj.camera_far_ratio !== undefined ? opObj.camera_far_ratio : '<'
    const gaugeRainThreshold =
      threshObj.gauge_rain_last3frames_mm !== undefined
        ? toFiniteNumber(threshObj.gauge_rain_last3frames_mm as Cell)
        : 0
    const gaugeRainOp = opObj.gauge_rain_last3frames_mm !== undefined ? opObj.gauge_rain_last3frames_mm : '=='
    const join = opObj.join !== undefined ? opObj.join : 'or'

    if (
      apiMaxThreshold === null ||
      !isNumericOp(apiMaxOp) ||
      cameraRatioThreshold === null ||
      !isNumericOp(cameraRatioOp) ||
      gaugeRainThreshold === null ||
      !isNumericOp(gaugeRainOp) ||
      (join !== 'or' && join !== 'and')
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Unsupported operator or threshold in haze_watch'
      }
    }

    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: {
        kind: 'haze_watch',
        apiMaxThreshold,
        apiMaxOp,
        cameraRatioThreshold,
        cameraRatioOp,
        gaugeRainThreshold,
        gaugeRainOp,
        join
      },
      errorReason: null
    }
  }

  if (knownKey === 'haze_severe') {
    const allowedReq = new Set(['site.api_max', 'site.api_0600'])
    if (
      spanFrom !== '' ||
      spanTo !== '' ||
      !requires.includes('site.api_max') ||
      !requires.includes('site.api_0600') ||
      !requires.every((r) => allowedReq.has(r))
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Unsupported requires or span on haze_severe'
      }
    }

    const threshObj = parsePlainJsonObject(row.threshold)
    const opObj = parsePlainJsonObject(row.op)
    const allowedThreshKeys = new Set(['api_max', 'api_0600', 'days'])
    const allowedOpKeys = new Set(['api_max', 'api_0600', 'join'])
    if (
      !threshObj ||
      !opObj ||
      !Object.keys(threshObj).every((k) => allowedThreshKeys.has(k)) ||
      !Object.keys(opObj).every((k) => allowedOpKeys.has(k))
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Malformed threshold or op JSON on haze_severe'
      }
    }

    const apiMaxThreshold = toFiniteNumber(threshObj.api_max as Cell)
    const api0600Threshold = toFiniteNumber(threshObj.api_0600 as Cell)
    const days = toFiniteNumber(threshObj.days as Cell)
    const apiMaxOp = opObj.api_max
    const api0600Op = opObj.api_0600
    const join = opObj.join

    if (
      apiMaxThreshold === null ||
      api0600Threshold === null ||
      days === null ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 3 ||
      !isNumericOp(apiMaxOp) ||
      !isNumericOp(api0600Op) ||
      (join !== 'or' && join !== 'and')
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Unsupported operator or threshold in haze_severe'
      }
    }

    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: {
        kind: 'haze_severe',
        apiMaxThreshold,
        apiMaxOp,
        api0600Threshold,
        api0600Op,
        days,
        join
      },
      errorReason: null
    }
  }

  if (knownKey === 'storm_watch') {
    if (
      requires.length !== 1 ||
      requires[0] !== 'w.met_kl_warning_in_force' ||
      spanFrom !== 'start' ||
      spanTo !== 'end'
    ) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Unsupported requires or span on storm_watch'
      }
    }

    const opStr = String(row.op ?? '').trim()
    const threshRaw = row.threshold
    const isBoolThresh =
      typeof threshRaw === 'boolean' || (typeof threshRaw === 'string' && /^(true|false)$/i.test(threshRaw.trim()))

    if ((opStr !== '==' && opStr !== 'is') || !isBoolThresh) {
      return {
        key: knownKey,
        knownKey,
        enabled,
        proposes,
        rank,
        effectiveBlockRank,
        wordingEn,
        isWindowScoped,
        spec: null,
        errorReason: 'Unsupported operator or threshold on storm_watch'
      }
    }

    const expectedBool = typeof threshRaw === 'boolean' ? threshRaw : threshRaw.trim().toLowerCase() === 'true'
    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: { kind: 'storm_watch', expectedBool },
      errorReason: null
    }
  }

  const expectedMetric = knownKey === 'storm_confirmed' ? 'w.rain_max_60m_mm' : ('w.rain_max_4h_mm' as const)
  if (requires.length !== 1 || requires[0] !== expectedMetric || spanFrom !== 'end-30m' || spanTo !== 'end+60m') {
    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: null,
      errorReason: `Unsupported requires or span on ${knownKey}`
    }
  }

  const numThresh = toFiniteNumber(row.threshold)
  const opStr = String(row.op ?? '').trim()
  if (numThresh === null || !isNumericOp(opStr)) {
    return {
      key: knownKey,
      knownKey,
      enabled,
      proposes,
      rank,
      effectiveBlockRank,
      wordingEn,
      isWindowScoped,
      spec: null,
      errorReason: `Unsupported threshold or op on ${knownKey}`
    }
  }

  return {
    key: knownKey,
    knownKey,
    enabled,
    proposes,
    rank,
    effectiveBlockRank,
    wordingEn,
    isWindowScoped,
    spec: {
      kind: knownKey,
      metric: expectedMetric,
      threshold: numThresh,
      op: opStr
    },
    errorReason: null
  }
}

function parseUtcDayMs(dateStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const ms = Date.UTC(year, month - 1, day)
  return Number.isFinite(ms) ? ms : null
}

function hasConsecutiveDaysMeetingThreshold(
  rawJson: Cell | undefined,
  op: NumericOp,
  threshold: number,
  requiredDays: number
): boolean {
  if (typeof rawJson !== 'string' || !rawJson.trim()) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false

  for (const entries of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue

    const byDayMs = new Map<number, number>()
    for (const item of entries) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      if (typeof rec.date !== 'string') continue
      const dayMs = parseUtcDayMs(rec.date)
      const val = toFiniteNumber(rec.value as Cell)
      if (dayMs === null || val === null) continue
      byDayMs.set(dayMs, val)
    }

    const sortedDays = Array.from(byDayMs.entries()).sort((a, b) => a[0] - b[0])
    let streak = 0
    let prevDayMs: number | null = null

    for (const [dayMs, val] of sortedDays) {
      if (compareNumeric(val, op, threshold)) {
        if (prevDayMs !== null && dayMs - prevDayMs === DAY_MS) {
          streak += 1
        } else {
          streak = 1
        }
        prevDayMs = dayMs
        if (streak >= requiredDays) return true
      } else {
        streak = 0
        prevDayMs = null
      }
    }
  }
  return false
}

function evaluateCameraBranch(
  farRatioRaw: Cell | undefined,
  frameRainRaw: Cell | undefined,
  cameraState: string | null,
  gaugeState: string | null,
  spec: ValidatedHazeWatchSpec
): boolean {
  if (cameraState !== 'fresh' || gaugeState !== 'fresh') return false
  if (typeof farRatioRaw !== 'string' || !farRatioRaw.trim()) return false
  const rainVal = toFiniteNumber(frameRainRaw)
  if (frameRainRaw === '' || rainVal === null) return false
  if (!compareNumeric(rainVal, spec.gaugeRainOp, spec.gaugeRainThreshold)) return false

  let frames: unknown
  try {
    frames = JSON.parse(farRatioRaw)
  } catch {
    return false
  }
  if (!Array.isArray(frames) || frames.length !== 3) return false

  for (const frame of frames) {
    if (typeof frame !== 'object' || frame === null) return false
    const val = toFiniteNumber((frame as Record<string, unknown>).value as Cell)
    if (val === null || !compareNumeric(val, spec.cameraRatioOp, spec.cameraRatioThreshold)) {
      return false
    }
  }
  return true
}

function getIndicatorEvidence(
  snapshot: SkySnapshotFacts,
  scope: string,
  name: string,
  nowRow: Row<'now'> | undefined,
  fallbackInput: ResolvedInputState
): IndicatorEvidence {
  const fromScope = snapshot.evidenceByScope[scope]?.[name] ?? snapshot.evidenceByScope.site?.[name]
  if (fromScope) return fromScope
  const rawVal = (nowRow as Record<string, Cell | undefined> | undefined)?.[name] ?? ''
  return {
    scope,
    name,
    value: rawVal,
    unit: '',
    state: fallbackInput.state,
    stateSince: fallbackInput.stateSince,
    ageMin: fallbackInput.ageMin,
    sourceIds: fallbackInput.sourceIds,
    readingIds: fallbackInput.readingIds,
    observedAt: fallbackInput.observedAt
  }
}

function resolveWindowSpan(
  scope: string,
  nowRow: Row<'now'> | undefined,
  windows: readonly Row<'windows'>[],
  evalDate: string
): { spanFromIso: string | null; spanToIso: string | null; spanFromMs: number | null; spanToMs: number | null } {
  const directFrom = normalizeIsoCell(nowRow?.span_from)
  const directTo = normalizeIsoCell(nowRow?.span_to)
  if (directFrom && directTo) {
    return {
      spanFromIso: directFrom,
      spanToIso: directTo,
      spanFromMs: Date.parse(directFrom),
      spanToMs: Date.parse(directTo)
    }
  }

  const win = windows.find((w) => String(w.window_id ?? '').trim() === scope)
  if (!win) {
    return { spanFromIso: null, spanToIso: null, spanFromMs: null, spanToMs: null }
  }
  const rawDate = String(win.date ?? '').trim() || evalDate
  const endRaw = win.end_myt
  let endMs: number | null = null
  const directEnd = normalizeIsoCell(endRaw)
  if (directEnd) {
    endMs = Date.parse(directEnd)
  } else if (typeof endRaw === 'string') {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(endRaw.trim())
    if (m) {
      const parsed = Date.parse(`${rawDate}T${m[1]}:${m[2]}:${m[3] ?? '00'}+08:00`)
      if (Number.isFinite(parsed)) endMs = parsed
    }
  }
  if (endMs === null) {
    return { spanFromIso: null, spanToIso: null, spanFromMs: null, spanToMs: null }
  }
  const spanFromMs = endMs - 30 * MINUTE_MS
  const spanToMs = endMs + 60 * MINUTE_MS
  return {
    spanFromIso: toMytIso(new Date(spanFromMs)),
    spanToIso: toMytIso(new Date(spanToMs)),
    spanFromMs,
    spanToMs
  }
}

export function evaluateSkyClauses(input: SkyClauseInput): SkyVerdict[] {
  const tEvalIso = normalizeIsoCell(input.tEval)
  if (!tEvalIso) {
    throw new Error(`Invalid tEval timestamp: ${String(input.tEval)}`)
  }
  const tEvalMs = Date.parse(tEvalIso)
  const evalDate = tEvalIso.slice(0, 10)
  const clauseVersion = input.clauseVersion ?? null
  const windows = input.windows ?? []

  const skyRows = skyClauseRows(input.clauses)
  const parsedRows = skyRows.map(parseAndValidateClauseRow)

  const nowRows: Row<'now'>[] =
    input.snapshot.nowRows.length > 0
      ? input.snapshot.nowRows
      : [{ snapshot_id: tEvalIso, scope: 'site', span_from: '', span_to: '' }]

  return nowRows.map((nowRow) => {
    const scope = String(nowRow.scope ?? 'site').trim() || 'site'
    const isSite = scope === 'site'
    const snapshotId = normalizeIsoCell(nowRow.snapshot_id) ?? tEvalIso
    const spanInfo = isSite
      ? { spanFromIso: null, spanToIso: null, spanFromMs: null, spanToMs: null }
      : resolveWindowSpan(scope, nowRow, windows, evalDate)
    const isWindowSpanOpen =
      !isSite &&
      spanInfo.spanFromMs !== null &&
      spanInfo.spanToMs !== null &&
      tEvalMs >= spanInfo.spanFromMs &&
      tEvalMs <= spanInfo.spanToMs

    const clauseResults = {} as Record<SkyClauseKey, SkyClauseResult>
    for (const key of SKY_CLAUSE_KEYS) {
      const defaultRow = DEFAULT_SKY_CLAUSE_ROWS.find((r) => r.key === key)!
      clauseResults[key] = {
        key,
        status: 'not',
        proposes: (defaultRow.proposes_key as SkyClauseProposal) ?? null,
        rank: typeof defaultRow.rank === 'number' ? defaultRow.rank : null,
        blockedInput: null,
        stateSince: null,
        reason: null,
        wordingEn: String(defaultRow.wording_en ?? ''),
        evidence: []
      }
    }

    const extraBlockedClauses: Array<{ key: string; rank: number; stateSince: string }> = []

    for (const parsed of parsedRows) {
      if (!parsed.enabled) {
        if (parsed.knownKey) {
          clauseResults[parsed.knownKey] = {
            key: parsed.knownKey,
            status: 'not',
            proposes: parsed.proposes,
            rank: parsed.rank,
            blockedInput: null,
            stateSince: null,
            reason: 'disabled',
            wordingEn: parsed.wordingEn,
            evidence: []
          }
        }
        continue
      }

      if (parsed.knownKey === 'silent_input') {
        clauseResults.silent_input.wordingEn = parsed.wordingEn
        continue
      }

      if (!parsed.knownKey) {
        extraBlockedClauses.push({
          key: parsed.key,
          rank: parsed.effectiveBlockRank,
          stateSince: tEvalIso
        })
        continue
      }

      if (parsed.isWindowScoped && (isSite || !isWindowSpanOpen)) {
        clauseResults[parsed.knownKey] = {
          key: parsed.knownKey,
          status: 'not',
          proposes: parsed.proposes,
          rank: parsed.rank,
          blockedInput: null,
          stateSince: null,
          reason: isSite ? 'window_clause_on_site' : 'span_not_open',
          wordingEn: parsed.wordingEn,
          evidence: []
        }
        continue
      }

      if (!parsed.spec || parsed.errorReason) {
        clauseResults[parsed.knownKey] = {
          key: parsed.knownKey,
          status: 'blocked:clauses',
          proposes: parsed.proposes,
          rank: parsed.effectiveBlockRank,
          blockedInput: 'clauses',
          stateSince: tEvalIso,
          reason: parsed.errorReason ?? 'Malformed clause row',
          wordingEn: parsed.wordingEn,
          evidence: []
        }
        continue
      }

      const spec = parsed.spec
      if (spec.kind === 'haze_watch') {
        const apimsInput = input.snapshot.inputs.apims
        const cameraInput = input.snapshot.inputs.camera
        const gaugeInput = input.snapshot.inputs.gauge
        const apiMaxEv = getIndicatorEvidence(input.snapshot, scope, 'site.api_max', nowRow, apimsInput)
        const farRatioEv = getIndicatorEvidence(
          input.snapshot,
          scope,
          'site.camera_far_ratio_last3',
          nowRow,
          cameraInput
        )
        const frameRainEv = getIndicatorEvidence(
          input.snapshot,
          scope,
          'site.gauge_rain_last3frames_mm',
          nowRow,
          gaugeInput
        )

        if (apimsInput.state !== 'fresh') {
          clauseResults.haze_watch = {
            key: 'haze_watch',
            status: 'blocked:apims',
            proposes: parsed.proposes,
            rank: parsed.rank,
            blockedInput: 'apims',
            stateSince: apimsInput.stateSince ?? tEvalIso,
            reason: `apims_${String(apimsInput.state ?? 'missing')}`,
            wordingEn: parsed.wordingEn,
            evidence: [apiMaxEv]
          }
          continue
        }

        const apiVal = toFiniteNumber(apiMaxEv.value)
        const apiFired = apiVal !== null && compareNumeric(apiVal, spec.apiMaxOp, spec.apiMaxThreshold)
        const cameraFired = evaluateCameraBranch(
          farRatioEv.value,
          frameRainEv.value,
          cameraInput.state,
          gaugeInput.state,
          spec
        )
        const fired = spec.join === 'and' ? apiFired && cameraFired : apiFired || cameraFired
        const evidence = cameraFired ? [apiMaxEv, farRatioEv, frameRainEv] : [apiMaxEv]

        clauseResults.haze_watch = {
          key: 'haze_watch',
          status: fired ? 'fired' : 'not',
          proposes: parsed.proposes,
          rank: parsed.rank,
          blockedInput: null,
          stateSince: null,
          reason: fired ? (apiFired ? 'api_max' : 'camera_far_ratio') : null,
          wordingEn: parsed.wordingEn,
          evidence
        }
        continue
      }

      if (spec.kind === 'haze_severe') {
        const apimsInput = input.snapshot.inputs.apims
        const apiMaxEv = getIndicatorEvidence(input.snapshot, scope, 'site.api_max', nowRow, apimsInput)
        const api0600Ev = getIndicatorEvidence(input.snapshot, scope, 'site.api_0600', nowRow, apimsInput)

        if (apimsInput.state !== 'fresh') {
          clauseResults.haze_severe = {
            key: 'haze_severe',
            status: 'blocked:apims',
            proposes: parsed.proposes,
            rank: parsed.rank,
            blockedInput: 'apims',
            stateSince: apimsInput.stateSince ?? tEvalIso,
            reason: `apims_${String(apimsInput.state ?? 'missing')}`,
            wordingEn: parsed.wordingEn,
            evidence: [apiMaxEv, api0600Ev]
          }
          continue
        }

        const apiVal = toFiniteNumber(apiMaxEv.value)
        const apiMaxFired = apiVal !== null && compareNumeric(apiVal, spec.apiMaxOp, spec.apiMaxThreshold)
        const daysFired = hasConsecutiveDaysMeetingThreshold(
          api0600Ev.value,
          spec.api0600Op,
          spec.api0600Threshold,
          spec.days
        )
        const fired = spec.join === 'and' ? apiMaxFired && daysFired : apiMaxFired || daysFired

        clauseResults.haze_severe = {
          key: 'haze_severe',
          status: fired ? 'fired' : 'not',
          proposes: parsed.proposes,
          rank: parsed.rank,
          blockedInput: null,
          stateSince: null,
          reason: fired ? (apiMaxFired ? 'api_max' : 'api_0600_consecutive_days') : null, // gitleaks:allow -- Public clause predicate identifiers.
          wordingEn: parsed.wordingEn,
          evidence: [apiMaxEv, api0600Ev]
        }
        continue
      }

      if (spec.kind === 'storm_watch') {
        const metInput = input.snapshot.inputs.met
        const warnEv = getIndicatorEvidence(input.snapshot, scope, 'w.met_kl_warning_in_force', nowRow, metInput)

        if (metInput.state !== 'fresh') {
          clauseResults.storm_watch = {
            key: 'storm_watch',
            status: 'blocked:met',
            proposes: parsed.proposes,
            rank: null,
            blockedInput: 'met',
            stateSince: metInput.stateSince ?? tEvalIso,
            reason: `met_${String(metInput.state ?? 'missing')}`,
            wordingEn: parsed.wordingEn,
            evidence: [warnEv]
          }
          continue
        }

        const actualBool =
          warnEv.value === true || (typeof warnEv.value === 'string' && warnEv.value.trim().toLowerCase() === 'true')
        const fired = warnEv.value !== '' && actualBool === spec.expectedBool

        clauseResults.storm_watch = {
          key: 'storm_watch',
          status: fired ? 'fired' : 'not',
          proposes: parsed.proposes,
          rank: null,
          blockedInput: null,
          stateSince: null,
          reason: fired ? 'warning_in_force' : null,
          wordingEn: parsed.wordingEn,
          evidence: [warnEv]
        }
        continue
      }

      const gaugeInput = input.snapshot.inputs.gauge
      const rainEv = getIndicatorEvidence(input.snapshot, scope, spec.metric, nowRow, gaugeInput)

      if (gaugeInput.state !== 'fresh') {
        clauseResults[spec.kind] = {
          key: spec.kind,
          status: 'blocked:gauge',
          proposes: parsed.proposes,
          rank: parsed.rank,
          blockedInput: 'gauge',
          stateSince: gaugeInput.stateSince ?? tEvalIso,
          reason: `gauge_${String(gaugeInput.state ?? 'missing')}`,
          wordingEn: parsed.wordingEn,
          evidence: [rainEv]
        }
        continue
      }

      const obsMs = rainEv.observedAt ? Date.parse(rainEv.observedAt) : null
      const obsOutsideOpenSpan =
        obsMs !== null &&
        Number.isFinite(obsMs) &&
        spanInfo.spanFromMs !== null &&
        spanInfo.spanToMs !== null &&
        (obsMs < spanInfo.spanFromMs || obsMs > spanInfo.spanToMs)
      const rainVal = rainEv.value === '' || obsOutsideOpenSpan ? null : toFiniteNumber(rainEv.value)
      const fired = rainVal !== null && compareNumeric(rainVal, spec.op, spec.threshold)

      clauseResults[spec.kind] = {
        key: spec.kind,
        status: fired ? 'fired' : 'not',
        proposes: parsed.proposes,
        rank: parsed.rank,
        blockedInput: null,
        stateSince: null,
        reason: fired ? spec.metric : rainVal === null ? 'no_observation_in_span' : null,
        wordingEn: parsed.wordingEn,
        evidence: [rainEv]
      }
    }

    const operationalKeys = ['haze_watch', 'haze_severe', 'storm_watch', 'storm_confirmed', 'flash_flood_risk'] as const
    const firedClauses: SkyClauseKey[] = []
    const blockedClauses: SkyClauseKey[] = []
    const blockedDetailsByInput = new Map<string, SkyBlockedInputDetail>()

    let maxFiredRank = 0
    let maxBlockedRank = 0

    for (const key of operationalKeys) {
      const res = clauseResults[key]
      if (res.status === 'fired') {
        firedClauses.push(key)
        if (typeof res.rank === 'number' && res.rank > maxFiredRank) {
          maxFiredRank = res.rank
        }
      } else if (res.status.startsWith('blocked:')) {
        blockedClauses.push(key)
        if (typeof res.rank === 'number' && res.rank > maxBlockedRank) {
          maxBlockedRank = res.rank
        }
        const blockedInput = res.blockedInput ?? res.status.slice('blocked:'.length)
        const existing = blockedDetailsByInput.get(blockedInput)
        if (existing) {
          existing.clauses.push(key)
        } else {
          const inputState =
            blockedInput === 'apims'
              ? input.snapshot.inputs.apims.state
              : blockedInput === 'gauge'
                ? input.snapshot.inputs.gauge.state
                : blockedInput === 'met'
                  ? input.snapshot.inputs.met.state
                  : 'malformed'
          blockedDetailsByInput.set(blockedInput, {
            input: blockedInput,
            state: inputState,
            stateSince: res.stateSince,
            clauses: [key]
          })
        }
      }
    }

    for (const extra of extraBlockedClauses) {
      if (extra.rank > maxBlockedRank) {
        maxBlockedRank = extra.rank
      }
      const existing = blockedDetailsByInput.get('clauses')
      if (existing) {
        existing.clauses.push(extra.key)
      } else {
        blockedDetailsByInput.set('clauses', {
          input: 'clauses',
          state: 'malformed',
          stateSince: extra.stateSince,
          clauses: [extra.key]
        })
      }
    }

    const silentRow = parsedRows.find((r) => r.knownKey === 'silent_input')
    const silentEnabled = silentRow ? silentRow.enabled : true
    const anyBlocked = blockedClauses.length > 0 || extraBlockedClauses.length > 0
    clauseResults.silent_input = {
      ...clauseResults.silent_input,
      status: silentEnabled && anyBlocked ? 'fired' : 'not',
      reason: silentEnabled && anyBlocked ? 'blocked_input_present' : null
    }

    const watch = clauseResults.storm_watch.status === 'fired'
    const mode: SkyMode = RANK_TO_MODE[maxFiredRank] ?? 'normal'
    const verdict: SkyVerdictValue = maxBlockedRank > maxFiredRank ? 'no_call' : mode
    const blockedDetails = Array.from(blockedDetailsByInput.values())
    const blockedInputs = blockedDetails.map((d) => d.input)

    const shadowRow: Row<'shadow'> = {
      scope,
      haze_watch: clauseResults.haze_watch.status,
      haze_severe: clauseResults.haze_severe.status,
      storm_watch: clauseResults.storm_watch.status,
      storm_confirmed: clauseResults.storm_confirmed.status,
      flash_flood_risk: clauseResults.flash_flood_risk.status,
      silent_input: clauseResults.silent_input.status,
      watch,
      mode,
      verdict,
      blocked_inputs: JSON.stringify(blockedInputs),
      snapshot_id: snapshotId
    }

    return {
      scope,
      snapshotId,
      clauseVersion,
      spanFrom: spanInfo.spanFromIso,
      spanTo: spanInfo.spanToIso,
      watch,
      mode,
      verdict,
      clauses: clauseResults,
      firedClauses,
      blockedClauses,
      blockedInputs,
      blockedDetails,
      shadowRow
    }
  })
}

function skyClauseRows(clauses: readonly Row<'clauses'>[]): Row<'clauses'>[] {
  return clauses.filter((row) => {
    const pack = String(row.pack ?? 'sky')
      .trim()
      .toLowerCase()
    return !pack || pack === 'sky'
  })
}

export function skyClauseEvidenceRequirements(clauses: readonly Row<'clauses'>[]): {
  apims: boolean
  morningDays: number
  camera: boolean
  problems: string[]
} {
  let apims = false
  let camera = false
  let morningDays = 0
  const problems: string[] = []
  for (const row of skyClauseRows(clauses)) {
    const parsed = parseAndValidateClauseRow(row)
    if (!parsed.enabled) continue
    if (parsed.errorReason || (!parsed.spec && parsed.knownKey !== 'silent_input')) {
      problems.push(`clauses:${parsed.key}:${parsed.errorReason ?? 'Unsupported clause'}`)
      continue
    }
    if (parsed.spec?.kind === 'haze_watch') {
      apims = true
      camera = true
    }
    if (parsed.spec?.kind === 'haze_severe') {
      apims = true
      // site.api_0600 has a fixed three-morning horizon; days controls the streak predicate.
      morningDays = 3
    }
  }
  return { apims, camera, morningDays, problems }
}
