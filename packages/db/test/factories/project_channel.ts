import type { Tx } from '../../src/client'
import { project, projectChannel } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** The email channel of `projectId`, or of a new project. */
export async function makeProjectChannel(tx: Tx, overrides: Partial<typeof projectChannel.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(projectChannel)
    .values({ orgId: tx.orgId!, channel: 'email', ...overrides, projectId: parent.id })
    .returning()
  return row!
}
