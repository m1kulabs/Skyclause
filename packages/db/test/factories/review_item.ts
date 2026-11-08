import type { Tx } from '../../src/client'
import { grade, reviewItem } from '../../src/schema'
import { makeGrade } from './grade'
import { rowOf } from './rows'

/** A review item on `gradeId`, or on a new grade. */
export async function makeReviewItem(tx: Tx, overrides: Partial<typeof reviewItem.$inferInsert> = {}) {
  const parent = overrides.gradeId ? await rowOf(tx, grade, overrides.gradeId) : await makeGrade(tx)
  const [row] = await tx
    .insert(reviewItem)
    .values({ orgId: tx.orgId!, ...overrides, gradeId: parent.id })
    .returning()
  return row!
}
