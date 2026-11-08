import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { poll } from '../../src/schema/partitioned'
import { makeSource } from './source'

/** A good poll of `sourceId`, or of a new source (`makeSource`'s rules), started now. */
export async function makePoll(tx: Tx<Principal>, overrides: Partial<typeof poll.$inferInsert> = {}) {
  const sourceId = overrides.sourceId ?? (await makeSource(tx)).id
  const [row] = await tx
    .insert(poll)
    .values({
      requestId: randomUUID(),
      startedAt: new Date(),
      httpStatus: 200,
      latencyMs: 180,
      outcome: 'ok',
      ...overrides,
      sourceId
    })
    .returning()
  return row!
}
