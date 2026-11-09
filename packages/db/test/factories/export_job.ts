import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { exportJob } from '../../src/schema'

/** A queued export of the transaction's organisation; `system` only (S). */
export async function makeExportJob(tx: Tx<Principal>, overrides: Partial<typeof exportJob.$inferInsert> = {}) {
  const [row] = await tx
    .insert(exportJob)
    .values({ scope: 'organisation', orgId: tx.orgId, ...overrides })
    .returning()
  return row!
}
