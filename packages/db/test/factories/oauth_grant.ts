import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { oauthGrant } from '../../src/schema'

/** An all-projects grant to a new client and account. */
export async function makeOauthGrant(tx: Tx, overrides: Partial<typeof oauthGrant.$inferInsert> = {}) {
  const [row] = await tx
    .insert(oauthGrant)
    .values({
      orgId: tx.orgId!,
      clientId: randomUUID(),
      accountId: randomUUID(),
      resource: 'mcp',
      scopes: ['read'],
      ...overrides
    })
    .returning()
  return row!
}
