import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { ownershipTransfer } from '../../src/schema'
import { makeMember } from './member'

/** A pending transfer between two new members of the organisation. */
export async function makeOwnershipTransfer(tx: Tx, overrides: Partial<typeof ownershipTransfer.$inferInsert> = {}) {
  const [row] = await tx
    .insert(ownershipTransfer)
    .values({
      orgId: tx.orgId!,
      fromMemberId: overrides.fromMemberId ?? (await makeMember({ organizationId: tx.orgId! })).id,
      toMemberId: overrides.toMemberId ?? (await makeMember({ organizationId: tx.orgId! })).id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides
    })
    .returning()
  return row!
}
