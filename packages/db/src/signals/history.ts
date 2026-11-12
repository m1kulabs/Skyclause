import type { Tx } from '../client'
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  notInArray,
  or,
  sql
} from 'drizzle-orm'
import { poll, reading } from '../schema/partitioned'
import { project } from '../schema/project'
import { projectSource, source } from '../schema/sources'

export type SourceHistoryAccess = { source: typeof source.$inferSelect; projectId: string | null }
export type HistoryPosition = { at: string; id: string }
export type SourceHistoryPage = { sourceId: string; limit: number; from?: string; to?: string; after?: HistoryPosition }
export type SourceReadingRecord = Omit<typeof reading.$inferSelect, 'observedAt' | 'receivedAt' | 'deviceTime'> & {
  observedAt: string
  receivedAt: string
  deviceTime: string | null
}
export type SourcePollRecord = Omit<typeof poll.$inferSelect, 'startedAt' | 'receivedAt'> & {
  startedAt: string
  receivedAt: string | null
}

/** Classify in the caller's tenant transaction before authorizing and reading evidence. Metadata is untrusted text. */
export async function getSourceHistoryAccess(tx: Tx, sourceId: string): Promise<SourceHistoryAccess | null> {
  const deviceKinds: Array<'camera' | 'pi'> = ['camera', 'pi']
  const conflicts = tx
    .select({ id: projectSource.id })
    .from(projectSource)
    .where(and(eq(projectSource.sourceId, source.id), ne(projectSource.projectId, project.id)))
  const [row] = await tx
    .select({ source, projectId: project.id })
    .from(source)
    .leftJoin(
      project,
      and(
        inArray(source.kind, deviceKinds),
        eq(project.orgId, tx.orgId!),
        sql`${source.meta}->>'project_id' = ${project.id}::text`
      )
    )
    .where(
      and(
        eq(source.id, sourceId),
        or(
          and(notInArray(source.kind, deviceKinds), isNull(source.ownerOrgId)),
          and(
            inArray(source.kind, deviceKinds),
            eq(source.ownerOrgId, tx.orgId!),
            isNotNull(project.id),
            notExists(conflicts)
          )
        )
      )
    )
    .limit(1)
  return row ?? null
}

/** Requires prior caller authorization. SELECT only; raw values and every revision remain intact. */
export async function listSourceReadingRecords(tx: Tx, query: SourceHistoryPage): Promise<SourceReadingRecord[]> {
  return tx
    .select({
      ...getTableColumns(reading),
      observedAt: sql<string>`to_char(${reading.observedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      receivedAt: sql<string>`to_char(${reading.receivedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      deviceTime: sql<string | null>`to_char(${reading.deviceTime} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
    })
    .from(reading)
    .where(
      and(
        eq(reading.sourceId, query.sourceId),
        query.from !== undefined ? sql`${reading.observedAt} >= ${query.from}::timestamptz` : undefined,
        query.to !== undefined ? sql`${reading.observedAt} < ${query.to}::timestamptz` : undefined,
        query.after
          ? sql`(${reading.observedAt}, ${reading.id}) < (${query.after.at}::timestamptz, ${query.after.id}::uuid)`
          : undefined
      )
    )
    .orderBy(desc(reading.observedAt), desc(reading.id))
    .limit(query.limit + 1)
}

/** Requires prior caller authorization. No state/projection joins or interpretation of stored outcomes/purposes. */
export async function listSourcePollRecords(
  tx: Tx,
  query: SourceHistoryPage & { outcome?: 'ok' | 'unchanged' | 'error' }
): Promise<SourcePollRecord[]> {
  return tx
    .select({
      ...getTableColumns(poll),
      startedAt: sql<string>`to_char(${poll.startedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      receivedAt: sql<string | null>`to_char(${poll.receivedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
    })
    .from(poll)
    .where(
      and(
        eq(poll.sourceId, query.sourceId),
        query.from !== undefined ? sql`${poll.startedAt} >= ${query.from}::timestamptz` : undefined,
        query.to !== undefined ? sql`${poll.startedAt} < ${query.to}::timestamptz` : undefined,
        query.outcome !== undefined ? eq(poll.outcome, query.outcome) : undefined,
        query.after
          ? sql`(${poll.startedAt}, ${poll.id}) < (${query.after.at}::timestamptz, ${query.after.id}::uuid)`
          : undefined
      )
    )
    .orderBy(desc(poll.startedAt), desc(poll.id))
    .limit(query.limit + 1)
}
