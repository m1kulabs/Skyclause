import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { indicatorSnapshot, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A snapshot of `projectId`, or of a new project. */
export async function makeIndicatorSnapshot(tx: Tx, overrides: Partial<typeof indicatorSnapshot.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(indicatorSnapshot)
    .values({
      orgId: tx.orgId!,
      pack: 'sky',
      tEval: new Date(),
      inputs: [],
      site: {},
      series: {},
      nights: [],
      hash: randomUUID(),
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
