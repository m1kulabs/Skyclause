import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { handledMessage } from '../../src/schema'

/** `consumer`'s mark on an SES message; `system` only (S), so under `withTenant` as a system principal. */
export async function makeHandledMessage(tx: Tx, overrides: Partial<typeof handledMessage.$inferInsert> = {}) {
  const [row] = await tx
    .insert(handledMessage)
    .values({ consumer: 'test', messageId: `0100019a${randomUUID().replaceAll('-', '')}-000000`, ...overrides })
    .returning()
  return row!
}
