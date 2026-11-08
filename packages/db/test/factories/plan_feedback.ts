import type { Tx } from '../../src/client'
import { planFeedback, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** One plan-feedback answer on `projectId`, or on a new project. */
export async function makePlanFeedback(tx: Tx, overrides: Partial<typeof planFeedback.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(planFeedback)
    .values({ orgId: tx.orgId!, answer: 'yes', ...overrides, projectId: parent.id })
    .returning()
  return row!
}
