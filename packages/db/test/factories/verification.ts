import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { clientVerification } from '../../src/schema'

/** A passing Claude Code check; G, written by `system`. */
export async function makeVerification(
  tx: Tx<Principal>,
  overrides: Partial<typeof clientVerification.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(clientVerification)
    .values({
      target: 'claude_code',
      clientVersion: 'test',
      testedAt: new Date(),
      result: 'pass',
      testedBy: 'test',
      ...overrides
    })
    .returning()
  return row!
}
