import { resolveSourceAt, type InputState, type ReadingHistory } from '@skyclause/clauses'
import { NotBuiltError, type TxHandle } from '@skyclause/contracts'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { emitEvent, handleOnce } from '../events'
import {
  evaluatorSourceDelivery,
  evaluatorSourceTransition,
  project,
  projectSource,
  source,
  sourceState
} from '../schema'
import { loadEvaluatorScope, lockEvaluatorProject } from './repository'

export interface SourceTarget {
  orgId: string
  projectId: string
}
export interface SourceTransition {
  id: string
  sourceId: string
  at: string
  state: InputState
  since: string
  httpStatus: number | null
  pendingUntil: string | null
  eventType: 'source.error' | 'source.stale' | 'source.recovered' | null
  targets: SourceTarget[]
}
function globalTx(handle: TxHandle): Tx {
  const tx = handle as Tx
  if (tx.orgId !== null || tx.principal.kind !== 'system')
    throw new Error('source transitions need a separate system transaction')
  return tx
}
/** Enumerate projects globally, then inspect bindings within each tenant; T bindings are invisible globally. */
export async function listEvaluatorProjects(handle: TxHandle): Promise<SourceTarget[]> {
  const tx = globalTx(handle)
  const rows = await tx.select({ orgId: project.orgId, projectId: project.id }).from(project).orderBy(asc(project.id))
  return rows
}
export async function findSourceTargets(
  handle: TxHandle,
  q: { sourceId: string; tEval: string }
): Promise<SourceTarget[]> {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('source target lookup requires a tenant')
  const bindings = await tx
    .selectDistinct({ projectId: projectSource.projectId })
    .from(projectSource)
    .where(eq(projectSource.sourceId, q.sourceId))
  const targets: SourceTarget[] = []
  for (const { projectId } of bindings) {
    const scope = await loadEvaluatorScope(tx, { projectId, tEval: q.tEval })
    if (scope?.packs.length) targets.push({ orgId: tx.orgId, projectId })
  }
  return targets
}
function transition(row: typeof evaluatorSourceTransition.$inferSelect): SourceTransition {
  return {
    ...row,
    at: row.at.toISOString(),
    since: row.since.toISOString(),
    pendingUntil: row.pendingUntil?.toISOString() ?? null,
    eventType: row.eventType as SourceTransition['eventType'],
    targets: row.targets as SourceTarget[]
  }
}
/** The source lock is the ingest lock; callers must never hold a tenant/project lock here. */
export async function recordSourceTransition(
  handle: TxHandle,
  q: { sourceId: string; tEval: string; history: ReadingHistory; targets: SourceTarget[] }
): Promise<SourceTransition | null> {
  const tx = globalTx(handle),
    sourceId = q.sourceId.toLowerCase()
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'sources:' + sourceId},0))`)
  const [stored] = await tx.select().from(source).where(eq(source.id, sourceId))
  const metadata = q.history.sources.find((s) => s.id.toLowerCase() === sourceId)
  if (!stored || !metadata) throw new NotBuiltError('b-evaluator:source-history')
  // Owner integration must prove recorded-at-time device settings. A current toggle/daylight default cannot.
  if (stored.kind === 'camera' || stored.kind === 'pi') throw new NotBuiltError('b-evaluator:device-owner-context')
  const [previous] = await tx.select().from(sourceState).where(eq(sourceState.sourceId, sourceId))
  if (previous?.evaluatedAt && previous.evaluatedAt.getTime() >= Date.parse(q.tEval)) return null
  const resolved = resolveSourceAt(q.history, sourceId, q.tEval)
  let state = resolved.state
  const wasUnhealthy = previous?.state === 'stale' || previous?.state === 'error'
  if (wasUnhealthy && (state === 'fresh' || state === 'recovered')) state = 'recovered'
  // Recovered is an edge; repeated fresh evidence must not emit recovery again.
  const same = previous?.state === state || (previous?.state === 'recovered' && state === 'fresh')
  const since = same && previous ? previous.since : new Date(resolved.since)
  const latest = q.history.polls
    .filter(
      (p) =>
        p.sourceId === sourceId &&
        p.receivedAt !== undefined &&
        Date.parse(p.receivedAt) <= Date.parse(q.tEval) &&
        Date.parse(p.startedAt) <= Date.parse(q.tEval)
    )
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.id.localeCompare(a.id))[0]
  const values = {
    state,
    since,
    httpStatus: latest?.httpStatus ?? null,
    pendingUntil: state === 'pending' ? new Date(resolved.since) : null,
    evaluatedAt: new Date(q.tEval),
    updatedAt: new Date()
  }
  await tx
    .insert(sourceState)
    .values({ sourceId, ...values })
    .onConflictDoUpdate({ target: sourceState.sourceId, set: values })
  if (same) return null
  const eventType =
    state === 'stale'
      ? 'source.stale'
      : state === 'error'
        ? 'source.error'
        : state === 'recovered'
          ? 'source.recovered'
          : null
  if (!eventType) return null
  const targets = [
    ...new Map(
      q.targets.map((t) => [
        t.projectId.toLowerCase(),
        { orgId: t.orgId.toLowerCase(), projectId: t.projectId.toLowerCase() }
      ])
    ).values()
  ].sort((a, b) => a.projectId.localeCompare(b.projectId))
  const [row] = await tx
    .insert(evaluatorSourceTransition)
    .values({
      sourceId,
      at: new Date(q.tEval),
      state,
      since,
      httpStatus: values.httpStatus,
      pendingUntil: values.pendingUntil,
      eventType,
      targets
    })
    .returning()
  if (targets.length)
    await tx
      .insert(evaluatorSourceDelivery)
      .values(targets.map((t) => ({ transitionId: row!.id, recipientOrgId: t.orgId, projectId: t.projectId })))
  return transition(row!)
}
export async function listSourceTransitionDeliveries(handle: TxHandle) {
  const tx = globalTx(handle)
  return tx
    .select({
      transitionId: evaluatorSourceDelivery.transitionId,
      orgId: evaluatorSourceDelivery.recipientOrgId,
      projectId: evaluatorSourceDelivery.projectId
    })
    .from(evaluatorSourceDelivery)
    .innerJoin(evaluatorSourceTransition, eq(evaluatorSourceTransition.id, evaluatorSourceDelivery.transitionId))
    .where(isNull(evaluatorSourceDelivery.completedAt))
    .orderBy(
      asc(evaluatorSourceTransition.at),
      asc(evaluatorSourceTransition.id),
      asc(evaluatorSourceDelivery.projectId)
    )
}
/** Event, handleOnce marker and completion are one tenant commit, so retention of dedupe markers cannot re-emit. */
export async function deliverSourceTransition(
  handle: TxHandle,
  q: { transitionId: string; projectId: string }
): Promise<boolean> {
  const tx = handle as Tx
  if (!tx.orgId || tx.principal.kind !== 'system')
    throw new Error('source delivery requires a tenant system transaction')
  await lockEvaluatorProject(tx, q.projectId)
  const where = and(
    eq(evaluatorSourceDelivery.transitionId, q.transitionId),
    eq(evaluatorSourceDelivery.projectId, q.projectId),
    eq(evaluatorSourceDelivery.recipientOrgId, tx.orgId)
  )
  const [delivery] = await tx.select().from(evaluatorSourceDelivery).where(where).for('update')
  if (!delivery || delivery.completedAt) return false
  const [row] = await tx
    .select()
    .from(evaluatorSourceTransition)
    .where(eq(evaluatorSourceTransition.id, q.transitionId))
  if (!row) throw new Error('source transition missing')
  const earlier = await tx.execute(
    sql`SELECT 1 FROM evaluator_source_delivery d JOIN evaluator_source_transition t ON t.id=d.transition_id WHERE d.project_id=${q.projectId} AND d.recipient_org_id=${tx.orgId} AND d.completed_at IS NULL AND t.source_id=${row.sourceId} AND (t.at,t.id)<(${row.at},${row.id}::uuid) LIMIT 1`
  )
  if (earlier.rows.length) return false
  const [binding] = await tx
    .select({ id: projectSource.id })
    .from(projectSource)
    .where(and(eq(projectSource.projectId, q.projectId), eq(projectSource.sourceId, row.sourceId)))
    .limit(1)
  const scope = binding ? await loadEvaluatorScope(tx, { projectId: q.projectId, tEval: row.at.toISOString() }) : null
  if (scope?.packs.length) {
    await handleOnce(tx, 'evaluator-source-transition', { messageId: row.id + ':' + q.projectId }, async (child) => {
      const common = { source_id: row.sourceId, since: row.since.toISOString(), http_status: row.httpStatus }
      if (row.eventType === 'source.stale')
        await emitEvent(child, { projectId: q.projectId, type: 'source.stale', data: { ...common, state: 'stale' } })
      else if (row.eventType === 'source.error')
        await emitEvent(child, { projectId: q.projectId, type: 'source.error', data: { ...common, state: 'error' } })
      else if (row.eventType === 'source.recovered')
        await emitEvent(child, {
          projectId: q.projectId,
          type: 'source.recovered',
          data: { ...common, state: 'recovered' }
        })
    })
  }
  await tx.update(evaluatorSourceDelivery).set({ completedAt: new Date() }).where(where)
  return true
}
/** Only completed work ages out; deleting the parent cascades its private completion marks. */
export async function sweepEvaluatorCoordination(
  handle: TxHandle,
  now: Date
): Promise<{ deleted: number; pseudonymised: number }> {
  const tx = handle as Tx
  const cutoff = new Date(now.getTime() - 30 * 86400_000)
  const transitions = await tx.execute(
    sql`DELETE FROM evaluator_source_transition t WHERE t.created_at < ${cutoff} AND NOT EXISTS (SELECT 1 FROM evaluator_source_delivery d WHERE d.transition_id=t.id AND (d.completed_at IS NULL OR d.completed_at >= ${cutoff})) RETURNING id`
  )
  const intents = await tx.execute(sql`DELETE FROM evaluator_reevaluation WHERE completed_at < ${cutoff} RETURNING id`)
  const deadlines = await tx.execute(
    sql`DELETE FROM evaluator_deadline WHERE retired_at IS NOT NULL AND cleaned_at < ${cutoff} RETURNING id`
  )
  return { deleted: transitions.rows.length + intents.rows.length + deadlines.rows.length, pseudonymised: 0 }
}
