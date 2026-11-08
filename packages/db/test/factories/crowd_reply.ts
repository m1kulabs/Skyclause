import type { Tx } from '../../src/client'
import { crowdReply, window } from '../../src/schema'
import { makeWindow } from './window'
import { rowOf } from './rows'

/** A keep reply on `windowId`, or on a new window. */
export async function makeCrowdReply(tx: Tx, overrides: Partial<typeof crowdReply.$inferInsert> = {}) {
  const parent = overrides.windowId ? await rowOf(tx, window, overrides.windowId) : await makeWindow(tx)
  const [row] = await tx
    .insert(crowdReply)
    .values({ orgId: tx.orgId!, projectId: parent.projectId, kind: 'keep', ...overrides, windowId: parent.id })
    .returning()
  return row!
}
