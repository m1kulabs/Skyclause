import { and, desc, eq, getTableColumns, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import type { Tx } from '../client'
import { forecast, grade, project, reviewItem } from '../schema'
import { crowdNights, liveSheet, projectDateAt, railStation } from './candidates'

// #161 c-grades: the reads behind GET /v1/projects/{id}/{grades,review-items} and PATCH /v1/review-items/{id}, in the
// caller's `withTenant` transaction.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The project's local date at `now`. */
export async function projectToday(tx: Tx, projectId: string, now: Date) {
  const [row] = await tx
    .select({ today: projectDateAt(now) })
    .from(project)
    .where(eq(project.id, projectId))
  return row?.today ?? null
}

export interface GradeFilters {
  packs: Array<'sky' | 'crowd'>
  outcome?: string
  from?: string
  to?: string
}

/** Up to `limit` grades newest first by `(local_date, id)` below `before`, each with the forecast it was graded on. */
export function listGradeRows(
  tx: Tx,
  q: GradeFilters & { projectId: string; before?: { localDate: string; id: string }; limit: number }
) {
  const where: SQL[] = [eq(grade.projectId, q.projectId), inArray(grade.pack, q.packs)]
  if (q.outcome) where.push(sql`${grade.outcome} = ${q.outcome}`)
  if (q.from) where.push(gte(grade.localDate, q.from))
  if (q.to) where.push(lte(grade.localDate, q.to))
  if (q.before) where.push(sql`(${grade.localDate}, ${grade.id}) < (${q.before.localDate}::date, ${q.before.id}::uuid)`)
  return tx
    .select({ grade: getTableColumns(grade), forecast: getTableColumns(forecast) })
    .from(grade)
    .leftJoin(forecast, eq(forecast.id, grade.forecastId))
    .where(and(...where))
    .orderBy(desc(grade.localDate), desc(grade.id))
    .limit(q.limit)
}

/**
 * Listed nights before today that have no grade yet (ANL-3's "pending"), with the forecast they will be graded on,
 * when the rail file is next due, and the live Crowd version they'll be graded under. None without a live Crowd sheet.
 */
export async function pendingNights(tx: Tx, q: { projectId: string; today: string }) {
  const live = await liveSheet(tx, q.projectId, 'crowd')
  if (!live) return []
  const [nights, station] = await Promise.all([
    crowdNights(tx, { projectId: q.projectId, before: q.today }),
    railStation(tx, q.projectId)
  ])
  return nights.map((night) => ({
    ...night,
    pendingUntil: station?.pendingUntil ?? null,
    sheetVersionId: live.versionId
  }))
}

/** Up to `limit` review items of the project's grades, newest first, below `beforeId`. */
export function listReviewItemRows(tx: Tx, q: { projectId: string; state?: string; beforeId?: string; limit: number }) {
  const where: SQL[] = [eq(grade.projectId, q.projectId)]
  if (q.state) where.push(eq(reviewItem.state, q.state))
  if (q.beforeId) where.push(sql`${reviewItem.id} < ${q.beforeId}::uuid`)
  return tx
    .select({ item: getTableColumns(reviewItem), grade: getTableColumns(grade) })
    .from(reviewItem)
    .innerJoin(grade, eq(grade.id, reviewItem.gradeId))
    .where(and(...where))
    .orderBy(desc(reviewItem.id))
    .limit(q.limit)
}

/** The project a review item's grade belongs to, or null when this transaction can't see the item. */
export async function reviewItemProject(tx: Tx, id: string) {
  if (!UUID.test(id)) return null
  const [row] = await tx
    .select({ projectId: grade.projectId })
    .from(reviewItem)
    .innerJoin(grade, eq(grade.id, reviewItem.gradeId))
    .where(eq(reviewItem.id, id))
  return row?.projectId ?? null
}

/** Sets a review item's explanation and who gave it when (the only columns that change); the item and its grade. */
export async function explainReviewItem(
  tx: Tx,
  q: { id: string; explanation: string; accountId: string | null; at: Date }
) {
  await tx
    .update(reviewItem)
    .set({ explanation: q.explanation, explainedBy: q.accountId, explainedAt: q.at, updatedAt: q.at })
    .where(eq(reviewItem.id, q.id))
  const [row] = await tx
    .select({ item: getTableColumns(reviewItem), grade: getTableColumns(grade) })
    .from(reviewItem)
    .innerJoin(grade, eq(grade.id, reviewItem.gradeId))
    .where(eq(reviewItem.id, q.id))
  return row!
}
