import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { project, windowSeries } from '../schema'
import { windowTenant } from './repository'
import { projectGate } from '../gate'

/** Rotate bounded global project pages across batch slots, including wraparound. */
export async function listWindowDueProjects(tx: Tx, input: { now: Date; limit: number; stride?: number }) {
  if (tx.orgId !== null || tx.principal.kind !== 'system') throw new Error('system transaction required')
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error('invalid project limit')
  const stride = input.stride ?? input.limit
  if (!Number.isInteger(stride) || stride < 1 || stride > input.limit) throw new Error('invalid project stride')
  const [total] = await tx.select({ value: count() }).from(project)
  const n = total!.value
  if (!n) return []
  const start = (Math.floor(input.now.getTime() / 900_000) * stride) % n
  const page = (offset: number, limit: number) =>
    tx
      .select({ orgId: project.orgId, projectId: project.id })
      .from(project)
      .orderBy(asc(project.id))
      .offset(offset)
      .limit(limit)
  const first = await page(start, input.limit)
  return first.length < Math.min(input.limit, n)
    ? [...first, ...(await page(0, Math.min(input.limit, n) - first.length))]
    : first
}

/** Failed series move to the back after their error is recorded, so they do not block other due work. */
export async function listDueNativeWindowSeries(tx: Tx, input: { projectId: string; now: Date; limit: number }) {
  const orgId = windowTenant(tx)
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10) throw new Error('invalid series limit')
  if ((await projectGate(tx, input.projectId)) !== 'open') return []
  const rows = await tx
    .select({ id: windowSeries.id })
    .from(windowSeries)
    .innerJoin(project, and(eq(project.id, windowSeries.projectId), eq(project.orgId, windowSeries.orgId)))
    .where(
      and(
        eq(windowSeries.orgId, orgId),
        eq(windowSeries.projectId, input.projectId),
        isNull(windowSeries.icsFeedId),
        isNull(windowSeries.cancelledAt),
        sql`(${windowSeries.checkedOn} IS NULL OR ${windowSeries.checkedOn} < (${input.now}::timestamptz AT TIME ZONE ${project.timeZone})::date)`
      )
    )
    .orderBy(asc(windowSeries.updatedAt), asc(windowSeries.id))
    .limit(input.limit)
  return rows.map((row) => row.id)
}
