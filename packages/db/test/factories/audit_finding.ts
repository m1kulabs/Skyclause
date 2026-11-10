import type { Tx } from '../../src/client'
import { auditFinding } from '../../src/schema'

/** An open org condition with no recipients, stored by the system auditor. */
export async function makeAuditFinding(tx: Tx, overrides: Partial<typeof auditFinding.$inferInsert> = {}) {
  const [row] = await tx
    .insert(auditFinding)
    .values({
      check: 'factory',
      key: 'condition',
      orgId: tx.orgId,
      projectId: null,
      refType: 'project',
      refId: 'condition',
      accountIds: [],
      openedAt: new Date(),
      ...overrides
    })
    .returning()
  return row!
}
