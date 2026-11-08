import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { aiKey } from '../../src/schema'

/** An organisation key; its sealed fields are bytes a test never opens. */
export async function makeAiKey(tx: Tx, overrides: Partial<typeof aiKey.$inferInsert> = {}) {
  const [row] = await tx
    .insert(aiKey)
    .values({
      orgId: tx.orgId!,
      ownerType: 'organisation',
      provider: 'google',
      model: 'gemini',
      last4: 'abcd',
      fingerprint: randomUUID(),
      ciphertext: 'sealed',
      wrappedDek: 'wrapped',
      kekVersion: '1',
      declaredTier: 'paid',
      ...overrides
    })
    .returning()
  return row!
}
