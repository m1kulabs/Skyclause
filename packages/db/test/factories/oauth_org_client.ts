import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { oauthOrgClient } from '../../src/schema'

/** A confidential client of the organisation. */
export async function makeOauthOrgClient(tx: Tx, overrides: Partial<typeof oauthOrgClient.$inferInsert> = {}) {
  const [row] = await tx
    .insert(oauthOrgClient)
    .values({ orgId: tx.orgId!, clientId: randomUUID(), ...overrides })
    .returning()
  return row!
}
