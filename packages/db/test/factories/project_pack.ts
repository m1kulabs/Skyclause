import type { Tx } from '../../src/client'
import { projectPack } from '../../src/schema'
import { makeProject } from './project'

/** A pack of `projectId`, or of a new project in the transaction's organisation. */
export async function makeProjectPack(tx: Tx, overrides: Partial<typeof projectPack.$inferInsert> = {}) {
  const projectId = overrides.projectId ?? (await makeProject(tx)).id
  const [row] = await tx
    .insert(projectPack)
    .values({ orgId: tx.orgId!, pack: 'sky', ...overrides, projectId })
    .returning()
  return row!
}
