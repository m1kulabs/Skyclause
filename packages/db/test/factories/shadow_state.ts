import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project, shadowState } from '../../src/schema'
import { makeProject } from './project'
import { rowOf, sheetVersionIn } from './rows'

/** The site verdict of `projectId`, or of a new project, under a new sheet version. */
export async function makeShadowState(tx: Tx, overrides: Partial<typeof shadowState.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(shadowState)
    .values({
      orgId: tx.orgId!,
      pack: 'sky',
      scopeKind: 'site',
      verdict: {},
      verdictHash: randomUUID(),
      since: new Date(),
      sheetVersionId: overrides.sheetVersionId ?? (await sheetVersionIn(tx, parent.id)),
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
