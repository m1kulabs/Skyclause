import type { Tx } from '../../src/client'
import { webhookDelivery, webhookDispatch } from '../../src/schema'
import { makeWebhookDispatch } from './webhook_dispatch'
import { rowOf } from './rows'

/** A first delivery attempt of `dispatchId`, or of a new dispatch. */
export async function makeWebhookDelivery(tx: Tx, overrides: Partial<typeof webhookDelivery.$inferInsert> = {}) {
  const parent = overrides.dispatchId
    ? await rowOf(tx, webhookDispatch, overrides.dispatchId)
    : await makeWebhookDispatch(tx)
  const [row] = await tx
    .insert(webhookDelivery)
    .values({
      orgId: tx.orgId!,
      eventId: parent.eventId,
      attempt: 1,
      statusCode: 200,
      latencyMs: 120,
      ...overrides,
      dispatchId: parent.id
    })
    .returning()
  return row!
}
