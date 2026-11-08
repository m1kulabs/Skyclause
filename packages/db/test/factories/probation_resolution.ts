import type { Tx } from '../../src/client'
import { probationResolution, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'
import { makeSource } from './source'

/** The end of a new device source's probation, for `projectId` or a new project. */
export async function makeProbationResolution(
  tx: Tx,
  overrides: Partial<typeof probationResolution.$inferInsert> = {}
) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(probationResolution)
    .values({
      orgId: tx.orgId!,
      sourceId: overrides.sourceId ?? (await makeSource(tx, { kind: 'camera' })).id,
      outcome: 'passed',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
