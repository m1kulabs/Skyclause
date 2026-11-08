import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { idempotencyKey } from '../../src/schema'

/** A reserved key still in flight (no response yet); `system` only (S). */
export async function makeIdempotencyKey(
  tx: Tx<Principal>,
  overrides: Partial<typeof idempotencyKey.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(idempotencyKey)
    .values({
      scope: randomUUID(),
      route: 'POST /v1/projects/:id/windows',
      key: randomUUID(),
      requestHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides
    })
    .returning()
  return row!
}
