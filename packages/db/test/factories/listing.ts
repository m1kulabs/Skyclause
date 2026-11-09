import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { listing, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A proposed listing of `projectId`, or of a new project. */
export async function makeListing(tx: Tx, overrides: Partial<typeof listing.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(listing)
    .values({
      orgId: tx.orgId!,
      listingKey: randomUUID(),
      sourceUrl: 'https://en.wikipedia.org/wiki/Bukit_Jalil_National_Stadium',
      sourceRevision: '1',
      class: 'stadium_concert',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
