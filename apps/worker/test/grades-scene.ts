// #161 c-grades test scenes: real rows on the #79 §7 test database through the db factories, and doubles of the
// engine's §1 contracts (#131's snapshotAt, check and evaluate, #133's history, #127's ForecastSource).
import { randomUUID } from 'node:crypto'
import type { Clause, ReadingHistory, SheetInput, SkyMode, Verdict } from '@skyclause/clauses'
import { clauseSheet, featureFlag, source, sourceState, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeClauseSheet,
  makeCrossing,
  makeFeatureFlag,
  makeForecast,
  makeIndicatorSnapshot,
  makeListing,
  makeNight,
  makeProject,
  makeProjectSource,
  makeRun,
  makeSheetVersion,
  makeSource,
  makeSourceState,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import { and, eq } from 'drizzle-orm'
import type { GradeEngine } from '../src/grades/engine'

export const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: memberOf(orgId) }, fn)

/** An MYT wall-clock time as an instant: `myt('2026-11-09 23:55')`. */
export const myt = (local: string) => new Date(`${local.replace(' ', 'T')}:00+08:00`)

/** Storm confirmed's span (TRD: 30 minutes before to 60 minutes after the end), the shape the grader reads. */
export const STORM_CONFIRMED: Clause = {
  key: 'storm_confirmed',
  name: 'Storm confirmed',
  enabled: true,
  scope: 'window',
  requires: ['w.rain_max_60m_mm'],
  span: { from: 'end-30m', to: 'end+60m' },
  when: 'w.rain_max_60m_mm >= 30.0',
  expiry: 'end',
  proposes: { mode: 'commute_disruption' },
  wording: { en: 'Storm confirmed' }
}

/** A published sheet version holding `clauses`, made live when `live`. */
export async function publishSheet(
  tx: Tx,
  projectId: string,
  pack: 'sky' | 'crowd',
  clauses: Clause[],
  o: { live?: boolean; n?: number } = {}
) {
  const [found] = await tx
    .select({ id: clauseSheet.id })
    .from(clauseSheet)
    .where(and(eq(clauseSheet.projectId, projectId), eq(clauseSheet.pack, pack)))
  const sheetId = found?.id ?? (await makeClauseSheet(tx, { projectId, pack })).id
  const content: SheetInput = { pack, clauses }
  const version = await makeSheetVersion(tx, { sheetId, n: o.n ?? 1, status: 'published', content })
  if (o.live ?? true) await tx.update(clauseSheet).set({ liveVersionId: version.id }).where(eq(clauseSheet.id, sheetId))
  return version.id
}

/** A Sky project with a live sheet holding Storm confirmed. */
export async function skyProject(tx: Tx) {
  const project = await makeProject(tx)
  const versionId = await publishSheet(tx, project.id, 'sky', [STORM_CONFIRMED])
  return { projectId: project.id, versionId }
}

/** A window from `start` to `end` (MYT). */
export const windowAt = (tx: Tx, projectId: string, start: string, end: string, extra: { guest?: boolean } = {}) =>
  makeWindow(tx, { projectId, startsAt: myt(start), endsAt: myt(end), ...extra })

type CallSpec = {
  windowId: string
  mode: SkyMode | null
  state?: 'drafted' | 'approved' | 'rejected' | 'expired' | 'sent' | 'superseded'
  noCall?: unknown
  fired?: unknown
  shadow?: unknown
  agrees?: boolean
}

/** One Sky bundle of `calls` from a run pinned to `versionId`; approved calls carry `approved_at`. */
export async function skyBundle(
  tx: Tx,
  projectId: string,
  versionId: string,
  calls: CallSpec[],
  o: { state?: 'approved' | 'closed' | 'expired'; draftOnly?: boolean } = {}
) {
  const run = await makeRun(tx, { projectId, sheetVersionId: versionId, status: 'drafted' })
  const bundle = await makeBundle(tx, { runId: run.id, state: o.state ?? 'approved', draftOnly: o.draftOnly ?? false })
  const made = []
  for (const spec of calls) {
    const state = spec.state ?? 'approved'
    made.push(
      await makeCall(tx, {
        bundleId: bundle.id,
        windowId: spec.windowId,
        mode: spec.mode,
        state,
        noCall: spec.noCall ?? null,
        fired: spec.fired ?? [],
        shadow: spec.shadow ?? {},
        agrees: spec.agrees ?? true,
        approvedAt: ['approved', 'sent'].includes(state) ? new Date('2026-11-09T05:00:00Z') : null
      })
    )
  }
  return made
}

/** The shadow verdict of `windowId` crossed to `to` (a fired shadow verdict, ANL-2). */
export async function shadowCrossed(tx: Tx, projectId: string, windowId: string, to = 'commute_disruption') {
  const snapshot = await makeIndicatorSnapshot(tx, { projectId })
  return makeCrossing(tx, { snapshotId: snapshot.id, scopeKind: 'window', scopeId: windowId, from: 'normal', to })
}

/** Rows of `table` for `projectId`, read as the superuser. */
export const rowsOf = (table: string, projectId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE project_id = $1 ORDER BY id`,
      [projectId]
    )
    return rows
  })

/** Each grade's local date as stored (`YYYY-MM-DD`), oldest grade first. */
export const localDatesOf = (projectId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ local_date: string }>(
      'SELECT local_date::text FROM grade WHERE project_id = $1 ORDER BY id',
      [projectId]
    )
    return rows.map((row) => row.local_date)
  })

/** Review items of `projectId`'s grades, read as the superuser. */
export const reviewItemsOf = (projectId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT r.* FROM review_item r JOIN grade g ON g.id = r.grade_id WHERE g.project_id = $1 ORDER BY r.id`,
      [projectId]
    )
    return rows
  })

/** A source of each kind TRD grading reads, and some it doesn't, as #133's history would hand them over. */
export const HISTORY_SOURCES: ReadingHistory['sources'] = [
  { kind: 'jps_rain', probation: false },
  { kind: 'apims', probation: false },
  { kind: 'met_warning', probation: false },
  { kind: 'met_forecast', probation: false },
  { kind: 'camera', probation: true },
  { kind: 'pi', probation: false }
].map(({ kind, probation }) => ({
  id: randomUUID(),
  kind: kind as ReadingHistory['sources'][number]['kind'],
  cadenceS: 300,
  staleAfterS: 1800,
  freshness: 'observed' as const,
  probation,
  meta: {}
}))

const historyOf = (sources: ReadingHistory['sources']): ReadingHistory => ({
  sources,
  polls: sources.map((source) => ({
    id: randomUUID(),
    sourceId: source.id,
    startedAt: '2026-11-09T10:00:00Z',
    outcome: 'ok' as const,
    httpStatus: 200
  })),
  readings: sources.map((source) => ({
    id: randomUUID(),
    sourceId: source.id,
    metric: 'value',
    observedAt: '2026-11-09T10:00:00Z',
    receivedAt: '2026-11-09T10:05:00Z',
    value: 1,
    valueText: null,
    valueJson: null,
    itemKey: '',
    revision: 1
  }))
})

/** A window verdict as #131's evaluate returns it: `mode`, or No call (null) on a stale required input. */
export function verdictFor(windowId: string, mode: SkyMode | null, readingIds: string[] = []): Verdict {
  return {
    scope: { kind: 'window', id: windowId },
    pack: 'sky',
    mode,
    watch: false,
    noCall:
      mode === null
        ? { inputs: [{ name: 'w.rain_max_60m_mm', sourceId: null, state: 'stale', since: '2026-11-09T10:00:00Z' }] }
        : null,
    recommendations: [],
    clauses: [
      {
        key: 'storm_confirmed',
        result: mode === null ? 'blocked' : mode === 'normal' ? 'not_fired' : 'fired',
        blockedBy: [],
        inputs: [
          {
            name: 'w.rain_max_60m_mm',
            value: 1,
            unit: 'mm',
            state: 'fresh',
            since: null,
            ageS: 0,
            sourceIds: [],
            readingIds,
            observedAt: null
          }
        ]
      }
    ],
    openFrom: null
  }
}

/**
 * Doubles of the engine's contracts. `observed` gives each window's verdict mode (Normal when unlisted); every call is
 * recorded so a test can see which sheet, history and evaluation time the grader used.
 */
export function skyEngine(observed: Map<string, SkyMode | null>, readingIds: Map<string, string[]> = new Map()) {
  const seen = {
    checked: [] as SheetInput[],
    histories: [] as Array<{ projectId: string; from: string; to: string; kept: string[] }>,
    evaluatedAt: [] as Array<{ windowId: string; tEval: string }>
  }
  let lastHistory: { projectId: string; from: string; to: string } | null = null
  const engine: GradeEngine = {
    registry: [],
    history: async (_tx, q) => {
      lastHistory = { projectId: q.projectId, from: q.from, to: q.to }
      return historyOf(HISTORY_SOURCES)
    },
    snapshotAt: (h, _r, projectId, pack, tEval) => {
      seen.histories.push({ ...lastHistory!, kept: h.sources.map((source) => source.kind) })
      return { projectId, pack, tEval, inputs: [], site: {}, series: {}, nights: [], registryHash: 'r', hash: 's' }
    },
    check: (sheet) => {
      seen.checked.push(sheet)
      return { ok: true, publishable: true, issues: [], sheet: { ...sheet, contentHash: 'c', registryHash: 'r' } }
    },
    evaluate: (_sheet, _snapshot, windows, tEval) => {
      for (const w of windows) seen.evaluatedAt.push({ windowId: w.id, tEval })
      return {
        tEval,
        pack: 'sky',
        contentHash: 'c',
        snapshotHash: 's',
        site: [],
        windows: windows.map((w) =>
          verdictFor(w.id, observed.has(w.id) ? observed.get(w.id)! : 'normal', readingIds.get(w.id))
        ),
        nights: [],
        hash: 'v'
      }
    },
    forecast: null
  }
  return { engine, seen }
}

/** The Crowd surge clause as the grader reads it: fires when the night's figure beats its baseline by `uplift`. */
export const SURGE_NIGHT: Clause = {
  key: 'surge_night',
  name: 'Surge night',
  enabled: true,
  scope: 'night',
  requires: ['site.night.forecast', 'site.night.baseline'],
  when: 'site.night.forecast - site.night.baseline >= 10000.0',
  proposes: { mode: 'surge_night' },
  wording: { en: 'Surge night' }
}

/**
 * A Crowd project of an organisation with `pack_crowd` on (unless `crowdOn` is false): a live sheet with Surge
 * night, and SP17 bound as its `rail_station`, whose state says when the next file lands.
 */
export async function crowdProject(orgId: string, o: { crowdOn?: boolean; pendingUntil?: Date | null } = {}) {
  return withTenant({ orgId, principal: systemPrincipal('test-grades') }, async (tx) => {
    if (o.crowdOn ?? true) {
      const [flag] = await tx
        .select()
        .from(featureFlag)
        .where(and(eq(featureFlag.key, 'pack_crowd'), eq(featureFlag.orgId, orgId)))
      if (!flag) await makeFeatureFlag(tx, { key: 'pack_crowd', enabled: true })
    }
    const project = await makeProject(tx)
    const versionId = await publishSheet(tx, project.id, 'crowd', [SURGE_NIGHT])
    // One SP17 source per organisation, bound to each of its Crowd projects.
    const [found] = await tx
      .select({ id: source.id })
      .from(source)
      .where(and(eq(source.ownerOrgId, orgId), eq(source.externalId, 'SP17')))
    const stationId =
      found?.id ?? (await makeSource(tx, { kind: 'rapidrail_od', externalId: 'SP17', name: 'SP17 Bukit Jalil' })).id
    await makeProjectSource(tx, { projectId: project.id, sourceId: stationId, role: 'rail_station' })
    if (found) {
      await tx
        .update(sourceState)
        .set({ pendingUntil: o.pendingUntil ?? null })
        .where(eq(sourceState.sourceId, stationId))
    } else await makeSourceState(tx, { sourceId: stationId, pendingUntil: o.pendingUntil ?? null })
    return { projectId: project.id, versionId }
  })
}

/** A listed night on `date` (arrivals from `arrival`, MYT) with forecasts made at each `forecasts[].at` (MYT). */
export async function listedNight(
  orgId: string,
  projectId: string,
  date: string,
  arrival: string,
  forecasts: Array<{ at: string; forecast: number; low: number; high: number }> = []
) {
  return withTenant({ orgId, principal: systemPrincipal('test-grades') }, async (tx) => {
    const night = await makeNight(tx, { projectId, date, arrivalStart: myt(arrival), state: 'awaiting_actuals' })
    await makeListing(tx, { projectId, nightId: night.id, state: 'listed' })
    const made = []
    for (const f of forecasts) {
      made.push(
        await makeForecast(tx, {
          nightId: night.id,
          forecast: f.forecast,
          bandLow: f.low,
          bandHigh: f.high,
          createdAt: myt(f.at)
        })
      )
    }
    return { nightId: night.id, forecastIds: made.map((f) => f.id) }
  })
}

/**
 * Doubles of #127's ForecastSource and #131's check and evaluate for Crowd. `exits` by date (pending when absent,
 * until `pendingUntil`), `baselines` by date; the evaluator fires `surge_night` on a 10,000-exit uplift.
 */
export function crowdEngine(
  exits: Map<string, number>,
  o: { baselines?: Map<string, number>; pendingUntil?: string } = {}
) {
  const seen = { stations: new Set<string>(), exits: [] as string[], readingIds: new Map<string, string>() }
  const engine: GradeEngine = {
    registry: [],
    history: null,
    forecast: {
      exits: async (_tx, q) => {
        seen.stations.add(q.stationId)
        seen.exits.push(q.date)
        const value = exits.get(q.date)
        if (value === undefined) return { pendingUntil: o.pendingUntil ?? '2026-11-10T14:00:00Z' }
        const readingId = seen.readingIds.get(q.date) ?? randomUUID()
        seen.readingIds.set(q.date, readingId)
        return { value, readingId }
      },
      baseline: async (_tx, q) => {
        const value = o.baselines?.get(q.date)
        return value === undefined ? null : { value, readingIds: [randomUUID()] }
      }
    },
    snapshotAt: () => {
      throw new Error('Crowd grading takes no snapshot of readings')
    },
    check: (sheet) => ({
      ok: true,
      publishable: true,
      issues: [],
      sheet: { ...sheet, contentHash: 'c', registryHash: 'r' }
    }),
    evaluate: (sheet, snapshot, _windows, tEval) => ({
      tEval,
      pack: 'crowd',
      contentHash: 'c',
      snapshotHash: snapshot.hash,
      site: [],
      windows: [],
      nights: snapshot.nights.map((n) => {
        const fired = n.forecast !== null && n.baseline !== null && n.forecast - n.baseline >= 10_000
        return {
          scope: { kind: 'night' as const, id: n.id },
          pack: 'crowd' as const,
          mode: fired ? ('surge_night' as const) : ('normal' as const),
          watch: false,
          noCall: null,
          recommendations: [],
          clauses: sheet.clauses.map((c) => ({
            key: c.key,
            result: fired ? ('fired' as const) : ('not_fired' as const),
            blockedBy: [],
            inputs: []
          })),
          openFrom: null
        }
      }),
      hash: 'v'
    })
  }
  return { engine, seen }
}
