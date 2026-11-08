import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project, run } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A queued Sky run of `projectId`, or of a new project. */
export async function makeRun(tx: Tx, overrides: Partial<typeof run.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(run)
    .values({
      orgId: tx.orgId!,
      pack: 'sky',
      trigger: 'request',
      dedupeKey: `request:${randomUUID()}`,
      triggeredAt: new Date(),
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
