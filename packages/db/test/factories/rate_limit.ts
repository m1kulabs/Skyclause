import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { rateLimit } from '../../src/schema'

/** One request counted in a new bucket's current minute; `system` only (S). */
export async function makeRateLimit(tx: Tx<Principal>, overrides: Partial<typeof rateLimit.$inferInsert> = {}) {
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const [row] = await tx
    .insert(rateLimit)
    .values({
      bucket: `ip:${randomUUID()}`,
      windowStart,
      count: 1,
      resetAt: new Date(windowStart.getTime() + 60_000),
      ...overrides
    })
    .returning()
  return row!
}
