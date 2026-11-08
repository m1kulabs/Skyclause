import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project, subscribeLink } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A sign-up link to `projectId`, or to a new project. */
export async function makeSubscribeLink(tx: Tx, overrides: Partial<typeof subscribeLink.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(subscribeLink)
    .values({ orgId: tx.orgId!, tokenHash: randomUUID(), ...overrides, projectId: parent.id })
    .returning()
  return row!
}
