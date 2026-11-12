import { SCOPE_STATEMENTS, type Can, type Operations, type Page } from '@skyclause/contracts'
import { listNights as route } from '@skyclause/contracts/api/v1/nights'
import { getProjectRecord, listProjectNightRecords, type ProjectNightRecord } from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import { instant } from '../../serialize'

export type NightView = z.infer<
  Operations['listNights']['responses'][200]['content']['application/json']['schema']
>['data'][number]
export type NightsQuery = z.infer<Operations['listNights']['request']['query']>
export type NightsAccess = { can: Can }

const Cursor = z.object({ v: z.literal(1), org_id: z.uuid(), project_id: z.uuid(), night_id: z.uuid() }).strict()
const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')

function serializeNight({ night, forecast }: ProjectNightRecord): NightView {
  return {
    id: night.id,
    project_id: night.projectId,
    date: night.date,
    state: night.state,
    // Listed by `listProjectNightRecords`, which leaves out a night without these instants.
    doors: instant(night.doors!),
    show: instant(night.show!),
    arrival_start: instant(night.arrivalStart!),
    arrival_end: instant(night.arrivalEnd!),
    exit_start: night.exitStart ? instant(night.exitStart) : null,
    exit_end: night.exitEnd ? instant(night.exitEnd) : null,
    forecast: forecast
      ? {
          id: forecast.id,
          night_id: forecast.nightId,
          baseline: forecast.baseline,
          uplift: forecast.uplift,
          forecast: forecast.forecast,
          band_low: forecast.bandLow,
          band_high: forecast.bandHigh,
          created_at: instant(forecast.createdAt),
          method: forecast.method,
          reading_ids: forecast.readingIds
        }
      : null
  }
}

/** Read only in the caller's tenant transaction, with permission checked before project lookup. */
export async function listNights(
  ctx: ServiceContext,
  input: { projectId: string; query: NightsQuery },
  access: NightsAccess
): Promise<Page<NightView>> {
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
  if (!(await getProjectRecord(tx, projectId))) throw unavailable()
  const parsed = route.request.query.safeParse(input.query)
  if (!parsed.success) throw validationFailed('query', parsed.error)
  const query = parsed.data
  let afterId: string | undefined
  if (query.cursor !== undefined) {
    const cursor = Cursor.safeParse(decodeCursor(query.cursor))
    if (!cursor.success || cursor.data.org_id !== tx.orgId || cursor.data.project_id !== projectId)
      throw new ApiError(422, 'validation-failed', 'The cursor does not match this project.', {
        errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
      })
    afterId = cursor.data.night_id
  }
  const rows = await listProjectNightRecords(tx, { projectId, limit: query.limit, afterId })
  const result = page(rows, query.limit, (row) => ({
    v: 1,
    org_id: tx.orgId!,
    project_id: projectId,
    night_id: row.night.id
  }))
  return { data: result.data.map(serializeNight), next_cursor: result.next_cursor }
}
