import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project } from '../../src/schema'

/** A project in the transaction's organisation. */
export async function makeProject(tx: Tx, overrides: Partial<typeof project.$inferInsert> = {}) {
  const [row] = await tx
    .insert(project)
    .values({
      orgId: tx.orgId!,
      slug: `project-${randomUUID()}`,
      name: 'Test project',
      timeZone: 'Asia/Kuala_Lumpur',
      ...overrides
    })
    .returning()
  return row!
}
