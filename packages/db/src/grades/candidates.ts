import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, lt, lte, ne, notExists, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import {
  bundle,
  call,
  clauseSheet,
  crossing,
  forecast,
  grade,
  listing,
  night,
  project,
  projectSource,
  run,
  shadowState,
  sheetVersion,
  source,
  sourceState,
  window
} from '../schema'

// #161 c-grades: what the graders read. Each takes the caller's `withTenant` transaction unless it says otherwise.

/** `now` as a date in the project's zone (#79 conventions). */
export const projectDateAt = (now: Date) =>
  sql<string>`(${now.toISOString()}::timestamptz AT TIME ZONE ${project.timeZone})::date::text`

/** Every project, across organisations (`withSystem` sees `project`), with its local date at `now`. */
export function gradingProjects(tx: Tx<SystemPrincipal>, now: Date) {
  return tx
    .select({
      orgId: project.orgId,
      projectId: project.id,
      timeZone: project.timeZone,
      today: projectDateAt(now)
    })
    .from(project)
    .orderBy(asc(project.id))
}

/** The project's live version of `pack`'s sheet, if it has one. */
export async function liveSheet(tx: Tx, projectId: string, pack: 'sky' | 'crowd') {
  const [row] = await tx
    .select({ versionId: sheetVersion.id, content: sheetVersion.content })
    .from(clauseSheet)
    .innerJoin(sheetVersion, eq(sheetVersion.id, clauseSheet.liveVersionId))
    .where(and(eq(clauseSheet.projectId, projectId), eq(clauseSheet.pack, pack)))
  return row ?? null
}

/** A sheet version's content (the pinned version a grade evaluates). */
export async function sheetVersionContent(tx: Tx, versionId: string) {
  const [row] = await tx
    .select({ content: sheetVersion.content })
    .from(sheetVersion)
    .where(eq(sheetVersion.id, versionId))
  if (!row) throw new Error(`no sheet version ${versionId} in this organisation`)
  return row.content
}

/**
 * The project's uncancelled windows that ended in `(endedAfter, endedBy]`, each with its Sky calls that weren't
 * superseded (the bundle's `draft_only` and state, the run's pinned version), whether its shadow verdict ever went above
 * Normal (a window-scope crossing, or the current shadow state), the shadow's version, and what is already graded.
 */
export async function skyCandidates(
  tx: Tx,
  q: { projectId: string; timeZone: string; endedAfter: Date; endedBy: Date }
) {
  const windows = await tx
    .select({
      id: window.id,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      kind: window.kind,
      tz: window.tz,
      guest: window.guest,
      // The window's start as a date in the project's zone (#79 conventions).
      localDate: sql<string>`(${window.startsAt} AT TIME ZONE ${q.timeZone})::date::text`
    })
    .from(window)
    .where(
      and(
        eq(window.projectId, q.projectId),
        isNull(window.cancelledAt),
        gt(window.endsAt, q.endedAfter),
        lte(window.endsAt, q.endedBy)
      )
    )
    .orderBy(asc(window.endsAt), asc(window.id))
  if (!windows.length) return []
  const ids = windows.map((w) => w.id)
  const scoped = (table: typeof crossing | typeof shadowState) =>
    and(
      eq(table.projectId, q.projectId),
      eq(table.pack, 'sky'),
      eq(table.scopeKind, 'window'),
      inArray(table.scopeId, ids)
    )
  const [calls, fired, shadows, graded] = await Promise.all([
    tx
      .select({
        id: call.id,
        windowId: call.windowId,
        mode: call.mode,
        watch: call.watch,
        noCall: call.noCall,
        fired: call.fired,
        shadow: call.shadow,
        agrees: call.agrees,
        state: call.state,
        approvedAt: call.approvedAt,
        draftOnly: bundle.draftOnly,
        bundleState: bundle.state,
        sheetVersionId: run.sheetVersionId
      })
      .from(call)
      .innerJoin(bundle, eq(bundle.id, call.bundleId))
      .innerJoin(run, eq(run.id, bundle.runId))
      .where(and(inArray(call.windowId, ids), eq(bundle.pack, 'sky'), ne(call.state, 'superseded')))
      .orderBy(asc(call.draftedAt), asc(call.id)),
    tx
      .selectDistinct({ windowId: crossing.scopeId })
      .from(crossing)
      .where(and(scoped(crossing), isNotNull(crossing.to), ne(crossing.to, 'normal'))),
    tx
      .select({ windowId: shadowState.scopeId, verdict: shadowState.verdict, versionId: shadowState.sheetVersionId })
      .from(shadowState)
      .where(scoped(shadowState)),
    tx.select({ windowId: grade.windowId, callId: grade.callId }).from(grade).where(inArray(grade.windowId, ids))
  ])
  return windows.map((w) => {
    const shadow = shadows.find((s) => s.windowId === w.id)
    const shadowMode = (shadow?.verdict as { mode?: unknown } | null)?.mode
    return {
      ...w,
      calls: calls.filter((c) => c.windowId === w.id),
      shadowFired:
        fired.some((f) => f.windowId === w.id) || (typeof shadowMode === 'string' && shadowMode !== 'normal'),
      shadowVersionId: shadow?.versionId ?? null,
      gradedCallIds: graded.flatMap((g) => (g.windowId === w.id && g.callId ? [g.callId] : [])),
      windowGraded: graded.some((g) => g.windowId === w.id && g.callId === null)
    }
  })
}

export type SkyCandidate = Awaited<ReturnType<typeof skyCandidates>>[number]

/**
 * The project's ungraded nights before `before` with a live (not historical) `listed` listing, each with the forecast
 * graded against: its newest `forecast` row created before the night's arrival start.
 */
export async function crowdNights(tx: Tx, q: { projectId: string; before: string }) {
  const nights = await tx
    .select({ id: night.id, date: night.date, arrivalStart: night.arrivalStart })
    .from(night)
    .where(
      and(
        eq(night.projectId, q.projectId),
        lt(night.date, q.before),
        ne(night.state, 'unlisted'),
        exists(
          tx
            .select({ id: listing.id })
            .from(listing)
            .where(and(eq(listing.nightId, night.id), eq(listing.state, 'listed'), eq(listing.historical, false)))
        ),
        notExists(tx.select({ id: grade.id }).from(grade).where(eq(grade.nightId, night.id)))
      )
    )
    .orderBy(asc(night.date), asc(night.id))
  if (!nights.length) return []
  const forecasts = await tx
    .select()
    .from(forecast)
    .where(
      inArray(
        forecast.nightId,
        nights.map((n) => n.id)
      )
    )
    .orderBy(desc(forecast.createdAt), desc(forecast.id))
  return nights.map((n) => ({
    ...n,
    forecast:
      forecasts.find((f) => f.nightId === n.id && n.arrivalStart !== null && f.createdAt < n.arrivalStart) ?? null
  }))
}

/**
 * The dates in `[from, to]` that no listed night and no unlisted night already covers, each with the instant it starts
 * in the project's zone.
 */
export async function unlistedDates(tx: Tx, q: { projectId: string; timeZone: string; from: string; to: string }) {
  const { rows } = await tx.execute<{ date: string; starts_at: string }>(sql`
    SELECT d::date::text AS date, (d AT TIME ZONE ${q.timeZone})::text AS starts_at
    FROM generate_series(${q.from}::date::timestamp, ${q.to}::date::timestamp, interval '1 day') AS d
    WHERE NOT EXISTS (
      SELECT FROM night n WHERE n.project_id = ${q.projectId} AND n.date = d::date
        AND (n.state = 'unlisted' OR EXISTS (SELECT FROM listing l WHERE l.night_id = n.id AND l.state = 'listed')))
    ORDER BY d`)
  return rows.map((row) => ({ date: row.date, startsAt: new Date(row.starts_at) }))
}

/** The project's bound `rail_station` (its station ID is the source's `external_id`) and the file's next update. */
export async function railStation(tx: Tx, projectId: string) {
  const [row] = await tx
    .select({ sourceId: source.id, stationId: source.externalId, pendingUntil: sourceState.pendingUntil })
    .from(projectSource)
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .leftJoin(sourceState, eq(sourceState.sourceId, source.id))
    .where(and(eq(projectSource.projectId, projectId), eq(projectSource.role, 'rail_station')))
    .orderBy(asc(projectSource.createdAt))
    .limit(1)
  return row ?? null
}
