import type { Tx } from '../../src/client'
import { handledEvent } from '../../src/schema'
import { makeDomainEvent } from './domain_event'

/** `consumer`'s mark on `eventId`, or on a new event; `system` only (S), so under `withTenant` as a system principal. */
export async function makeHandledEvent(tx: Tx, overrides: Partial<typeof handledEvent.$inferInsert> = {}) {
  const eventId = overrides.eventId ?? (await makeDomainEvent(tx)).id
  const [row] = await tx
    .insert(handledEvent)
    .values({ consumer: 'test', ...overrides, eventId })
    .returning()
  return row!
}
