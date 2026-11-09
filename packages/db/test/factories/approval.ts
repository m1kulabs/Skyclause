import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { approval, bundle } from '../../src/schema'
import { makeBundle } from './bundle'
import { rowOf } from './rows'

/** An approve action on `bundleId`, or on a new bundle. */
export async function makeApproval(tx: Tx, overrides: Partial<typeof approval.$inferInsert> = {}) {
  const parent = overrides.bundleId ? await rowOf(tx, bundle, overrides.bundleId) : await makeBundle(tx)
  const [row] = await tx
    .insert(approval)
    .values({
      orgId: tx.orgId!,
      projectId: parent.projectId,
      actorId: randomUUID(),
      action: 'approve',
      ...overrides,
      bundleId: parent.id
    })
    .returning()
  return row!
}
