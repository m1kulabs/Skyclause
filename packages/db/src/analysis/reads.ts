import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import type { Tx } from '../client'
import { analysisMetric, bundle, call, grade, project, source, window } from '../schema'
import { localDate } from './dates'
import type { Period } from './materialise'

// #162 c-analysis-api: what GET /v1/projects/{id}/analysis, GET /v1/analysis and the what-if read, in the caller's
// `withTenant` transaction. The figures come from `analysis_metric` alone (NFR-9); nothing here computes one.

/** `now` as a date in `timeZone`. */
export async function localDateAt(tx: Tx, now: Date, timeZone: string) {
  const { rows } = await tx.execute<{ today: string }>(
    sql`SELECT (${now.toISOString()}::timestamptz AT TIME ZONE ${timeZone})::date::text AS today`
  )
  return rows[0]!.today
}

/** The organisation's projects (or those of `projectIds`), by ID, with their zone, creation and local date at `now`. */
export function analysisProjectList(tx: Tx, q: { now: Date; projectIds?: string[] }) {
  return tx
    .select({
      projectId: project.id,
      timeZone: project.timeZone,
      createdAt: project.createdAt,
      createdOn: localDate(project.createdAt, project.timeZone),
      today: localDate(sql`${q.now.toISOString()}::timestamptz`, project.timeZone)
    })
    .from(project)
    .where(q.projectIds ? inArray(project.id, q.projectIds) : undefined)
    .orderBy(asc(project.id))
}

/**
 * The projects' materialised figures for `period`, in the order they were written, and the `day` rows inside each
 * project's period range (the series), each with the instant its day starts in the project's zone.
 */
export async function analysisRows(tx: Tx, q: { projectIds: string[]; period: Period }) {
  if (!q.projectIds.length) return { figures: [], days: [] }
  const rows = await tx
    .select({
      ...getTableColumns(analysisMetric),
      dayStart: sql`(${analysisMetric.rangeFrom}::timestamp AT TIME ZONE ${project.timeZone})`.mapWith(
        analysisMetric.computedAt
      )
    })
    .from(analysisMetric)
    .innerJoin(project, eq(project.id, analysisMetric.projectId))
    .where(and(inArray(analysisMetric.projectId, q.projectIds), inArray(analysisMetric.period, [q.period, 'day'])))
    .orderBy(asc(analysisMetric.projectId), asc(analysisMetric.id))
  const figures = rows.filter((r) => r.period === q.period)
  const ranges = new Map(figures.map((r) => [r.projectId, r]))
  const days = rows.filter((r) => {
    const range = ranges.get(r.projectId)
    return r.period === 'day' && range !== undefined && range.rangeFrom <= r.rangeFrom && r.rangeTo <= range.rangeTo
  })
  return { figures, days }
}

/** A project's slice of the graded table: its dates, and only grades the figures already counted. */
export interface GradeScope {
  projectId: string
  from: string
  to: string
  computedBy: Date
}

/**
 * Up to `limit` non-guest grades (as the figures count them) of `packs`, newest first by `(local_date, id)` below
 * `before`, each inside its project's scope.
 */
export function analysisGradeRows(
  tx: Tx,
  q: {
    scopes: GradeScope[]
    packs: Array<'sky' | 'crowd'>
    before?: { localDate: string; id: string }
    limit: number
  }
) {
  if (!q.scopes.length || !q.packs.length) return Promise.resolve([])
  const where: SQL[] = [
    or(
      ...q.scopes.map((s) =>
        and(
          eq(grade.projectId, s.projectId),
          sql`${grade.localDate} BETWEEN ${s.from}::date AND ${s.to}::date`,
          lte(grade.createdAt, s.computedBy)
        )
      )
    )!,
    inArray(grade.pack, q.packs),
    sql`${grade.outcome} <> 'pending'`,
    sql`NOT (coalesce(${window.guest}, false) OR coalesce(${bundle.draftOnly}, false))`
  ]
  if (q.before) where.push(sql`(${grade.localDate}, ${grade.id}) < (${q.before.localDate}::date, ${q.before.id}::uuid)`)
  return tx
    .select(getTableColumns(grade))
    .from(grade)
    .leftJoin(window, eq(window.id, grade.windowId))
    .leftJoin(call, eq(call.id, grade.callId))
    .leftJoin(bundle, eq(bundle.id, call.bundleId))
    .where(and(...where))
    .orderBy(desc(grade.localDate), desc(grade.id))
    .limit(q.limit)
}

/** The project's uncancelled windows that overlap `[from, to]`, by start: what a what-if replays. */
export function whatIfWindows(tx: Tx, q: { projectId: string; from: Date; to: Date }) {
  return tx
    .select({ id: window.id, startsAt: window.startsAt, endsAt: window.endsAt, kind: window.kind, tz: window.tz })
    .from(window)
    .where(
      and(
        eq(window.projectId, q.projectId),
        isNull(window.cancelledAt),
        lt(window.startsAt, q.to),
        gt(window.endsAt, q.from)
      )
    )
    .orderBy(asc(window.startsAt), asc(window.id))
}

/**
 * The observed mode a what-if scores each window against: the newest non-guest `pack` grade of that window
 * (`observedMode` null when a required input was missing, which scores as No call).
 */
export async function whatIfObserved(tx: Tx, q: { pack: 'sky' | 'crowd'; windowIds: string[] }) {
  if (!q.windowIds.length) return []
  const rows = await tx
    .selectDistinctOn([grade.windowId], {
      windowId: grade.windowId,
      observedMode: grade.observedMode,
      localDate: sql<string>`${grade.localDate}::text`
    })
    .from(grade)
    .innerJoin(window, eq(window.id, grade.windowId))
    .leftJoin(call, eq(call.id, grade.callId))
    .leftJoin(bundle, eq(bundle.id, call.bundleId))
    .where(
      and(
        inArray(grade.windowId, q.windowIds),
        eq(grade.pack, q.pack),
        isNotNull(grade.windowId),
        eq(window.guest, false),
        sql`NOT coalesce(${bundle.draftOnly}, false)`
      )
    )
    .orderBy(asc(grade.windowId), desc(grade.createdAt), desc(grade.id))
  return rows.map((r) => ({ windowId: r.windowId!, observedMode: r.observedMode, localDate: r.localDate }))
}

/** Each source's public URL, for a replayed verdict's inputs (`InputValue.source_url`). */
export async function sourceUrls(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)]
  const rows = unique.length
    ? await tx.select({ id: source.id, url: source.url }).from(source).where(inArray(source.id, unique))
    : []
  return new Map(rows.map((r) => [r.id, r.url]))
}
