import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { crossing, indicatorSnapshot } from '../../src/schema'
import { makeIndicatorSnapshot } from './indicator_snapshot'
import { rowOf } from './rows'

/** A crossing from `snapshotId`, or from a new snapshot. */
export async function makeCrossing(tx: Tx, overrides: Partial<typeof crossing.$inferInsert> = {}) {
  const parent = overrides.snapshotId
    ? await rowOf(tx, indicatorSnapshot, overrides.snapshotId)
    : await makeIndicatorSnapshot(tx)
  const [row] = await tx
    .insert(crossing)
    .values({
      orgId: tx.orgId!,
      projectId: parent.projectId,
      pack: 'sky',
      scopeKind: 'site',
      at: new Date(),
      verdictHash: randomUUID(),
      ...overrides,
      snapshotId: parent.id
    })
    .returning()
  return row!
}
