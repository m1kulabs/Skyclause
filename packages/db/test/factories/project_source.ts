import type { Tx } from '../../src/client'
import { project, projectSource } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'
import { makeSource } from './source'

/** A new device source bound to `projectId`, or to a new project. */
export async function makeProjectSource(tx: Tx, overrides: Partial<typeof projectSource.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(projectSource)
    .values({
      orgId: tx.orgId!,
      sourceId: overrides.sourceId ?? (await makeSource(tx, { kind: 'camera' })).id,
      role: 'camera',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
