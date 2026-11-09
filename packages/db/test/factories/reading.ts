import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { reading } from '../../src/schema/partitioned'
import { makeSource } from './source'

/** A 5-minute rain reading of `sourceId`, or of a new source (`makeSource`'s rules), observed now. */
export async function makeReading(tx: Tx<Principal>, overrides: Partial<typeof reading.$inferInsert> = {}) {
  const sourceId = overrides.sourceId ?? (await makeSource(tx)).id
  const [row] = await tx
    .insert(reading)
    .values({ metric: 'rain_5m_mm', unit: 'mm', observedAt: new Date(), value: 0, ...overrides, sourceId })
    .returning()
  return row!
}
