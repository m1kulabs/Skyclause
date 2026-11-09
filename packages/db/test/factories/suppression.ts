import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { suppression } from '../../src/schema'

/** A suppressed address hash. */
export async function makeSuppression(tx: Tx, overrides: Partial<typeof suppression.$inferInsert> = {}) {
  const [row] = await tx
    .insert(suppression)
    .values({ orgId: tx.orgId!, emailHash: randomUUID(), reason: 'unsubscribe', ...overrides })
    .returning()
  return row!
}
