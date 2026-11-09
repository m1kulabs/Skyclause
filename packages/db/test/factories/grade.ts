import type { Tx } from '../../src/client'
import { call, grade } from '../../src/schema'
import { makeCall } from './call'
import { rowOf, sheetVersionIn } from './rows'

/** A grade of `callId`, or of a new call, against a new sheet version of its project. */
export async function makeGrade(tx: Tx, overrides: Partial<typeof grade.$inferInsert> = {}) {
  const parent = overrides.callId ? await rowOf(tx, call, overrides.callId) : await makeCall(tx)
  const [row] = await tx
    .insert(grade)
    .values({
      orgId: tx.orgId!,
      projectId: parent.projectId,
      pack: 'sky',
      outcome: 'correct_normal',
      modeDiff: 0,
      noCall: false,
      agrees: true,
      staleInputs: false,
      localDate: '2026-11-09',
      sheetVersionId: overrides.sheetVersionId ?? (await sheetVersionIn(tx, parent.projectId)),
      ...overrides,
      callId: parent.id
    })
    .returning()
  return row!
}
