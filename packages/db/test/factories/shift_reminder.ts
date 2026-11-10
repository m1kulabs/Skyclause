import type { Tx } from '../../src/client'
import { rotaShift, shiftReminder } from '../../src/schema'
import { makeRotaShift } from './rota_shift'
import { rowOf } from './rows'

/** A reminder for `rotaShiftId`, or for a new shift. */
export async function makeShiftReminder(tx: Tx, overrides: Partial<typeof shiftReminder.$inferInsert> = {}) {
  const parent = overrides.rotaShiftId ? await rowOf(tx, rotaShift, overrides.rotaShiftId) : await makeRotaShift(tx)
  const [row] = await tx
    .insert(shiftReminder)
    .values({
      orgId: tx.orgId!,
      accountId: parent.accountId,
      localDate: '2026-11-09',
      kind: 'before_shift',
      dueAt: new Date(),
      ...overrides,
      rotaShiftId: parent.id
    })
    .returning()
  return row!
}
