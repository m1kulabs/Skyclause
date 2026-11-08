import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { analyticsEvent } from '../../src/schema'

/** An analytics row in the transaction's organisation (or none), as `track()` writes it; `system` only (S). */
export async function makeAnalyticsEvent(
  tx: Tx<Principal>,
  overrides: Partial<typeof analyticsEvent.$inferInsert> = {}
) {
  const [row] = await tx
    .insert(analyticsEvent)
    .values({ orgId: tx.orgId, name: 'org_created', props: { plan: 'community' }, ...overrides })
    .returning()
  return row!
}
