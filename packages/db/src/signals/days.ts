import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { poll, reading } from '../schema/partitioned'
import { projectSource, source } from '../schema/sources'
import { window } from '../schema/windows'

export type ProjectDayRecord = {
  date: string
  readingCount: number
  errorCount: number
  windowCount: number
  /** The newest stored `forecast_day` for the date, from the project's bound MET source. */
  forecast: { value: number | null; afternoon: string | null; sourceUrl: string } | null
}

/** `date` as the first instant of that local day in `zone`. */
const dayStart = (date: string, zone: string) => sql`(${date}::date)::timestamp AT TIME ZONE ${zone}`
const localDay = (column: unknown, zone: string) => sql<string>`((${column}) AT TIME ZONE ${zone})::date::text`

/**
 * Per-local-date counts and MET forecasts for `from`..`to` (inclusive `YYYY-MM-DD` in `zone`), one row per date.
 * Authorize the project before calling. One grouped query per table, so the cost does not grow with the range.
 */
export async function listProjectDayRecords(
  tx: Tx,
  query: { projectId: string; zone: string; from: string; to: string; now: Date }
): Promise<ProjectDayRecord[]> {
  const { projectId, zone, from, to, now } = query
  // A bound catalogue source, or a device source of this organisation and this project alone (as `/sources` reads).
  const sources = await tx
    .select({ id: source.id, kind: source.kind, url: source.url })
    .from(projectSource)
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(
      and(
        eq(projectSource.orgId, tx.orgId!),
        eq(projectSource.projectId, projectId),
        sql`(
        (${source.kind} NOT IN ('camera', 'pi') AND ${source.ownerOrgId} IS NULL)
        OR (${source.kind} IN ('camera', 'pi') AND ${source.ownerOrgId} = ${tx.orgId}::uuid
          AND ${source.meta}->>'project_id' = ${projectSource.projectId}::text
          AND NOT EXISTS (SELECT 1 FROM project_source conflict
            WHERE conflict.source_id = ${source.id} AND conflict.project_id <> ${projectSource.projectId}))
      )`
      )
    )
  const ids = sources.map((row) => row.id)
  const forecastIds = sources.filter((row) => row.kind === 'met_forecast').map((row) => row.id)
  const days = new Map<string, ProjectDayRecord>()
  for (let at = from; at <= to; at = nextDate(at))
    days.set(at, { date: at, readingCount: 0, errorCount: 0, windowCount: 0, forecast: null })

  const readingDay = localDay(reading.observedAt, zone)
  const pollDay = localDay(poll.startedAt, zone)
  const windowDay = localDay(window.startsAt, zone)
  // Sequential: one transaction owns one connection. Grouped by ordinal: a bound zone parameter differs per use.
  const readings = await (ids.length
    ? tx
        .select({
          day: readingDay,
          // A re-fetched revision of one observation is still one reading.
          count: sql<number>`count(DISTINCT (${reading.sourceId}, ${reading.metric}, ${reading.observedAt}, ${reading.itemKey}))::int`
        })
        .from(reading)
        .where(
          and(
            inArray(reading.sourceId, ids),
            gte(reading.observedAt, dayStart(from, zone)),
            lt(reading.observedAt, dayStart(nextDate(to), zone))
          )
        )
        .groupBy(sql`1`)
    : [])
  const errors = await (ids.length
    ? tx
        .select({ day: pollDay, count: sql<number>`count(*)::int` })
        .from(poll)
        .where(
          and(
            inArray(poll.sourceId, ids),
            eq(poll.outcome, 'error'),
            gte(poll.startedAt, dayStart(from, zone)),
            lt(poll.startedAt, dayStart(nextDate(to), zone))
          )
        )
        .groupBy(sql`1`)
    : [])
  const windows = await tx
    .select({ day: windowDay, count: sql<number>`count(*)::int` })
    .from(window)
    .where(
      and(
        eq(window.projectId, projectId),
        isNull(window.cancelledAt),
        gte(window.startsAt, dayStart(from, zone)),
        lt(window.startsAt, dayStart(nextDate(to), zone))
      )
    )
    .groupBy(sql`1`)
  const forecasts = await (forecastIds.length
    ? tx
        .selectDistinctOn([sql`${reading.valueJson}->>'date'`], {
          date: sql<string>`${reading.valueJson}->>'date'`,
          value: reading.value,
          afternoon: sql<string | null>`${reading.valueJson}->>'afternoon_forecast'`,
          sourceId: reading.sourceId
        })
        .from(reading)
        .where(
          and(
            inArray(reading.sourceId, forecastIds),
            eq(reading.metric, 'forecast_day'),
            sql`${reading.valueJson}->>'date' BETWEEN ${from} AND ${to}`,
            // The stored row is dated at local midnight in Malaysia; bound the partitions it can sit in.
            gte(reading.observedAt, dayStart(from, zone)),
            lt(reading.observedAt, sql`${dayStart(nextDate(to), zone)} + interval '1 day'`),
            sql`${reading.receivedAt} <= ${now.toISOString()}::timestamptz`
          )
        )
        .orderBy(
          sql`${reading.valueJson}->>'date'`,
          sql`${reading.revision} DESC`,
          sql`${reading.receivedAt} DESC`,
          sql`${reading.id} DESC`
        )
    : [])
  for (const row of readings) days.get(row.day)!.readingCount = row.count
  for (const row of errors) days.get(row.day)!.errorCount = row.count
  for (const row of windows) days.get(row.day)!.windowCount = row.count
  const urls = new Map(sources.map((row) => [row.id, row.url]))
  for (const row of forecasts) {
    const record = days.get(row.date)
    if (record) record.forecast = { value: row.value, afternoon: row.afternoon, sourceUrl: urls.get(row.sourceId)! }
  }
  return [...days.values()]
}

function nextDate(date: string) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}
