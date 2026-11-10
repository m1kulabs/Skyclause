import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { rateLimit } from '../../src/schema'

/** A one-minute window with one request for a new bucket; `system` only (S). */
export async function makeRateLimit<P extends Principal>(
  tx: Tx<P>,
  overrides: Partial<typeof rateLimit.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(rateLimit)
    .values({ bucket: `api_key:${randomUUID()}`, count: 1, resetAt: new Date(Date.now() + 60_000), ...overrides })
    .returning()
  return row!
}
