// #161 c-grades: one grade per call, callless window and night; a review item changes only in its explanation.
import type { Principal } from '@skyclause/contracts'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { grade, reviewItem, withRetention, withTenant, type Tx } from '../src'
import { makeGrade, makeNight, makeOrganization, makeReviewItem, makeWindow } from './factories'
import { sheetVersionIn } from './factories/rows'
import { memberOf, refusal } from './harness'

let orgId: string
const system: Principal = { kind: 'system', job: 'test-grades', client: 'worker', clientName: null }
const asApp = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const asSystem = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: system }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

const base = { pack: 'sky' as const, outcome: 'miss' as const, modeDiff: 0, noCall: false, agrees: false }
const gradeOf = (tx: Tx, values: Partial<typeof grade.$inferInsert> & { projectId: string }) =>
  sheetVersionIn(tx, values.projectId).then((sheetVersionId) =>
    tx
      .insert(grade)
      .values({ orgId, ...base, staleInputs: false, localDate: '2026-11-09', sheetVersionId, ...values })
      .returning({ id: grade.id })
  )

test('a second grade of the same call, window or night is refused', async () => {
  const first = await asSystem((tx) => makeGrade(tx))
  expect(await refusal(asSystem((tx) => makeGrade(tx, { callId: first.callId! })))).toMatch(/grade_call_id_key/)

  const window = await asSystem((tx) => makeWindow(tx))
  await asSystem((tx) => gradeOf(tx, { projectId: window.projectId, windowId: window.id }))
  expect(await refusal(asSystem((tx) => gradeOf(tx, { projectId: window.projectId, windowId: window.id })))).toMatch(
    /grade_window_id_key/
  )

  const night = await asSystem((tx) => makeNight(tx))
  const crowd = { projectId: night.projectId, nightId: night.id, pack: 'crowd' as const, outcome: 'in_band' as const }
  await asSystem((tx) => gradeOf(tx, crowd))
  expect(await refusal(asSystem((tx) => gradeOf(tx, crowd)))).toMatch(/grade_night_id_key/)
})

test('a callless window grade sits beside its calls’ grades, and a grade names a call, a night or a window', async () => {
  const called = await asSystem((tx) => makeGrade(tx))
  const windowId = (await asSystem((tx) => makeWindow(tx, { projectId: called.projectId }))).id
  await asSystem((tx) => gradeOf(tx, { projectId: called.projectId, windowId }))
  expect(await refusal(asSystem((tx) => gradeOf(tx, { projectId: called.projectId })))).toMatch(/grade_call_or_night/)
})

test('a review item’s reasons are the six the ticket names', async () => {
  const { id: gradeId } = await asSystem((tx) => makeGrade(tx))
  expect(await refusal(asSystem((tx) => makeReviewItem(tx, { gradeId, reasons: ['miss', 'late'] })))).toMatch(
    /review_item_reasons/
  )
  const item = await asSystem((tx) => makeReviewItem(tx, { gradeId, reasons: ['miss', 'no_call'] }))
  expect(item.reasons).toEqual(['miss', 'no_call'])
})

test('app and system change only a review item’s explanation, and never delete it; retention may', async () => {
  const item = await asSystem((tx) => makeReviewItem(tx, { reasons: ['false_alarm'] }))
  const where = eq(reviewItem.id, item.id)
  for (const as of [asApp, asSystem]) {
    const explained = await as((tx) =>
      tx
        .update(reviewItem)
        .set({ explanation: 'Gauge 0232901RF was under repair', explainedAt: new Date(), updatedAt: new Date() })
        .where(where)
    )
    expect(explained.rowCount).toBe(1)
    for (const change of [{ state: 'closed' }, { reasons: ['miss'] }, { gradeId: item.gradeId }]) {
      expect(await refusal(as((tx) => tx.update(reviewItem).set(change).where(where)))).toMatch(
        /permission denied for table review_item/
      )
    }
    expect(await refusal(as((tx) => tx.delete(reviewItem).where(where)))).toMatch(
      /permission denied for table review_item/
    )
    expect(await refusal(as((tx) => tx.execute(sql`TRUNCATE review_item`)))).toMatch(
      /permission denied for table review_item/
    )
  }
  const deleted = await withRetention('test-sweep', (tx) => tx.delete(reviewItem).where(where))
  expect(deleted.rowCount).toBe(1)
})
