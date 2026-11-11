import type { IndicatorRegistry } from '@skyclause/clauses'
import { NotBuiltError, type Pack, type TxHandle } from '@skyclause/contracts'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { indicatorSnapshot } from '../schema'
import { readEvaluatorArchive } from './repository'

/** Only verified immutable definitions of this project and pack can resolve a historical hash. */
export async function loadEvaluatorRegistry(
  handle: TxHandle,
  q: { projectId: string; pack: Pack; registryHash: string }
): Promise<IndicatorRegistry> {
  const tx = handle as Tx
  if (!tx.orgId) throw new NotBuiltError('b-evaluator:historical-registry')
  const [row] = await tx
    .select()
    .from(indicatorSnapshot)
    .where(
      and(
        eq(indicatorSnapshot.projectId, q.projectId),
        eq(indicatorSnapshot.pack, q.pack),
        sql`${indicatorSnapshot.snapshotBody}->>'registryHash' = ${q.registryHash}`
      )
    )
    .orderBy(asc(indicatorSnapshot.id))
    .limit(1)
  if (!row) throw new NotBuiltError('b-evaluator:historical-registry')
  return readEvaluatorArchive(row).registry
}
