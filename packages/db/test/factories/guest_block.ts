import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { guestBlock } from '../../src/schema'

/** A blocked device hash; G, written by `system`. */
export async function makeGuestBlock(tx: Tx<Principal>, overrides: Partial<typeof guestBlock.$inferInsert> = {}) {
  const [row] = await tx
    .insert(guestBlock)
    .values({ subjectKind: 'device', subjectHash: randomUUID(), ...overrides })
    .returning()
  return row!
}
