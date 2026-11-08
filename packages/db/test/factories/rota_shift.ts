import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { rotaShift } from '../../src/schema'

/** An organisation-rota shift of a new account. */
export async function makeRotaShift(tx: Tx, overrides: Partial<typeof rotaShift.$inferInsert> = {}) {
  const [row] = await tx
    .insert(rotaShift)
    .values({
      orgId: tx.orgId!,
      accountId: randomUUID(),
      days: [1, 2, 3, 4, 5],
      localStart: '08:00',
      localEnd: '17:00',
      ...overrides
    })
    .returning()
  return row!
}
