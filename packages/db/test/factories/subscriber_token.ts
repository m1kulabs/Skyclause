import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { subscriber, subscriberToken } from '../../src/schema'
import { makeSubscriber } from './subscriber'
import { rowOf } from './rows'

/** A manage token of `subscriberId`, or of a new subscriber. */
export async function makeSubscriberToken(tx: Tx, overrides: Partial<typeof subscriberToken.$inferInsert> = {}) {
  const parent = overrides.subscriberId ? await rowOf(tx, subscriber, overrides.subscriberId) : await makeSubscriber(tx)
  const [row] = await tx
    .insert(subscriberToken)
    .values({
      orgId: tx.orgId!,
      tokenHash: randomUUID(),
      purpose: 'manage',
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides,
      subscriberId: parent.id
    })
    .returning()
  return row!
}
