import type { Pack, TxHandle } from '@skyclause/contracts'
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { adminAccounts } from '../alerts'
import type { Tx } from '../client'
import { handleOnce } from '../events'
import { organization, project, projectSource, source } from '../schema'
import { poll, reading } from '../schema/partitioned'

/** Current passive audit evidence only; this does not establish historical camera eligibility. */
export async function loadEvaluatorAuditSources(handle: TxHandle, now: string) {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('evaluator audits need tenant context')
  const at = new Date(now)
  const bindings = await tx
    .select({ project, source, boundAt: projectSource.createdAt })
    .from(projectSource)
    .innerJoin(project, eq(project.id, projectSource.projectId))
    .innerJoin(organization, eq(organization.id, project.orgId))
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(and(isNull(project.archivedAt), isNull(organization.deletionRequestedAt), lte(projectSource.createdAt, at)))
    .orderBy(asc(project.id), asc(source.id), asc(projectSource.createdAt))
  const accountIds = await adminAccounts(tx)
  const rows = []
  const seen = new Set<string>()
  for (const row of bindings) {
    const key = row.project.id + ':' + row.source.id
    if (seen.has(key)) continue
    seen.add(key)
    const [observations] = await tx
      .select({ at: sql<string | null>`max(${reading.observedAt})` })
      .from(reading)
      .where(and(eq(reading.sourceId, row.source.id), lte(reading.observedAt, at), lte(reading.receivedAt, at)))
    const [goodPoll] = await tx
      .select({ at: sql<string | null>`max(${poll.startedAt})` })
      .from(poll)
      .where(
        and(
          eq(poll.sourceId, row.source.id),
          eq(poll.purpose, 'poll'),
          inArray(poll.outcome, ['ok', 'unchanged']),
          lte(poll.startedAt, at),
          lte(poll.receivedAt, at)
        )
      )
    const [metadata] = await tx
      .select({ value: reading.valueJson })
      .from(reading)
      .where(
        and(
          eq(reading.sourceId, row.source.id),
          eq(reading.metric, 'metadata'),
          lte(reading.observedAt, at),
          lte(reading.receivedAt, at)
        )
      )
      .orderBy(desc(reading.observedAt), desc(reading.revision), desc(reading.receivedAt), desc(reading.id))
      .limit(1)
    rows.push({
      ...row,
      accountIds,
      basis: row.source.freshness === 'polled' ? goodPoll?.at : observations?.at,
      metadata: metadata?.value
    })
  }
  return rows
}
/** Only the actual event poll's used rows; timer callers never claim old historical inputs. */
export async function claimEvaluatorReadingUses(
  handle: TxHandle,
  q: { projectId: string; pack: Pack; pollId: string; readingIds: string[]; tEval: string }
) {
  const tx = handle as Tx
  if (!tx.orgId || tx.principal.kind !== 'system') throw new Error('reading-use receipts need tenant worker context')
  if (!q.readingIds.length) return []
  const rows = await tx
    .select({ id: reading.id, receivedAt: reading.receivedAt })
    .from(reading)
    .where(
      and(eq(reading.pollId, q.pollId), inArray(reading.id, q.readingIds), lte(reading.receivedAt, new Date(q.tEval)))
    )
  const claimed = []
  for (const row of rows)
    if (
      await handleOnce(
        tx,
        'evaluator-reading-use',
        { messageId: [tx.orgId, q.projectId, q.pack, row.id].join(':') },
        async () => {}
      )
    )
      claimed.push(row)
  return claimed
}
