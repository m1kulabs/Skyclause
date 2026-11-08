import type { Tx } from '../../src/client'
import { eventCounter } from '../../src/schema'
import { makeProject } from './project'

/** The counter of `projectId`, or of a new project; `system` only (S), so under `withTenant` as a system principal. */
export async function makeEventCounter(tx: Tx, overrides: Partial<typeof eventCounter.$inferInsert> = {}) {
  const projectId = overrides.projectId ?? (await makeProject(tx)).id
  const [row] = await tx
    .insert(eventCounter)
    .values({ lastSeq: 0, ...overrides, projectId })
    .returning()
  return row!
}
