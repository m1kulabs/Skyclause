import type { Tx } from '../../src/client'
import { run, runStep } from '../../src/schema'
import { makeRun } from './run'
import { rowOf } from './rows'

/** A finished snapshot step of `runId`, or of a new run. */
export async function makeRunStep(tx: Tx, overrides: Partial<typeof runStep.$inferInsert> = {}) {
  const parent = overrides.runId ? await rowOf(tx, run, overrides.runId) : await makeRun(tx)
  const [row] = await tx
    .insert(runStep)
    .values({ orgId: tx.orgId!, step: 'snapshot', status: 'done', ...overrides, runId: parent.id })
    .returning()
  return row!
}
