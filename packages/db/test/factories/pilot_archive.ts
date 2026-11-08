import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { pilotArchive, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A pilot run-trace archive of `projectId`, or of a new project. */
export async function makePilotArchive(tx: Tx, overrides: Partial<typeof pilotArchive.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(pilotArchive)
    .values({
      orgId: tx.orgId!,
      kind: 'run_traces',
      objectPath: `orgs/${tx.orgId}/pilot/${randomUUID()}.json`,
      sha256: '0'.repeat(64),
      capturedAt: new Date(),
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
