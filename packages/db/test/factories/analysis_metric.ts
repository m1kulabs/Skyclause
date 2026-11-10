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
      pack: 'sky',
      period: '30d',
      metric: 'agreement',
      x: 40,
      n: 50,
      value: 0.8,
      low: 0.67,
      high: 0.89,
      rangeFrom: '2026-10-11',
      rangeTo: '2026-11-09',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
