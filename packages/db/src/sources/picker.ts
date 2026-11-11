import type { SourceKind } from '@skyclause/contracts'
import { and, asc, desc, eq, getTableColumns, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Tx } from '../client'
import { poll, reading } from '../schema/partitioned'
import { source, sourceState } from '../schema/sources'

export type SourceProjection = {
  source: typeof source.$inferSelect
  state: typeof sourceState.$inferSelect | null
  latestReading: typeof reading.$inferSelect | null
  recentErrors: Array<typeof poll.$inferSelect>
}

export type PickerQuery = {
  kind?: SourceKind
  near?: { lat: number; lon: number }
  q?: string
  limit: number
  cursor?: { distanceKm: number | null; id: string }
  projectIds?: string[]
}

async function projectSources(tx: Tx, sources: Array<typeof source.$inferSelect>): Promise<SourceProjection[]> {
  if (!sources.length) return []
  const ids = sources.map((s) => s.id)
  const states = await tx.select().from(sourceState).where(inArray(sourceState.sourceId, ids))
  const readings = await tx
    .selectDistinctOn([reading.sourceId])
    .from(reading)
    .where(inArray(reading.sourceId, ids))
    .orderBy(
      asc(reading.sourceId),
      desc(reading.observedAt),
      desc(reading.receivedAt),
      desc(reading.revision),
      desc(reading.id)
    )
  const errors = tx
    .select({
      ...getTableColumns(poll),
      position:
        sql<number>`row_number() over (partition by ${poll.sourceId} order by ${poll.startedAt} desc, ${poll.id} desc)`.as(
          'position'
        )
    })
    .from(poll)
    .where(and(inArray(poll.sourceId, ids), eq(poll.outcome, 'error')))
    .as('errors')
  const polls = await tx
    .select()
    .from(errors)
    .where(sql`${errors.position} <= 5`)
    .orderBy(asc(errors.sourceId), desc(errors.startedAt), desc(errors.id))
  return sources.map((src) => ({
    source: src,
    state: states.find((state) => state.sourceId === src.id) ?? null,
    latestReading: readings.find((row) => row.sourceId === src.id) ?? null,
    recentErrors: polls.filter((row) => row.sourceId === src.id).map(({ position: _position, ...row }) => row)
  }))
}

/** Caller must authorize ownership and principal project scope before requesting private source history. */
export async function sourceProjection(tx: Tx, sourceId: string): Promise<SourceProjection | null> {
  const rows = await tx.select().from(source).where(eq(source.id, sourceId))
  return (await projectSources(tx, rows))[0] ?? null
}

/** C catalogue rows are read-only. Resolve fixed device ownership before projecting state, polls or readings. */
export async function listSourcePickerRecords(
  tx: Tx,
  query: PickerQuery
): Promise<Array<SourceProjection & { distanceKm: number | null }>> {
  const distance = query.near
    ? sql<number | null>`CASE WHEN ${source.lat} IS NULL OR ${source.lon} IS NULL THEN NULL ELSE
      6371.0088 * 2 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(${source.lat} - ${query.near.lat}) / 2), 2) +
        cos(radians(${query.near.lat})) * cos(radians(${source.lat})) *
        power(sin(radians(${source.lon} - ${query.near.lon}) / 2), 2)
      )))) END`
    : sql<number | null>`NULL::double precision`
  // Text equality with the real tenant project UUID avoids casting untrusted/malformed JSON into UUID.
  const scope =
    query.projectIds === undefined
      ? sql`true`
      : query.projectIds.length
        ? sql`p.id::text IN (${sql.join(
            query.projectIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        : sql`false`
  const filters: SQL[] = [
    sql`(
    (${source.kind} NOT IN ('camera', 'pi') AND ${source.ownerOrgId} IS NULL)
    OR (${source.kind} IN ('camera', 'pi') AND ${source.ownerOrgId} = ${tx.orgId}::uuid
      AND EXISTS (SELECT 1 FROM project p WHERE p.org_id = ${tx.orgId}::uuid
        AND p.id::text = ${source.meta}->>'project_id' AND ${scope}))
  )`
  ]
  if (query.kind) filters.push(eq(source.kind, query.kind))
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
    filters.push(
      sql`(${source.name} ILIKE ${pattern} ESCAPE ${'\\'} OR ${source.externalId} ILIKE ${pattern} ESCAPE ${'\\'})`
    )
  }
  if (query.cursor) {
    const { distanceKm, id } = query.cursor
    filters.push(
      !query.near
        ? gt(source.id, id)
        : distanceKm === null
          ? and(isNull(distance), gt(source.id, id))!
          : or(gt(distance, distanceKm), and(eq(distance, distanceKm), gt(source.id, id)), isNull(distance))!
    )
  }
  const rows = await tx
    .select({ source, distanceKm: distance })
    .from(source)
    .where(and(...filters))
    .orderBy(...(query.near ? [sql`${distance} ASC NULLS LAST`, asc(source.id)] : [asc(source.id)]))
    .limit(query.limit + 1)
  const projections = await projectSources(
    tx,
    rows.map((row) => row.source)
  )
  return projections.map((projection, index) => ({ ...projection, distanceKm: rows[index]!.distanceKm }))
}
