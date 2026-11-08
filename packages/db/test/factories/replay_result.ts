import type { Tx } from '../../src/client'
import { project, replayResult } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A stored replay of `projectId`, or of a new project. */
export async function makeReplayResult(tx: Tx, overrides: Partial<typeof replayResult.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(replayResult)
    .values({
      orgId: tx.orgId!,
      pack: 'sky',
      rangeFrom: new Date('2026-10-05T00:00:00Z'),
      rangeTo: new Date('2026-11-03T00:00:00Z'),
      summary: {},
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
