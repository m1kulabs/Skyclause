import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { poll, reading } from '../schema/partitioned'
import { projectSource, source } from '../schema/sources'
import { night, window } from '../schema/windows'

export type StripReadingRecord = Pick<typeof reading.$inferSelect, 'id' | 'sourceId' | 'observedAt' | 'value'>

/** Ids of the project's bound public rain gauges (JPS sources); none means the strip has no rain lanes. */
export async function listStripRainSourceIds(tx: Tx, projectId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: source.id })
    .from(projectSource)
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(
      and(
        eq(projectSource.orgId, tx.orgId!),
        eq(projectSource.projectId, projectId),
        eq(source.kind, 'jps_rain'),
        isNull(source.ownerOrgId)
      )
    )
    .orderBy(asc(source.id))
  return rows.map((row) => row.id)
}

/**
 * Receipt-eligible `rain_5m_mm` readings of the given sources observed in [from, to], one row per
 * source, observed instant and item (newest revision), as the evaluator's history loader selects them. Authorize first.
 */
export async function listStripRainReadings(
  tx: Tx,
  q: { sourceIds: string[]; from: Date; to: Date }
): Promise<StripReadingRecord[]> {
  const itemKey = sql<string>`coalesce(${reading.itemKey}, '')`
  return tx
    .selectDistinctOn([reading.sourceId, reading.observedAt, itemKey], {
      id: reading.id,
      sourceId: reading.sourceId,
      observedAt: reading.observedAt,
      value: reading.value
    })
    .from(reading)
    .where(
      and(
        inArray(reading.sourceId, q.sourceIds),
        eq(reading.metric, 'rain_5m_mm'),
        gte(reading.observedAt, q.from),
        lte(reading.observedAt, q.to),
        lte(reading.receivedAt, q.to)
      )
    )
    .orderBy(
      asc(reading.sourceId),
      asc(reading.observedAt),
      asc(itemKey),
      desc(reading.revision),
      desc(reading.receivedAt),
      desc(reading.id)
    )
}

/** Start instants of the given sources' normal polls that errored in [from, to]. Authorize first. */
export async function listStripRainPollErrors(
  tx: Tx,
  q: { sourceIds: string[]; from: Date; to: Date }
): Promise<Date[]> {
  const rows = await tx
    .select({ startedAt: poll.startedAt })
    .from(poll)
    .where(
      and(
        inArray(poll.sourceId, q.sourceIds),
        eq(poll.purpose, 'poll'),
        eq(poll.outcome, 'error'),
        gte(poll.startedAt, q.from),
        lte(poll.startedAt, q.to),
        or(isNull(poll.receivedAt), lte(poll.receivedAt, q.to))
      )
    )
    .orderBy(asc(poll.startedAt))
  return rows.map((row) => row.startedAt)
}

/** The soonest visible, non-cancelled window of the project that has not ended before `from`. Authorize first. */
export async function getStripWindow(tx: Tx, q: { projectId: string; from: Date }) {
  const [row] = await tx
    .select()
    .from(window)
    .where(
      and(
        eq(window.projectId, q.projectId),
        isNull(window.cancelledAt),
        eq(window.moderation, 'visible'),
        gte(window.endsAt, q.from)
      )
    )
    .orderBy(asc(window.startsAt), asc(window.id))
    .limit(1)
  return row ?? null
}

/** Nights of the project whose arrival-to-exit span overlaps [from, to]; a night with unknown times is left out. */
export async function listStripNights(tx: Tx, q: { projectId: string; from: Date; to: Date }) {
  return tx
    .select()
    .from(night)
    .where(
      and(
        eq(night.projectId, q.projectId),
        isNotNull(night.doors),
        isNotNull(night.show),
        isNotNull(night.arrivalStart),
        isNotNull(night.arrivalEnd),
        lte(night.arrivalStart, q.to),
        gte(sql`coalesce(${night.exitEnd}, ${night.arrivalEnd})`, q.from)
      )
    )
    .orderBy(asc(night.date), asc(night.id))
}

/** Source page URLs by id, for the strip's input links. */
export async function listSourceUrls(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await tx
    .select({ id: source.id, url: source.url })
    .from(source)
    .where(inArray(source.id, [...new Set(ids)]))
  return new Map(rows.map((row) => [row.id, row.url]))
}
