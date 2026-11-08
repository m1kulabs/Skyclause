import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { featureFlag } from '../../src/schema'

/** A new flag, off, for the transaction's organisation (or global under `withSystem`); G, written by `system`. */
export async function makeFeatureFlag(tx: Tx<Principal>, overrides: Partial<typeof featureFlag.$inferInsert> = {}) {
  const [row] = await tx
    .insert(featureFlag)
    .values({ key: `test_${randomUUID()}`, orgId: tx.orgId, enabled: false, ...overrides })
    .returning()
  return row!
}
