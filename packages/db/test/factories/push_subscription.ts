import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { pushSubscription } from '../../src/schema'

/** A push endpoint of a new account. */
export async function makePushSubscription(tx: Tx, overrides: Partial<typeof pushSubscription.$inferInsert> = {}) {
  const [row] = await tx
    .insert(pushSubscription)
    .values({
      orgId: tx.orgId!,
      accountId: randomUUID(),
      endpoint: `https://push.example.test/${randomUUID()}`,
      p256dh: 'p256dh',
      auth: 'auth',
      ...overrides
    })
    .returning()
  return row!
}
