import type { Tx } from '../../src/client'
import { consentRecord, subscriber } from '../../src/schema'
import { makeSubscriber } from './subscriber'
import { rowOf } from './rows'

/** A consent by `subscriberId`, or by a new subscriber. */
export async function makeConsentRecord(tx: Tx, overrides: Partial<typeof consentRecord.$inferInsert> = {}) {
  const parent = overrides.subscriberId ? await rowOf(tx, subscriber, overrides.subscriberId) : await makeSubscriber(tx)
  const [row] = await tx
    .insert(consentRecord)
    .values({
      orgId: tx.orgId!,
      form: 'subscribe_link',
      noticeVersion: '2026-11-01',
      language: 'en',
      ...overrides,
      subscriberId: parent.id
    })
    .returning()
  return row!
}
