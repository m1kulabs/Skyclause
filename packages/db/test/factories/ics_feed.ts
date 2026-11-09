import type { Tx } from '../../src/client'
import { icsFeed, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** An uploaded calendar of `projectId`, or of a new project. */
export async function makeIcsFeed(tx: Tx, overrides: Partial<typeof icsFeed.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(icsFeed)
    .values({ orgId: tx.orgId!, filename: 'timetable.ics', ...overrides, projectId: parent.id })
    .returning()
  return row!
}
