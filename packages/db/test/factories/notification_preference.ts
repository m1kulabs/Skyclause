import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { notificationPreference } from '../../src/schema'

/** A notification switch of a new account. */
export async function makeNotificationPreference(
  tx: Tx,
  overrides: Partial<typeof notificationPreference.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(notificationPreference)
    .values({ orgId: tx.orgId!, accountId: randomUUID(), kind: 'needs_review', enabled: true, ...overrides })
    .returning()
  return row!
}
