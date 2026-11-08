import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { auditEvent } from '../../src/schema'

/** An audit row in the transaction's organisation, by a new account. */
export async function makeAuditEvent(tx: Tx, overrides: Partial<typeof auditEvent.$inferInsert> = {}) {
  const [row] = await tx
    .insert(auditEvent)
    .values({
      orgId: tx.orgId!,
      actorType: 'account',
      actorId: randomUUID(),
      client: 'app',
      action: 'source.bound',
      targetType: 'source',
      targetId: randomUUID(),
      ...overrides
    })
    .returning()
  return row!
}
