import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { guestBudget } from '../../src/schema'

/** Today's counters for a new device hash; `system` only (S). */
export async function makeGuestBudget(tx: Tx<Principal>, overrides: Partial<typeof guestBudget.$inferInsert> = {}) {
  const [row] = await tx
    .insert(guestBudget)
    .values({
      day: new Date().toISOString().slice(0, 10),
      subjectKind: 'device',
      subjectHash: randomUUID(),
      ...overrides
    })
    .returning()
  return row!
}
