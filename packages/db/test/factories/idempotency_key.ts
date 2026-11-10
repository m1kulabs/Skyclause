import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { idempotencyKey } from '../../src/schema'

/** A pending key for a new scope, expiring in 24 hours; `system` only (S). */
export async function makeIdempotencyKey<P extends Principal>(
  tx: Tx<P>,
  overrides: Partial<typeof idempotencyKey.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(idempotencyKey)
    .values({
      scope: `org:${randomUUID()}`,
      route: 'POST /v1/projects/:id/windows',
      key: randomUUID(),
      requestHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides
    })
    .returning()
  return row!
}
