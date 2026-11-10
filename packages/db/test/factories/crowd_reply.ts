import type { Tx } from '../../src/client'
import { call, crowdReply, window } from '../../src/schema'
import { makeCall } from './call'
import { makeWindow } from './window'
import { rowOf } from './rows'

/** A keep reply to `callId` on `windowId`, or to a new call on a new window. */
export async function makeCrowdReply(tx: Tx, overrides: Partial<typeof crowdReply.$inferInsert> = {}) {
  const parent = overrides.windowId ? await rowOf(tx, window, overrides.windowId) : await makeWindow(tx)
  const answered = overrides.callId
    ? await rowOf(tx, call, overrides.callId)
    : await makeCall(tx, { windowId: parent.id })
  const [row] = await tx
    .insert(crowdReply)
    .values({
      orgId: tx.orgId!,
      projectId: parent.projectId,
      kind: 'keep',
      at: new Date(),
      ...overrides,
      windowId: parent.id,
      callId: answered.id
    })
    .returning()
  return row!
}
