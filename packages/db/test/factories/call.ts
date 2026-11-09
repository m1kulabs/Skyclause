import type { Tx } from '../../src/client'
import { bundle, call } from '../../src/schema'
import { makeBundle } from './bundle'
import { rowOf } from './rows'

/** A drafted call in `bundleId`, or in a new bundle. */
export async function makeCall(tx: Tx, overrides: Partial<typeof call.$inferInsert> = {}) {
  const parent = overrides.bundleId ? await rowOf(tx, bundle, overrides.bundleId) : await makeBundle(tx)
  const [row] = await tx
    .insert(call)
    .values({
      orgId: tx.orgId!,
      projectId: parent.projectId,
      mode: 'normal',
      shadow: {},
      chosen: 'shadow',
      agrees: true,
      expiresAt: new Date(Date.now() + 86_400_000),
      triggeredAt: new Date(),
      ...overrides,
      bundleId: parent.id
    })
    .returning()
  return row!
}
