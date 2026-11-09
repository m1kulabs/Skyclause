import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { notice, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A queued call notice of `projectId`, or of a new project. */
export async function makeNotice(tx: Tx, overrides: Partial<typeof notice.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(notice)
    .values({
      orgId: tx.orgId!,
      kind: 'call',
      channel: 'email',
      idempotencyKey: randomUUID(),
      language: 'en',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
