import type { Tx } from '../../src/client'
import { project, windowSeries } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A weekly series of `projectId`, or of a new project. */
export async function makeWindowSeries(tx: Tx, overrides: Partial<typeof windowSeries.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(windowSeries)
    .values({
      orgId: tx.orgId!,
      rule: { freq: 'weekly' },
      localStart: '14:00',
      localEnd: '16:00',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
