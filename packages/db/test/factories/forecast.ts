import type { Tx } from '../../src/client'
import { forecast, night } from '../../src/schema'
import { makeNight } from './night'
import { rowOf } from './rows'

/** A forecast of `nightId`, or of a new night. */
export async function makeForecast(tx: Tx, overrides: Partial<typeof forecast.$inferInsert> = {}) {
  const parent = overrides.nightId ? await rowOf(tx, night, overrides.nightId) : await makeNight(tx)
  const [row] = await tx
    .insert(forecast)
    .values({
      orgId: tx.orgId!,
      baseline: 3928,
      uplift: 1,
      forecast: 3928,
      bandLow: 3928,
      bandHigh: 3928,
      method: 'baseline',
      ...overrides,
      nightId: parent.id
    })
    .returning()
  return row!
}
