import { SCOPE_STATEMENTS, type Operations, type Page } from '@skyclause/contracts'
import { listProjectDays as route } from '@skyclause/contracts/api/v1/days'
import { getProjectRecord, listProjectDayRecords, localDateAt, type ProjectDayRecord } from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, encodeCursor } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import type { SourcesAccess } from '../sources'

export type ProjectDaysQuery = z.infer<Operations['listProjectDays']['request']['query']>
export type ProjectDayView = {
  date: string
  reading_count: number
  error_count: number
  window_count: number
  storm_afternoon: { wording: string; source_url: string } | null
}

/** The days listed: the project's local week behind today and the two weeks ahead, the span the Windows page draws. */
const DAYS_BEHIND = 6
const DAYS_AHEAD = 13

const Cursor = z.object({ v: z.literal(1), org_id: z.uuid(), project_id: z.uuid(), date: z.iso.date() }).strict()
const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')

const shift = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

/** A day's MET storm afternoon: the stored forecast says it (`value` 1) and carries the wording to quote. */
function stormAfternoon(forecast: ProjectDayRecord['forecast']) {
  if (!forecast || forecast.value !== 1 || !forecast.afternoon?.trim()) return null
  return { wording: forecast.afternoon, source_url: forecast.sourceUrl }
}

/** Read only in the caller's tenant transaction, with permission checked before project lookup. */
export async function listProjectDays(
  ctx: ServiceContext,
  input: { projectId: string; query: ProjectDaysQuery },
  access: SourcesAccess
): Promise<Page<ProjectDayView>> {
  const { principal, tx } = ctx
  const { projectId } = input
  const scopes =
    principal.kind === 'api_key' || principal.kind === 'oauth' || principal.kind === 'guest_token'
      ? principal.scopes
      : null
  if (
    principal.kind === 'device' ||
    principal.kind === 'system' ||
    (scopes && !scopes.some((scope) => SCOPE_STATEMENTS[scope].includes('project.view'))) ||
    !access.can(principal, 'project.view')
  )
    throw new ApiError(403, 'insufficient-scope', 'This operation requires project.view.')
  if (
    !tx.orgId ||
    principal.orgId !== tx.orgId ||
    !z.uuid().safeParse(projectId).success ||
    (principal.kind === 'share_link' && principal.projectId !== projectId) ||
    (principal.kind === 'oauth' && principal.projectIds !== 'all' && !principal.projectIds.includes(projectId))
  )
    throw unavailable()
  if (!access.can(principal, 'project.view', { projectId }))
    throw new ApiError(403, 'insufficient-scope', 'This operation requires project.view.')
  const found = await getProjectRecord(tx, projectId)
  if (!found) throw unavailable()
  const parsed = route.request.query.safeParse(input.query)
  if (!parsed.success) throw validationFailed('query', parsed.error)
  const query = parsed.data
  let after: string | undefined
  if (query.cursor !== undefined) {
    const cursor = Cursor.safeParse(decodeCursor(query.cursor))
    if (!cursor.success || cursor.data.org_id !== tx.orgId || cursor.data.project_id !== projectId)
      throw new ApiError(422, 'validation-failed', 'The cursor does not match this project.', {
        errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
      })
    after = cursor.data.date
  }
  const zone = found.project.timeZone
  const today = await localDateAt(tx, access.now, zone)
  const first =
    after !== undefined && after >= shift(today, -DAYS_BEHIND) ? shift(after, 1) : shift(today, -DAYS_BEHIND)
  const last = shift(today, DAYS_AHEAD)
  const remaining = Math.max(0, Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1)
  const shown = Math.min(query.limit, remaining)
  if (!shown) return { data: [], next_cursor: null }
  const through = shift(first, shown - 1)
  const records = await listProjectDayRecords(tx, { projectId, zone, from: first, to: through, now: access.now })
  return {
    data: records.map((row) => ({
      date: row.date,
      reading_count: row.readingCount,
      error_count: row.errorCount,
      window_count: row.windowCount,
      storm_afternoon: stormAfternoon(row.forecast)
    })),
    next_cursor:
      remaining > shown ? encodeCursor({ v: 1, org_id: tx.orgId, project_id: projectId, date: through }) : null
  }
}
