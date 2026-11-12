import { SCOPE_STATEMENTS, type Operations, type Page } from '@skyclause/contracts'
import { listProjectSources as route } from '@skyclause/contracts/api/v1/sources'
import { getProjectRecord, listProjectSourceRecords } from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import type { SourcesAccess } from '../sources'
import { serializeProjectSourceHealth, type ProjectSourceHealthView } from './serialize'

export type { ProjectSourceHealthView } from './serialize'
export { serializeProjectSourceHealth } from './serialize'
export type ProjectSourcesQuery = z.infer<Operations['listProjectSources']['request']['query']>

const Cursor = z.object({ v: z.literal(1), org_id: z.uuid(), project_id: z.uuid(), binding_id: z.uuid() }).strict()
const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')

/** Read only in the caller's tenant transaction, with permission checked before project lookup. */
export async function listProjectSources(
  ctx: ServiceContext,
  input: { projectId: string; query: ProjectSourcesQuery },
  access: SourcesAccess
): Promise<Page<ProjectSourceHealthView>> {
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
    afterId = cursor.data.binding_id
  }
  const rows = await listProjectSourceRecords(tx, { projectId, limit: query.limit, afterId, now: access.now })
  const result = page(rows, query.limit, (row) => ({
    v: 1,
    org_id: tx.orgId!,
    project_id: projectId,
    binding_id: row.bindingId
  }))
  return {
    data: result.data.map((row) => serializeProjectSourceHealth(row, access.now)),
    next_cursor: result.next_cursor
  }
}

export { listSourceReadings, listSourcePolls, type SourceReadingsQuery, type SourcePollsQuery } from './history'
export { serializeSourceReading, serializeSourcePoll, type SourcePollView } from './serialize'
export { getProjectStrip, rainLanes, STRIP_RANGE_MS, type ProjectStripView } from './strip'
