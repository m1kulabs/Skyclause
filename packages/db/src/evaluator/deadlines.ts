import { createHash, randomUUID } from 'node:crypto'
import type { TxHandle } from '@skyclause/contracts'
import { and, asc, eq, isNull, isNotNull, count } from 'drizzle-orm'
import type { Tx } from '../client'
import { evaluatorDeadline, evaluatorReevaluation, projectSource, source } from '../schema'
import { handleOnce } from '../events'
import { poll, reading } from '../schema/partitioned'
import { loadEvaluatorScope, requestEvaluatorReevaluation, lockEvaluatorProject } from './repository'

export interface DeadlineIntent {
  org: string
  project: string
  generation: string
  dueAt: string
  taskName: string
  createdAt: string | null
}
function tenant(handle: TxHandle): Tx {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('deadline needs a tenant transaction')
  return tx
}
function intent(row: typeof evaluatorDeadline.$inferSelect): DeadlineIntent {
  return {
    org: row.orgId,
    project: row.projectId,
    generation: row.generation,
    dueAt: row.dueAt.toISOString(),
    createdAt: row.createdAt?.toISOString() ?? null,
    taskName: 'eval-' + createHash('sha256').update([row.orgId, row.projectId, row.generation].join(':')).digest('hex')
  }
}
export async function loadEvaluatorDeadline(handle: TxHandle, projectId: string): Promise<DeadlineIntent | null> {
  const tx = tenant(handle)
  const [row] = await tx
    .select()
    .from(evaluatorDeadline)
    .where(and(eq(evaluatorDeadline.projectId, projectId), isNull(evaluatorDeadline.retiredAt)))
  return row ? intent(row) : null
}
/** Called under the project lock alongside evaluation, or independently by event/repair callers. */
export async function replaceEvaluatorDeadline(
  handle: TxHandle,
  q: { projectId: string; dueAt: string | null; expectedGeneration?: string }
): Promise<DeadlineIntent | null> {
  const tx = tenant(handle)
  await lockEvaluatorProject(tx, q.projectId)
  const old = await loadEvaluatorDeadline(tx, q.projectId)
  if (q.expectedGeneration !== undefined && old?.generation !== q.expectedGeneration) return old
  if (old && q.dueAt !== null && Date.parse(old.dueAt) === Date.parse(q.dueAt) && q.expectedGeneration === undefined)
    return old
  if (old)
    await tx
      .update(evaluatorDeadline)
      .set({ retiredAt: new Date() })
      .where(and(eq(evaluatorDeadline.projectId, q.projectId), eq(evaluatorDeadline.generation, old.generation)))
  if (q.dueAt === null) return null
  const [row] = await tx
    .insert(evaluatorDeadline)
    .values({ orgId: tx.orgId!, projectId: q.projectId, generation: randomUUID(), dueAt: new Date(q.dueAt) })
    .returning()
  return intent(row!)
}
export async function markEvaluatorDeadlineCreated(handle: TxHandle, q: DeadlineIntent): Promise<void> {
  const tx = tenant(handle)
  // Even a superseded create may have reached Cloud Tasks, so retain it for cleanup.
  await tx
    .update(evaluatorDeadline)
    .set({ createdAt: new Date(), cleanedAt: null })
    .where(and(eq(evaluatorDeadline.projectId, q.project), eq(evaluatorDeadline.generation, q.generation)))
}
export async function listEvaluatorDeadlineCleanup(handle: TxHandle, projectId: string): Promise<DeadlineIntent[]> {
  const tx = tenant(handle)
  await lockEvaluatorProject(tx, projectId)
  const current = await loadEvaluatorDeadline(tx, projectId)
  if (current && !current.createdAt) return []
  const rows = await tx
    .select()
    .from(evaluatorDeadline)
    .where(
      and(
        eq(evaluatorDeadline.projectId, projectId),
        isNotNull(evaluatorDeadline.retiredAt),
        isNull(evaluatorDeadline.cleanedAt)
      )
    )
    .orderBy(asc(evaluatorDeadline.id))
  return rows.map(intent)
}
export async function completeEvaluatorDeadlineCleanup(handle: TxHandle, q: DeadlineIntent): Promise<void> {
  const tx = tenant(handle)
  await tx
    .update(evaluatorDeadline)
    .set({ cleanedAt: new Date() })
    .where(
      and(
        eq(evaluatorDeadline.projectId, q.project),
        eq(evaluatorDeadline.generation, q.generation),
        isNotNull(evaluatorDeadline.retiredAt),
        q.createdAt === null
          ? isNull(evaluatorDeadline.createdAt)
          : eq(evaluatorDeadline.createdAt, new Date(q.createdAt))
      )
    )
}
/** Lock is held until evaluation and the successor intent commit. Obsolete tasks perform no writes. */
export async function matchEvaluatorDeadline(
  handle: TxHandle,
  q: Pick<DeadlineIntent, 'org' | 'project' | 'generation' | 'dueAt'>,
  now: Date
): Promise<'obsolete' | 'early' | 'due'> {
  const tx = tenant(handle)
  if (q.org !== tx.orgId) return 'obsolete'
  await lockEvaluatorProject(tx, q.project)
  const current = await loadEvaluatorDeadline(tx, q.project)
  if (!current || current.generation !== q.generation || Date.parse(current.dueAt) !== Date.parse(q.dueAt))
    return 'obsolete'
  return Date.parse(current.dueAt) > now.getTime() ? 'early' : 'due'
}

/** Durable in the supplied domain-handler transaction. No nested connection or transport work. */
export async function requestEvaluatorProject(
  handle: TxHandle,
  q: { projectId: string; tEval: string; reason: string }
): Promise<boolean> {
  const tx = tenant(handle)
  await lockEvaluatorProject(tx, q.projectId)
  const scope = await loadEvaluatorScope(tx, q)
  if (!scope?.packs.length) return false
  for (const pack of scope.packs) await requestEvaluatorReevaluation(tx, { ...q, pack })
  return true
}
export async function validateEvaluatorPoll(
  handle: TxHandle,
  q: { sourceId: string; pollId: string; kind?: string; newRows?: number; outcome?: string; httpStatus?: number | null }
): Promise<void> {
  const tx = handle as Tx
  const rows = await tx
    .select({ poll, kind: source.kind })
    .from(poll)
    .innerJoin(source, eq(source.id, poll.sourceId))
    .where(and(eq(poll.id, q.pollId), eq(poll.sourceId, q.sourceId)))
  if (
    rows.length !== 1 ||
    !rows[0]!.poll.receivedAt ||
    (q.kind !== undefined && rows[0]!.kind !== q.kind) ||
    (q.outcome !== undefined && rows[0]!.poll.outcome !== q.outcome) ||
    (q.httpStatus !== undefined && rows[0]!.poll.httpStatus !== q.httpStatus)
  )
    throw new Error('Evaluator poll/source identity mismatch')
  if (q.newRows !== undefined) {
    const [n] = await tx
      .select({ n: count() })
      .from(reading)
      .where(and(eq(reading.pollId, q.pollId), eq(reading.sourceId, q.sourceId)))
    if (n!.n !== q.newRows) throw new Error('Evaluator poll reading count mismatch')
  }
}
export async function requestEvaluatorPoll(
  handle: TxHandle,
  q: {
    projectId: string
    sourceId: string
    pollId: string
    tEval: string
    kind?: string
    newRows?: number
    outcome?: string
    httpStatus?: number | null
  }
): Promise<boolean> {
  const tx = tenant(handle)
  await validateEvaluatorPoll(tx, q)
  const [binding] = await tx
    .select({ id: projectSource.id })
    .from(projectSource)
    .where(and(eq(projectSource.projectId, q.projectId), eq(projectSource.sourceId, q.sourceId)))
    .limit(1)
  if (!binding) throw new Error('Evaluator poll is not bound to tenant project')
  return handleOnce(tx, 'evaluator-project-poll', { messageId: q.projectId + ':' + q.pollId }, async (child) => {
    await requestEvaluatorProject(child, { ...q, reason: 'poll:' + q.pollId })
  })
}
export async function evaluatorNeedsEvaluation(
  handle: TxHandle,
  q: { projectId: string; tEval: string }
): Promise<boolean> {
  const tx = tenant(handle)
  const scope = await loadEvaluatorScope(tx, q)
  if (!scope?.packs.length) return false
  const intents = await tx.select().from(evaluatorReevaluation).where(eq(evaluatorReevaluation.projectId, q.projectId))
  return scope.packs.some((pack) => {
    const intent = intents.find((row) => row.pack === pack)
    return !intent || intent.completedAt === null
  })
}
