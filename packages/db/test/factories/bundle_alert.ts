import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { bundle, bundleAlert } from '../../src/schema'
import { makeBundle } from './bundle'
import { rowOf } from './rows'

/** An accepted on-duty alert for `bundleId`, or for a new bundle. */
export async function makeBundleAlert(tx: Tx, overrides: Partial<typeof bundleAlert.$inferInsert> = {}) {
  const parent = overrides.bundleId ? await rowOf(tx, bundle, overrides.bundleId) : await makeBundle(tx)
  const [row] = await tx
    .insert(bundleAlert)
    .values({
      orgId: tx.orgId!,
      accountId: randomUUID(),
      channel: 'web_push',
      level: 'on_duty',
      acceptedAt: new Date(),
      ...overrides,
      bundleId: parent.id
    })
    .returning()
  return row!
}
