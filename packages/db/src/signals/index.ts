import type { SourceRole } from '@skyclause/contracts'
import { and, asc, desc, eq, getTableColumns, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { poll, reading } from '../schema/partitioned'
import { projectSource, source, sourceState } from '../schema/sources'
import type { SourceProjection } from '../sources/picker'

export type ProjectSourceHealthRecord = SourceProjection & {
  bindingId: string
  projectId: string
  role: SourceRole
  normalPolls: Array<typeof poll.$inferSelect>
  latestNormalPoll: typeof poll.$inferSelect | null
  latestGoodNormalPoll: typeof poll.$inferSelect | null
}

/** Authorize the project before calling. Resolve private ownership before reading any evidence, in the caller's tenant transaction. */
export async function listProjectSourceRecords(
  tx: Tx,
  query: { projectId: string; limit: number; afterId?: string; now: Date }
): Promise<ProjectSourceHealthRecord[]> {
  const rows = await tx
    .select({ source, bindingId: projectSource.id, projectId: projectSource.projectId, role: projectSource.role })
    .from(projectSource)
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(
      and(
        eq(projectSource.orgId, tx.orgId!),
        eq(projectSource.projectId, query.projectId),
        query.afterId ? gt(projectSource.id, query.afterId) : undefined,
        sql`(
        (${source.kind} NOT IN ('camera', 'pi') AND ${source.ownerOrgId} IS NULL)
        OR (${source.kind} IN ('camera', 'pi') AND ${source.ownerOrgId} = ${tx.orgId}::uuid
          AND ${source.meta}->>'project_id' = ${projectSource.projectId}::text
          AND NOT EXISTS (SELECT 1 FROM project_source conflict
            WHERE conflict.source_id = ${source.id} AND conflict.project_id <> ${projectSource.projectId}))
      )`
      )
    )
    .orderBy(asc(projectSource.id))
    .limit(query.limit + 1)
  if (!rows.length) return []

  const ids = [...new Set(rows.map((row) => row.source.id))]
  const states = await tx.select().from(sourceState).where(inArray(sourceState.sourceId, ids))
  const readings = await tx
    .selectDistinctOn([reading.sourceId])
    .from(reading)
    .where(and(inArray(reading.sourceId, ids), lte(reading.receivedAt, query.now)))
    .orderBy(
      asc(reading.sourceId),
      desc(reading.observedAt),
      desc(reading.receivedAt),
      desc(reading.revision),
      desc(reading.id)
    )
  // Null legacy receipts prove a persisted request but remain unknown; never substitute a timestamp.
  const available = and(
    inArray(poll.sourceId, ids),
    lt(poll.startedAt, query.now),
    or(isNull(poll.receivedAt), lte(poll.receivedAt, query.now))
  )!
  const errors = tx
    .select({
      ...getTableColumns(poll),
      position:
        sql<number>`row_number() over (partition by ${poll.sourceId} order by ${poll.startedAt} desc, ${poll.id} desc)`.as(
          'position'
        )
    })
    .from(poll)
    .where(and(available, eq(poll.outcome, 'error')))
    .as('errors')
  const recentErrors = await tx
    .select()
    .from(errors)
    .where(sql`${errors.position} <= 5`)
    .orderBy(asc(errors.sourceId), desc(errors.startedAt), desc(errors.id))
  const normal = and(available, eq(poll.purpose, 'poll'))!
  const normalPolls = await tx
    .select(getTableColumns(poll))
    .from(poll)
    .innerJoin(source, eq(source.id, poll.sourceId))
    .where(
      and(normal, sql`${poll.startedAt} >= ${query.now}::timestamptz - ${source.cadenceS} * 48 * interval '1 second'`)
    )
    .orderBy(asc(poll.sourceId), desc(poll.startedAt), desc(poll.id))
  const latestNormalPolls = await tx
    .selectDistinctOn([poll.sourceId])
    .from(poll)
    .where(normal)
    .orderBy(asc(poll.sourceId), desc(poll.startedAt), desc(poll.id))
  const latestGoodNormalPolls = await tx
    .selectDistinctOn([poll.sourceId])
    .from(poll)
    .where(and(normal, inArray(poll.outcome, ['ok', 'unchanged'])))
    .orderBy(asc(poll.sourceId), desc(poll.startedAt), desc(poll.id))
  return rows.map((row) => ({
    ...row,
    state: states.find((state) => state.sourceId === row.source.id) ?? null,
    latestReading: readings.find((reading) => reading.sourceId === row.source.id) ?? null,
    recentErrors: recentErrors
      .filter((poll) => poll.sourceId === row.source.id)
      .map(({ position: _position, ...poll }) => poll),
    normalPolls: normalPolls.filter((poll) => poll.sourceId === row.source.id),
    latestNormalPoll: latestNormalPolls.find((poll) => poll.sourceId === row.source.id) ?? null,
    latestGoodNormalPoll: latestGoodNormalPolls.find((poll) => poll.sourceId === row.source.id) ?? null
  }))
}
