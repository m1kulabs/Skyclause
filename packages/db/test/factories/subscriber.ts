import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project, subscriber } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A subscriber to `projectId`, or to a new project. */
export async function makeSubscriber(tx: Tx, overrides: Partial<typeof subscriber.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(subscriber)
    .values({ orgId: tx.orgId!, email: `${randomUUID()}@example.test`, ...overrides, projectId: parent.id })
    .returning()
  return row!
}
