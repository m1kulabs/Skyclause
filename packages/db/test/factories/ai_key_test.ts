import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { aiKeyTest } from '../../src/schema'

/** One minimal-call attempt, for the 10-an-hour gate. */
export async function makeAiKeyTest(tx: Tx, overrides: Partial<typeof aiKeyTest.$inferInsert> = {}) {
  const [row] = await tx
    .insert(aiKeyTest)
    .values({ orgId: tx.orgId!, fingerprint: randomUUID(), ok: true, ...overrides })
    .returning()
  return row!
}
