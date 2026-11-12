import { SCOPE_STATEMENTS, type Operations, type Page, type Reading } from '@skyclause/contracts'
import { listSourceReadings as readingsRoute, listSourcePolls as pollsRoute } from '@skyclause/contracts/api/v1/sources'
import { getSourceHistoryAccess, listSourceReadingRecords, listSourcePollRecords } from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import type { SourcesAccess } from '../sources'
import { serializeSourceReading, serializeSourcePoll, type SourcePollView } from './serialize'

export type SourceReadingsQuery = z.infer<Operations['listSourceReadings']['request']['query']>
export type SourcePollsQuery = z.infer<Operations['listSourcePolls']['request']['query']>
const unavailable = () => new ApiError(404, 'not-found', 'The source is unavailable.')
const forbidden = () => new ApiError(403, 'insufficient-scope', 'This operation requires project.view.')

async function authorize(ctx: ServiceContext, sourceId: string, access: SourcesAccess) {
  const { principal, tx } = ctx
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
    throw forbidden()
  if (!tx.orgId || principal.orgId !== tx.orgId || !z.uuid().safeParse(sourceId).success) throw unavailable()
  const source = await getSourceHistoryAccess(tx, sourceId)
  if (!source) throw unavailable()
  if (source.projectId !== null) {
    const projectId = source.projectId
    if (
      (principal.kind === 'share_link' && principal.projectId !== projectId) ||
      (principal.kind === 'oauth' && principal.projectIds !== 'all' && !principal.projectIds.includes(projectId))
    )
      throw unavailable()
    if (!access.can(principal, 'project.view', { projectId })) throw forbidden()
  }
}

const CursorInstant = readingsRoute.request.query.shape.from.unwrap()
const Cursor = z
  .object({
    v: z.literal(1),
    kind: z.enum(['readings', 'polls']),
    org_id: z.uuid(),
    source_id: z.uuid(),
    from: CursorInstant.nullable(),
    to: CursorInstant.nullable(),
    outcome: z.enum(['ok', 'unchanged', 'error']).nullable(),
    at: CursorInstant,
    id: z.uuid()
  })
  .strict()

function position(ctx: ServiceContext, sourceId: string, kind: 'readings' | 'polls', query: SourcePollsQuery) {
  const identity = {
    v: 1 as const,
    kind,
    org_id: ctx.tx.orgId!,
    source_id: sourceId,
    from: query.from ?? null,
    to: query.to ?? null,
    outcome: kind === 'polls' ? (query.outcome ?? null) : null
  }
  if (query.cursor === undefined) return { identity, after: undefined }
  const cursor = Cursor.safeParse(decodeCursor(query.cursor))
  if (
    !cursor.success ||
    Object.entries(identity).some(([key, value]) => cursor.data[key as keyof typeof identity] !== value)
  )
    throw new ApiError(422, 'validation-failed', 'The cursor does not match this source history query.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  return { identity, after: { at: cursor.data.at, id: cursor.data.id } }
}

/** Raw stored evidence in the caller's tenant; cursors never confer permission. */
export async function listSourceReadings(
  ctx: ServiceContext,
  input: { sourceId: string; query: SourceReadingsQuery },
  access: SourcesAccess
): Promise<Page<Reading>> {
  await authorize(ctx, input.sourceId, access)
  const parsed = readingsRoute.request.query.safeParse(input.query)
  if (!parsed.success) throw validationFailed('query', parsed.error)
  const { identity, after } = position(ctx, input.sourceId, 'readings', parsed.data)
  const rows = await listSourceReadingRecords(ctx.tx, { sourceId: input.sourceId, ...parsed.data, after })
  const result = page(rows, parsed.data.limit, (row) => ({ ...identity, at: row.observedAt, id: row.id }))
  return { data: result.data.map(serializeSourceReading), next_cursor: result.next_cursor }
}

/** Actual retained poll outcomes and diagnostics, independent of current source state. */
export async function listSourcePolls(
  ctx: ServiceContext,
  input: { sourceId: string; query: SourcePollsQuery },
  access: SourcesAccess
): Promise<Page<SourcePollView>> {
  await authorize(ctx, input.sourceId, access)
  const parsed = pollsRoute.request.query.safeParse(input.query)
  if (!parsed.success) throw validationFailed('query', parsed.error)
  const { identity, after } = position(ctx, input.sourceId, 'polls', parsed.data)
  const rows = await listSourcePollRecords(ctx.tx, { sourceId: input.sourceId, ...parsed.data, after })
  const result = page(rows, parsed.data.limit, (row) => ({ ...identity, at: row.startedAt, id: row.id }))
  return { data: result.data.map(serializeSourcePoll), next_cursor: result.next_cursor }
}
