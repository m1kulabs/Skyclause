import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { componentCheck } from '../../src/schema'

/** A passing probe of the API; G, written by `system`. */
export async function makeComponentCheck(
  tx: Tx<Principal>,
  overrides: Partial<typeof componentCheck.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(componentCheck)
    .values({ component: 'api', ok: true, ...overrides })
    .returning()
  return row!
}
