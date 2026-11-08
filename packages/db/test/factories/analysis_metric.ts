import type { Tx } from '../../src/client'
import { analysisMetric, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A Wilson interval for `projectId`, or for a new project. */
export async function makeAnalysisMetric(tx: Tx, overrides: Partial<typeof analysisMetric.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(analysisMetric)
    .values({
      orgId: tx.orgId!,
      metric: 'agreement',
      x: 40,
      n: 50,
      low: 0.67,
      high: 0.89,
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
