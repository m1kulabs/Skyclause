import type { Tx } from '../../src/client'
import { night, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** An upcoming Crowd night of `projectId`, or of a new project. */
export async function makeNight(tx: Tx, overrides: Partial<typeof night.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(night)
    .values({ orgId: tx.orgId!, date: '2026-11-14', ...overrides, projectId: parent.id })
    .returning()
  return row!
}
