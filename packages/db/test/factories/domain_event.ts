import type { Tx } from '../../src/client'
import { domainEvent, project } from '../../src/schema'
import { makeProject } from './project'
import { nextSeq, rowOf } from './rows'

/** The next event of `projectId`, or the first of a new project. */
export async function makeDomainEvent(tx: Tx, overrides: Partial<typeof domainEvent.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(domainEvent)
    .values({
      orgId: tx.orgId!,
      seq: overrides.seq ?? (await nextSeq(tx, 'domain_event', parent.id)),
      type: 'source.bound',
      data: {},
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
