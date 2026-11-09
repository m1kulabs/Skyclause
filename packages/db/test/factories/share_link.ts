import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project, shareLink } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A view link to `projectId`, or to a new project. */
export async function makeShareLink(tx: Tx, overrides: Partial<typeof shareLink.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(shareLink)
    .values({
      orgId: tx.orgId!,
      tokenHash: randomUUID(),
      access: 'view',
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
