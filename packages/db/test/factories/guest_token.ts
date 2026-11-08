import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { guestToken } from '../../src/schema'

/** A read token for a new account. */
export async function makeGuestToken(tx: Tx, overrides: Partial<typeof guestToken.$inferInsert> = {}) {
  const [row] = await tx
    .insert(guestToken)
    .values({
      orgId: tx.orgId!,
      accountId: randomUUID(),
      tokenHash: randomUUID(),
      scopes: ['read'],
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides
    })
    .returning()
  return row!
}
