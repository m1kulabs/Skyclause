import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { sourceState } from '../../src/schema'
import { makeSource } from './source'

/** The fresh state of `sourceId`, or of a new source (`makeSource`'s rules). */
export async function makeSourceState(tx: Tx<Principal>, overrides: Partial<typeof sourceState.$inferInsert> = {}) {
  const sourceId = overrides.sourceId ?? (await makeSource(tx)).id
  const [row] = await tx
    .insert(sourceState)
    .values({ state: 'fresh', since: new Date(), ...overrides, sourceId })
    .returning()
  return row!
}
