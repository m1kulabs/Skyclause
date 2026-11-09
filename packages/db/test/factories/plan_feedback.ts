import type { Tx } from '../../src/client'
import { planFeedback, window } from '../../src/schema'
import { makeWindow } from './window'
import { rowOf } from './rows'

/** One plan-feedback answer on `windowId`, or on a new window. */
export async function makePlanFeedback(tx: Tx, overrides: Partial<typeof planFeedback.$inferInsert> = {}) {
  const parent = overrides.windowId ? await rowOf(tx, window, overrides.windowId) : await makeWindow(tx)
  const [row] = await tx
    .insert(planFeedback)
    .values({ orgId: tx.orgId!, answer: true, ...overrides, projectId: parent.projectId, windowId: parent.id })
    .returning()
  return row!
}
