import type { Tx } from '../../src/client'
import { clauseSheet, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A Sky clause sheet of `projectId`, or of a new project. */
export async function makeClauseSheet(tx: Tx, overrides: Partial<typeof clauseSheet.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(clauseSheet)
    .values({ orgId: tx.orgId!, pack: 'sky', ...overrides, projectId: parent.id })
    .returning()
  return row!
}
