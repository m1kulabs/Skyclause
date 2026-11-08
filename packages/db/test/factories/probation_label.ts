import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { probationLabel, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'
import { makeSource } from './source'

/** A frame label on a new device source, for `projectId` or a new project. */
export async function makeProbationLabel(tx: Tx, overrides: Partial<typeof probationLabel.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(probationLabel)
    .values({
      orgId: tx.orgId!,
      sourceId: overrides.sourceId ?? (await makeSource(tx, { kind: 'camera' })).id,
      frameReadingId: randomUUID(),
      labellerId: randomUUID(),
      label: 'clear',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
