import type { Tx } from '../../src/client'
import { webhook } from '../../src/schema'

/** An unverified webhook; its sealed secret is bytes a test never opens. */
export async function makeWebhook(tx: Tx, overrides: Partial<typeof webhook.$inferInsert> = {}) {
  const [row] = await tx
    .insert(webhook)
    .values({
      orgId: tx.orgId!,
      url: 'https://hooks.example.test/skyclause',
      secretCiphertext: 'sealed',
      secretWrappedDek: 'wrapped',
      secretKekVersion: '1',
      ...overrides
    })
    .returning()
  return row!
}
