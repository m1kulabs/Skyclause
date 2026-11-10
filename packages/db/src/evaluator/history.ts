import type { ReadingHistory } from '@skyclause/clauses'
import { NotBuiltError, type TxHandle } from '@skyclause/contracts'
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { project, projectSource, source } from '../schema'
import { poll, reading } from '../schema/partitioned'
import type { EvaluatorQuery } from './types'

/** All retained history is needed for recovery, pre-window warnings, rain and exact local mornings. */
async function history(
  handle: TxHandle,
  projectId: string,
  cutoff: string,
  latestOnly: boolean
): Promise<ReadingHistory> {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('evaluator history requires a tenant transaction')
  const until = new Date(cutoff)
  if (!Number.isFinite(until.getTime())) throw new Error('invalid evaluator cutoff')
  const bindings = await tx
    .selectDistinct({ source })
    .from(projectSource)
    .innerJoin(project, eq(project.id, projectSource.projectId))
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(and(eq(project.id, projectId), isNull(project.archivedAt)))
    .orderBy(asc(source.id))
  const sources = bindings.map(({ source: row }) => ({
    id: row.id,
    kind: row.kind,
    cadenceS: row.cadenceS,
    staleAfterS: row.staleAfterS,
    freshness: row.freshness,
    probation: row.probation,
    meta: row.meta as Record<string, unknown>
  }))
  if (!sources.length) return { sources: [], readings: [], polls: [] }
  // Current mutable settings cannot establish a recorded-at-time camera choice.
  if (sources.some((row) => row.kind === 'camera')) throw new NotBuiltError('b-evaluator:camera-context-history')
  const ids = sources.map((row) => row.id)
  const polls = await tx
    .select()
    .from(poll)
    .where(
      and(
        inArray(poll.sourceId, ids),
        eq(poll.purpose, 'poll'),
        lte(poll.startedAt, until),
        or(lte(poll.receivedAt, until), isNull(poll.receivedAt))
      )
    )
    .orderBy(asc(poll.startedAt), asc(poll.id))
  // Unknown legacy errors/unchanged results must not disappear and manufacture fresh evidence.
  if (polls.some((row) => row.receivedAt === null)) throw new NotBuiltError('b-evaluator:poll-receipt-history')
  const itemKey = sql<string>`coalesce(${reading.itemKey}, '')`
  // DISTINCT ON sees only receipt-eligible rows. A later correction cannot hide the old version.
  const select = latestOnly
    ? tx.selectDistinctOn([reading.sourceId, reading.metric, reading.observedAt, itemKey])
    : tx.select()
  const rows = await select
    .from(reading)
    .where(and(inArray(reading.sourceId, ids), lte(reading.receivedAt, until), lte(reading.observedAt, until)))
    .orderBy(
      asc(reading.sourceId),
      asc(reading.metric),
      asc(reading.observedAt),
      asc(itemKey),
      desc(reading.revision),
      desc(reading.receivedAt),
      desc(reading.id)
    )
  return {
    sources,
    polls: polls.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      startedAt: row.startedAt.toISOString(),
      receivedAt: row.receivedAt!.toISOString(),
      outcome: row.outcome as 'ok' | 'unchanged' | 'error',
      httpStatus: row.httpStatus
    })),
    readings: rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      metric: row.metric,
      observedAt: row.observedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      value: row.value,
      valueText: row.valueText,
      valueJson: row.valueJson as Record<string, unknown> | null,
      itemKey: row.itemKey ?? '',
      revision: row.revision,
      unit: row.unit,
      deviceTime: row.deviceTime?.toISOString() ?? null
    }))
  }
}
/** Raw DB evidence at one instant; API provider validates adapter-derived temporal metadata.
 * Current bindings/settings do not establish arbitrary recorded-at-time context.
 */
export function loadEvaluatorHistory(tx: TxHandle, q: EvaluatorQuery): Promise<ReadingHistory> {
  return history(tx, q.projectId, q.tEval, true)
}
/** Replay: retain every revision through `to`, including observations before `from`. */
export function loadReadingHistory(
  tx: TxHandle,
  q: { projectId: string; from: string; to: string }
): Promise<ReadingHistory> {
  if (!Number.isFinite(Date.parse(q.from)) || Date.parse(q.from) > Date.parse(q.to))
    throw new Error('invalid evaluator range')
  return history(tx, q.projectId, q.to, false)
}
