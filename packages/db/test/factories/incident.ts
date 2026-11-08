import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { incident } from '../../src/schema'

/** An open incident on our API; G, written by `system`. */
export async function makeIncident(tx: Tx<Principal>, overrides: Partial<typeof incident.$inferInsert> = {}) {
  const [row] = await tx
    .insert(incident)
    .values({ scope: 'ours', component: 'api', ...overrides })
    .returning()
  return row!
}
