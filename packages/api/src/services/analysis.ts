import type { z } from '@hono/zod-openapi'
import {
  check,
  replay,
  type Check,
  type IndicatorRegistry,
  type IndicatorValue,
  type Instant,
  type ReadingHistory,
  type Replay,
  type ReplayRange,
  type Verdicts
} from '@skyclause/clauses'
import type { Operations, TxHandle } from '@skyclause/contracts'
import {
  analysisGradeRows,
  analysisProjectList,
  analysisRows,
  computeMetrics,
  isFlagEnabled,
  killLine,
  localDateAt,
  noCallRow,
  periodRange,
  pool,
  skillRows,
  sourceUrls,
  whatIfObserved,
  whatIfWindows,
  type AnalysisPack,
  type GradeFact,
  type MetricRow,
  type Period,
  type Tx
} from '@skyclause/db'
import { decodeCursor, page } from '../pagination'
import { ApiError } from '../problems'
import { instant, toWire } from '../serialize'
import type { ServiceContext } from '../tenancy'

// #162 c-analysis-api (#79 §4, `ledger.view`): project analysis, the organisation roll-up and what-if replays. The
// GET routes serve `analysis_metric` as the analysis-materialise job wrote it (NFR-9); a what-if writes nothing.

type Ok<Id extends 'getProjectAnalysis' | 'getOrganisationAnalysis' | 'evaluateWhatIf'> = z.infer<
  Operations[Id]['responses'][200]['content']['application/json']['schema']
>
type Analysis = Ok<'getProjectAnalysis'>
type AnalysisQuery = z.infer<Operations['getProjectAnalysis']['request']['query']>
type WhatIfBody = z.infer<
  NonNullable<Operations['evaluateWhatIf']['request']['body']>['content']['application/json']['schema']
>
type GradeRow = Awaited<ReturnType<typeof analysisGradeRows>>[number]

const DEFAULT_PERIOD: Period = '30d'
/** LOC-6: Skyclause prints MYT. */
const DISPLAY_ZONE = 'Asia/Kuala_Lumpur'
const DAY_MS = 86_400_000
/** Ticket #162: a what-if covers at most 90 days. */
const WHAT_IF_DAYS = 90
/** History before the range: `site.api_0600_min_last3_max` reads three days of APIMS, as the Sky grader loads. */
const HISTORY_BEFORE_MS = 4 * DAY_MS

const feature = () => new ApiError(403, 'feature-off', 'Crowd is off for this organisation.')
const invalid = (place: 'query' | 'body', pointer: string, detail: string) =>
  new ApiError(422, 'validation-failed', detail, { errors: [{ in: place, pointer, detail }] })

/** The period and packs a read covers; `from` and `to` are refused, since figures exist per period only. */
async function scopeOf(tx: Tx, orgId: string, query: AnalysisQuery) {
  for (const key of ['from', 'to'] as const) {
    if (query[key] !== undefined) {
      throw invalid('query', `/${key}`, 'Analysis is materialised per period: pass period=7d|30d|90d|all instead.')
    }
  }
  const crowdOn = await isFlagEnabled(tx, 'pack_crowd', orgId)
  if (query.pack === 'crowd' && !crowdOn) throw feature()
  const packs: AnalysisPack[] = query.pack ? [query.pack] : crowdOn ? ['sky', 'crowd'] : ['sky']
  return { period: query.period ?? DEFAULT_PERIOD, packs }
}

/** One project's figures for a period, or n = 0 everywhere as of its creation when no run has reached it. */
interface ProjectFigures {
  projectId: string
  from: string
  to: string
  computedAt: Date | null
  asOf: Date
  figures: MetricRow[]
  days: Array<MetricRow & { dayStart: Date }>
}

async function figuresOf(tx: Tx, projectIds: string[], period: Period, now: Date): Promise<ProjectFigures[]> {
  if (!projectIds.length) return []
  const projects = await analysisProjectList(tx, { now, projectIds })
  const { figures, days } = await analysisRows(tx, { projectIds, period })
  return projects.map((p) => {
    const own = figures.filter((r) => r.projectId === p.projectId)
    if (!own.length) {
      const range = periodRange(period, p.today, p.createdOn)
      const empty = computeMetrics({ grades: [], delays: [], evidence: [] }, range, [])
      return { projectId: p.projectId, ...range, computedAt: null, asOf: p.createdAt, figures: empty, days: [] }
    }
    return {
      projectId: p.projectId,
      from: own[0]!.rangeFrom,
      to: own[0]!.rangeTo,
      computedAt: own[0]!.computedAt,
      asOf: own[0]!.computedAt,
      figures: own,
      days: days.filter((r) => r.projectId === p.projectId)
    }
  })
}

const wireMetric = (r: MetricRow) => ({
  metric: r.metric,
  x: r.x,
  value: r.value,
  n: r.n,
  low: r.low,
  high: r.high,
  pack: r.pack!,
  clause_key: r.clause
})

const gradeView = (g: GradeRow) => ({
  id: g.id,
  call_id: g.callId,
  night_id: g.nightId,
  outcome: g.outcome,
  sheet_version_id: g.sheetVersionId,
  pack: g.pack,
  window_id: g.windowId,
  proposed_mode: g.proposedMode,
  observed_mode: g.observedMode,
  mode_diff: g.modeDiff,
  no_call: g.noCall,
  agrees: g.agrees,
  stale_inputs: g.staleInputs
})

/**
 * The response over `projects`: one project's stored figures as they are, or several pooled (`pool`); its series by
 * day; the graded table of what the figures counted; and the kill line on the period's agreement.
 */
async function assemble(
  tx: Tx,
  projects: ProjectFigures[],
  q: { period: Period; packs: AnalysisPack[]; query: AnalysisQuery; now: Date }
): Promise<Analysis> {
  const merge = (rows: MetricRow[]) => (projects.length === 1 ? rows : pool(rows))
  const inPacks = (r: MetricRow) => r.pack !== null && q.packs.includes(r.pack)
  // With no project to view there is no project zone, so the dates are MYT's.
  const today = projects.length ? null : await localDateAt(tx, q.now, DISPLAY_ZONE)
  const none = today === null ? null : periodRange(q.period, today, today)
  const rows = none
    ? computeMetrics({ grades: [], delays: [], evidence: [] }, none, [])
    : merge(projects.flatMap((p) => p.figures))
  const byDay = new Map<string, MetricRow[]>()
  for (const day of projects.flatMap((p) => p.days)) {
    const at = instant(day.dayStart)
    byDay.set(at, [...(byDay.get(at) ?? []), day])
  }
  const series = [...byDay.keys()].sort().flatMap((at) => {
    const metrics = merge(byDay.get(at)!).filter(inPacks).map(wireMetric)
    return metrics.length ? [{ at, metrics }] : []
  })
  let before: { localDate: string; id: string } | undefined
  if (q.query.cursor !== undefined) {
    const { d, id } = decodeCursor(q.query.cursor)
    if (typeof d !== 'string' || typeof id !== 'string') throw invalid('query', '/cursor', 'Invalid cursor')
    before = { localDate: d, id }
  }
  const scopes = projects.flatMap((p) =>
    p.computedAt ? [{ projectId: p.projectId, from: p.from, to: p.to, computedBy: p.computedAt }] : []
  )
  const graded = page(
    await analysisGradeRows(tx, { scopes, packs: q.packs, before, limit: q.query.limit + 1 }),
    q.query.limit,
    (g) => ({ d: g.localDate, id: g.id })
  )
  const range = none ?? {
    from: projects.map((p) => p.from).reduce((a, b) => (b < a ? b : a)),
    to: projects.map((p) => p.to).reduce((a, b) => (b > a ? b : a))
  }
  const asOf = none ? q.now : new Date(Math.min(...projects.map((p) => p.asOf.getTime())))
  return {
    ...range,
    updated_at: instant(asOf),
    metrics: rows.filter(inPacks).map(wireMetric),
    series,
    grades: { data: graded.data.map(gradeView), next_cursor: graded.next_cursor },
    kill_line_exceeded: killLine(rows.filter(inPacks)),
    evidence_minutes: rows
      .filter((r) => r.pack === null)
      .map(({ metric, x, value, n, low, high }) => ({ metric, x, value, n, low, high }))
  }
}

/** `GET /v1/projects/{id}/analysis`: the project's figures for the period, as last materialised. */
export async function getProjectAnalysis(
  ctx: ServiceContext,
  q: { projectId: string; orgId: string; query: AnalysisQuery; now: Date }
): Promise<Analysis> {
  const tx = ctx.tx as Tx
  const { period, packs } = await scopeOf(tx, q.orgId, q.query)
  return assemble(tx, await figuresOf(tx, [q.projectId], period, q.now), { period, packs, query: q.query, now: q.now })
}

/**
 * `GET /v1/analysis`: the roll-up over the organisation's projects the principal may view, pooled. "Updated" is the
 * oldest project's last run (or its creation, before any); with no project to view, n = 0 as of the read.
 */
export async function getOrganisationAnalysis(
  ctx: ServiceContext,
  q: { orgId: string; query: AnalysisQuery; now: Date; canView: (projectId: string) => boolean }
): Promise<Ok<'getOrganisationAnalysis'>> {
  const tx = ctx.tx as Tx
  const { period, packs } = await scopeOf(tx, q.orgId, q.query)
  const visible = (await analysisProjectList(tx, { now: q.now })).map((p) => p.projectId).filter(q.canView)
  return assemble(tx, await figuresOf(tx, visible, period, q.now), { period, packs, query: q.query, now: q.now })
}

/**
 * What a what-if replays with: #131's `check`, #136's `replay`, #133's reading history and the indicator registry.
 * The last two have no implementation yet, so they start unset and a composition root sets them; until then the
 * operation answers 501 `not-built`, as it does while `check` or `replay` is still a placeholder.
 */
export interface WhatIfEngine {
  registry: IndicatorRegistry | null
  history: ((tx: TxHandle, q: { projectId: string; from: Instant; to: Instant }) => Promise<ReadingHistory>) | null
  check: Check
  replay: Replay
}

let engine: WhatIfEngine = { registry: null, history: null, check, replay }

export function setWhatIfEngine(parts: Partial<WhatIfEngine>) {
  engine = { ...engine, ...parts }
}

/** Runs `fn`, answering 501 naming the owner when it reaches another ticket's placeholder (packages/clauses' own). */
async function orNotBuilt<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof Error && error.name === 'NotBuiltError' && 'owner' in error) {
      throw new ApiError(501, 'not-built', error.message, { owner: error.owner })
    }
    throw error
  }
}

const RANK: Record<string, number> = {
  normal: 0,
  outdoor_limited: 1,
  commute_disruption: 2,
  hybrid_recommended: 3,
  surge_night: 1
}
const above = (mode: string | null) => mode !== null && mode !== 'normal'

/**
 * A replayed window's grade against its stored observed mode, by the grader's rules, with the replay's highest
 * proposal standing as the call that went out (a replay has no approver). No proposal at any step, or no observation,
 * is No call.
 */
function replayedGrade(pack: AnalysisPack, verdicts: Verdicts['windows'], observed: string | null, localDate: string) {
  const proposals = verdicts.filter((v) => v.noCall === null).map((v) => v.mode ?? 'normal')
  const proposed = proposals.reduce((top, mode) => (RANK[mode]! > RANK[top]! ? mode : top), 'normal')
  const outcome =
    observed === null || !proposals.length
      ? 'no_call'
      : above(proposed)
        ? above(observed)
          ? 'hit'
          : 'false_alarm'
        : above(observed)
          ? 'miss'
          : 'correct_normal'
  const clauses = [...new Set(verdicts.flatMap((v) => v.clauses.filter((c) => c.result === 'fired').map((c) => c.key)))]
  return {
    pack,
    outcome,
    callGrade: true,
    agrees: true,
    staleInputs: false,
    clauses,
    localDate,
    actual: null,
    forecast: null
  } satisfies GradeFact
}

/** Spec §1 verdicts as the wire's: snake_case, whole-second ages, and each input's source URL. */
function wireVerdicts(v: Verdicts, urls: Map<string, string>) {
  const input = (i: IndicatorValue) => ({
    ...i,
    ageS: i.ageS === null ? null : Math.round(i.ageS),
    sourceUrl: i.sourceIds.map((id) => urls.get(id)).find(Boolean) ?? null
  })
  const verdict = (x: Verdicts['site'][number]) => ({
    ...x,
    clauses: x.clauses.map((c) => ({ ...c, inputs: c.inputs.map(input) }))
  })
  return toWire({ ...v, site: v.site.map(verdict), windows: v.windows.map(verdict), nights: v.nights.map(verdict) })
}

/**
 * `POST /v1/projects/{id}/analysis/what-if`: replays `sheet` over the project's recorded readings and windows in
 * `range` (at most 90 days), labelled replay, and scores the replayed window verdicts against the observed modes
 * stored in `grade` with the live formulas (precision, recall, false-alarm ratio, No call; each with n and its
 * interval). Writes nothing (ANL-6).
 */
export async function evaluateWhatIf(
  ctx: ServiceContext,
  q: { projectId: string; orgId: string; body: WhatIfBody }
): Promise<Ok<'evaluateWhatIf'>> {
  const tx = ctx.tx as Tx
  const { sheet, range } = q.body
  const from = new Date(range.from)
  const to = new Date(range.to)
  if (!(from < to)) throw invalid('body', '/range', 'The range must end after it starts.')
  if (to.getTime() - from.getTime() > WHAT_IF_DAYS * DAY_MS) {
    throw invalid('body', '/range', `A what-if covers at most ${WHAT_IF_DAYS} days.`)
  }
  if (sheet.pack === 'crowd' && !(await isFlagEnabled(tx, 'pack_crowd', q.orgId))) throw feature()
  const { registry, history } = engine
  if (!registry || !history) {
    throw new ApiError(
      501,
      'not-built',
      'What-if needs the reading history (#133) and the indicator registry, not yet set by setWhatIfEngine.',
      { owner: 'b-evaluator' }
    )
  }
  const checked = await orNotBuilt(() => engine.check(sheet, registry))
  if (!checked.ok || !checked.sheet) {
    throw new ApiError(422, 'validation-failed', 'The sheet doesn’t check.', {
      errors: checked.issues.map((issue) => ({ in: 'body', pointer: '/sheet', detail: issue.message }))
    })
  }
  const readings = await orNotBuilt(() =>
    history(ctx.tx, {
      projectId: q.projectId,
      from: instant(new Date(from.getTime() - HISTORY_BEFORE_MS)),
      to: instant(to)
    })
  )
  const windows = (await whatIfWindows(tx, { projectId: q.projectId, from, to })).map((w) => ({
    id: w.id,
    startsAt: instant(w.startsAt),
    endsAt: instant(w.endsAt),
    kind: w.kind,
    tz: w.tz
  }))
  const result = await orNotBuilt(() =>
    engine.replay(checked.sheet!, readings, registry, windows, range as ReplayRange)
  )
  const observed = await whatIfObserved(tx, { pack: sheet.pack, windowIds: windows.map((w) => w.id) })
  const grades = observed.flatMap((o) => {
    const verdicts = result.steps.flatMap((s) => s.verdicts.windows.filter((v) => v.scope.id === o.windowId))
    return verdicts.length ? [replayedGrade(sheet.pack, verdicts, o.observedMode, o.localDate)] : []
  })
  const clauses = [...new Set(grades.flatMap((g) => g.clauses))].sort()
  const metrics = [
    ...skillRows(sheet.pack, null, grades),
    noCallRow(sheet.pack, grades),
    ...clauses.flatMap((clause) =>
      skillRows(
        sheet.pack,
        clause,
        grades.filter((g) => g.clauses.includes(clause))
      )
    )
  ].map(wireMetric)
  const urls = await sourceUrls(
    tx,
    result.steps.flatMap((s) =>
      [...s.verdicts.site, ...s.verdicts.windows, ...s.verdicts.nights].flatMap((v) =>
        v.clauses.flatMap((c) => c.inputs.flatMap((i) => i.sourceIds))
      )
    )
  )
  return {
    label: 'replay',
    steps: result.steps.map((s) => ({
      t_eval: s.tEval,
      verdicts: wireVerdicts(s.verdicts, urls) as Ok<'evaluateWhatIf'>['steps'][number]['verdicts']
    })),
    summary: result.summary,
    metrics
  }
}
