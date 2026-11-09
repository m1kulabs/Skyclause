import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { bundle, run } from '../../src/schema'
import { makeRun } from './run'
import { rowOf } from './rows'

/** A drafted bundle of `runId`, or of a new run. */
export async function makeBundle(tx: Tx, overrides: Partial<typeof bundle.$inferInsert> = {}) {
  const parent = overrides.runId ? await rowOf(tx, run, overrides.runId) : await makeRun(tx)
  const [row] = await tx
    .insert(bundle)
    .values({
      orgId: tx.orgId!,
      projectId: parent.projectId,
      pack: parent.pack,
      reviewHash: randomUUID(),
      ...overrides,
      runId: parent.id
    })
    .returning()
  return row!
}
