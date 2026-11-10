import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { evidenceRequest, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** An evidence request on `projectId`, or on a new project. */
export async function makeEvidenceRequest(tx: Tx, overrides: Partial<typeof evidenceRequest.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(evidenceRequest)
    .values({
      orgId: tx.orgId!,
      spanFrom: new Date('2026-11-02T06:00:00Z'),
      spanTo: new Date('2026-11-02T08:00:00Z'),
      requester: randomUUID(),
      requesterKind: 'member',
      via: 'app',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
