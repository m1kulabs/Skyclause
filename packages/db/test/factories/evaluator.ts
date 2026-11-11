import type { Tx } from '../../src/client'
import {
  evaluatorDeadline,
  evaluatorReevaluation,
  evaluatorSourceTransition,
  evaluatorSourceDelivery
} from '../../src/schema'
import { makeProject } from './project'
import { makeSource } from './source'

export async function makeEvaluatorReevaluation(tx: Tx) {
  const p = await makeProject(tx)
  const [row] = await tx
    .insert(evaluatorReevaluation)
    .values({ orgId: tx.orgId!, projectId: p.id, pack: 'sky', requestedAt: new Date(), reason: 'test' })
    .returning()
  return row!
}
export async function makeEvaluatorSourceTransition(tx: Tx) {
  const s = await makeSource(tx)
  const [row] = await tx
    .insert(evaluatorSourceTransition)
    .values({
      sourceId: s.id,
      at: new Date(),
      since: new Date(),
      state: 'stale',
      eventType: 'source.stale',
      targets: []
    })
    .returning()
  return row!
}
export async function makeEvaluatorSourceDelivery(tx: Tx) {
  const t = await makeEvaluatorSourceTransition(tx),
    p = await makeProject(tx)
  const [row] = await tx
    .insert(evaluatorSourceDelivery)
    .values({ transitionId: t.id, recipientOrgId: tx.orgId!, projectId: p.id })
    .returning()
  return row!
}

export async function makeEvaluatorDeadline(tx: Tx) {
  const p = await makeProject(tx)
  const [row] = await tx
    .insert(evaluatorDeadline)
    .values({ orgId: tx.orgId!, projectId: p.id, generation: p.id, dueAt: new Date() })
    .returning()
  return row!
}
