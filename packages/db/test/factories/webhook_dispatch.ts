import type { Tx } from '../../src/client'
import { webhook, webhookDispatch } from '../../src/schema'
import { makeWebhook } from './webhook'
import { rowOf } from './rows'
import { makeDomainEvent } from './domain_event'

/** A dispatch of a new event to `webhookId`, or to a new webhook. */
export async function makeWebhookDispatch(tx: Tx, overrides: Partial<typeof webhookDispatch.$inferInsert> = {}) {
  const parent = overrides.webhookId ? await rowOf(tx, webhook, overrides.webhookId) : await makeWebhook(tx)
  const [row] = await tx
    .insert(webhookDispatch)
    .values({
      orgId: tx.orgId!,
      eventId: overrides.eventId ?? (await makeDomainEvent(tx)).id,
      ...overrides,
      webhookId: parent.id
    })
    .returning()
  return row!
}
