import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { forecast, night } from '../schema'

export type ProjectNightRecord = {
  night: typeof night.$inferSelect
  /** The night's newest forecast, or null while it has none. */
  forecast: typeof forecast.$inferSelect | null
}

/**
 * The project's nights by `(date, id)` after `afterId` when paging, each with its newest forecast. A night without its
 * doors, show or arrival period (an unlisted surge, D27) can't be a Night view, so it is left out; the web filters
 * unlisted nights as well, so no page loses a night it shows. The caller
 * authorizes the project first; RLS keeps other organisations' nights out.
 */
export async function listProjectNightRecords(
  tx: Tx,
  query: { projectId: string; limit: number; afterId?: string }
): Promise<ProjectNightRecord[]> {
  const rows = await tx
    .select()
    .from(night)
    .where(
      and(
        eq(night.orgId, tx.orgId!),
        eq(night.projectId, query.projectId),
        isNotNull(night.doors),
        isNotNull(night.show),
        isNotNull(night.arrivalStart),
        isNotNull(night.arrivalEnd),
        query.afterId
          ? sql`(${night.date}, ${night.id}) > (SELECT date, id FROM night WHERE id = ${query.afterId}::uuid)`
          : undefined
      )
    )
    .orderBy(asc(night.date), asc(night.id))
    .limit(query.limit + 1)
  if (!rows.length) return []
  const newest = await tx
    .selectDistinctOn([forecast.nightId])
    .from(forecast)
    .where(
      inArray(
        forecast.nightId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(asc(forecast.nightId), desc(forecast.createdAt), desc(forecast.id))
  const byNight = new Map(newest.map((row) => [row.nightId, row]))
  return rows.map((row) => ({ night: row, forecast: byNight.get(row.id) ?? null }))
}
