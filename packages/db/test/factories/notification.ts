import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { notification } from '../../src/schema'

/** An unread notification for a new account. */
export async function makeNotification(tx: Tx, overrides: Partial<typeof notification.$inferInsert> = {}) {
  const [row] = await tx
    .insert(notification)
    .values({
      orgId: tx.orgId!,
      accountId: randomUUID(),
      kind: 'needs_review',
      refType: 'bundle',
      refId: randomUUID(),
      ...overrides
    })
    .returning()
  return row!
}
