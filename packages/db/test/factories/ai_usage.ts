import type { Tx } from '../../src/client'
import { aiUsage } from '../../src/schema'

/** Platform-model usage outside a run. */
export async function makeAiUsage(tx: Tx, overrides: Partial<typeof aiUsage.$inferInsert> = {}) {
  const [row] = await tx
    .insert(aiUsage)
    .values({ orgId: tx.orgId!, model: 'gemini', tokensIn: 1, tokensOut: 1, ...overrides })
    .returning()
  return row!
}
