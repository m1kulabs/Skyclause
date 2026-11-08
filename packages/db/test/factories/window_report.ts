import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { window, windowReport } from '../../src/schema'
import { makeWindow } from './window'
import { rowOf } from './rows'

/** A report on `windowId`, or on a new window. */
export async function makeWindowReport(tx: Tx, overrides: Partial<typeof windowReport.$inferInsert> = {}) {
  const parent = overrides.windowId ? await rowOf(tx, window, overrides.windowId) : await makeWindow(tx)
  const [row] = await tx
    .insert(windowReport)
    .values({ orgId: tx.orgId!, deviceHash: randomUUID(), ...overrides, windowId: parent.id })
    .returning()
  return row!
}
