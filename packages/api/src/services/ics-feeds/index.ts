import { SCOPE_STATEMENTS, type Can, type Operations, type Page } from '@skyclause/contracts'
import { createIcsFeed as createRoute, listIcsFeeds as route } from '@skyclause/contracts/api/v1/ics-feeds'
import {
  assertBudgetEligibility,
  getIcsFeedRecord,
  getProjectRecord,
  ICS_FEED_ERRORS,
  type IcsFeedRow,
  insertIcsFeedRecord,
  listProjectIcsFeedRecords,
  mutateIcsFeed
} from '@skyclause/db'
import { UnsafeUrlError } from '@skyclause/config/net'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import { assertWindowsStatement, declarer, openProject, parseInput } from '../windows/shared'
import { realCalendarTransport, type CalendarTransport } from '../windows/fetch-ics'
import { applyCalendar } from '../windows/apply-calendar'

export type IcsFeedView = z.infer<
  Operations['listIcsFeeds']['responses'][200]['content']['application/json']['schema']
>['data'][number]
export type IcsFeedsQuery = z.infer<Operations['listIcsFeeds']['request']['query']>
export type IcsFeedsAccess = { can: Can }
type IcsFeedBody = z.infer<Operations['createIcsFeed']['request']['body']['content']['application/json']['schema']>

const Cursor = z.object({ v: z.literal(1), org_id: z.uuid(), project_id: z.uuid(), feed_id: z.uuid() }).strict()
const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')

const storedIssue = z
  .object({ uid: z.string().nullable(), recurrenceId: z.string().nullable(), pointer: z.string(), detail: z.string() })
  .strict()

export async function getIcsFeed(
  ctx: ServiceContext,
  input: { id: string },
  access: IcsFeedsAccess
): Promise<IcsFeedView> {
  assertWindowsStatement(ctx, 'project.view', access)
  if (
    !ctx.tx.orgId ||
    ctx.principal.kind === 'system' ||
    ctx.principal.orgId !== ctx.tx.orgId ||
    !z.uuid().safeParse(input.id).success
  )
    throw unavailable()
  const row = await getIcsFeedRecord(ctx.tx, input.id)
  if (!row) throw unavailable()
  await openProject(ctx, row.projectId, 'project.view', access)
  return feedView(row, canReveal(ctx, row.projectId, access))
}

export async function createIcsFeed(
  ctx: ServiceContext,
  input: { projectId: string; body: IcsFeedBody },
  access: IcsFeedsAccess & { now: Date; transport?: CalendarTransport }
): Promise<IcsFeedView> {
  await openProject(ctx, input.projectId, 'window.declare', access)
  const provenance = declarer(ctx.principal)
  const body = parseInput(createRoute.request.body.content['application/json'].schema, input.body)
  await assertBudgetEligibility(ctx.tx, ctx.principal)
  if ('url' in body) {
    let url: URL
    try {
      url = (await (access.transport ?? realCalendarTransport).assertPublicUrl(body.url, { https: true })).url
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new ApiError(422, 'unsafe-url', 'The calendar URL is unsafe.')
      throw error
    }
    url.username = ''
    url.password = ''
    const row = await insertIcsFeedRecord(ctx.tx, {
      projectId: input.projectId,
      url: url.toString(),
      kind: body.kind,
      provenance: { version: 1, ...provenance },
      nextRefreshAt: access.now,
      createdAt: access.now,
      updatedAt: access.now
    })
    return feedView(row, true)
  }
  const row = await insertIcsFeedRecord(ctx.tx, {
    projectId: input.projectId,
    filename: body.file.name,
    kind: body.kind,
    provenance: { version: 1, ...provenance },
    createdAt: access.now,
    updatedAt: access.now
  })
  const result = await applyCalendar(ctx, {
    feedId: row.id,
    now: access.now,
    memberAccess: access,
    result: { status: 'changed', text: body.file.content, etag: null, lastModified: null }
  })
  if (result.status !== 'applied') throw unavailable()
  return feedView(result.feed, true)
}

export async function deleteIcsFeed(
  ctx: ServiceContext,
  input: { id: string },
  access: IcsFeedsAccess & { now: Date }
): Promise<IcsFeedView> {
  assertWindowsStatement(ctx, 'window.declare', access)
  declarer(ctx.principal)
  if (
    !ctx.tx.orgId ||
    ctx.principal.kind === 'system' ||
    ctx.principal.orgId !== ctx.tx.orgId ||
    !z.uuid().safeParse(input.id).success
  )
    throw unavailable()
  const row = await getIcsFeedRecord(ctx.tx, input.id)
  if (!row) throw unavailable()
  await openProject(ctx, row.projectId, 'window.declare', access)
  if (row.deletedAt) return feedView(row, true)
  const result = await mutateIcsFeed(ctx.tx, { feedId: row.id, now: access.now }, async ({ members }) => ({
    seriesCreates: [],
    seriesUpdates: [],
    changes: members
      .filter((member) => !member.cancelledAt && !member.localOverride && member.startsAt >= access.now)
      .map((member) => ({ kind: 'cancel' as const, id: member.id, origin: 'source' as const, now: access.now })),
    feedPatch: { deletedAt: access.now, refreshClaim: null, nextRefreshAt: null }
  }))
  if (result.status === 'stale') {
    const current = await getIcsFeedRecord(ctx.tx, row.id)
    if (!current) throw unavailable()
    return feedView(current, true)
  }
  return feedView(result.feed, true)
}
const storedError = z
  .object({
    version: z.literal(1),
    code: z.enum(['unsafe-url', 'fetch-failed', 'parse-failed', 'missing-document', 'unavailable'])
  })
  .strict()

function canReveal(ctx: ServiceContext, projectId: string, access: IcsFeedsAccess): boolean {
  try {
    assertWindowsStatement(ctx, 'window.declare', access)
    declarer(ctx.principal)
    return access.can(ctx.principal, 'window.declare', { projectId })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    return false
  }
}

function displayUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    return url.toString()
  } catch {
    return null
  }
}

function feedView(row: IcsFeedRow, reveal: boolean): IcsFeedView {
  let error: z.infer<typeof storedError> | null = null
  if (row.lastError) {
    try {
      error = storedError.safeParse(JSON.parse(row.lastError)).data ?? null
    } catch {
      /* Legacy errors are not exposed. */
    }
  }
  const parsed = z.array(storedIssue).safeParse(row.skipped)
  const skipped = parsed.success ? parsed.data : []
  return {
    id: row.id,
    project_id: row.projectId,
    url: reveal ? displayUrl(row.url) : null,
    ...(reveal && row.filename !== null ? { filename: row.filename } : {}),
    kind: row.kind,
    status: row.deletedAt ? 'removed' : row.lastError ? 'error' : row.refreshedAt ? 'ready' : 'pending',
    refreshed_at: row.refreshedAt?.toISOString() ?? null,
    last_attempt_at: row.lastAttemptAt?.toISOString() ?? null,
    deleted_at: row.deletedAt?.toISOString() ?? null,
    last_error: row.lastError
      ? { code: error?.code ?? 'unavailable', detail: ICS_FEED_ERRORS[error?.code ?? 'unavailable'] }
      : null,
    skipped: skipped.map((issue) => ({
      uid: reveal ? issue.uid : null,
      recurrence_id: reveal ? issue.recurrenceId : null,
      pointer: reveal ? issue.pointer : '/',
      detail: 'A calendar entry could not be imported.'
    }))
  }
}

/** Read only in the caller's tenant transaction, with permission checked before project lookup. */
export async function listIcsFeeds(
  ctx: ServiceContext,
  input: { projectId: string; query: IcsFeedsQuery },
  access: IcsFeedsAccess
): Promise<Page<IcsFeedView>> {
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
    afterId = cursor.data.feed_id
  }
  const rows = await listProjectIcsFeedRecords(tx, { projectId, limit: query.limit, afterId })
  const result = page(rows, query.limit, (row) => ({
    v: 1,
    org_id: tx.orgId!,
    project_id: projectId,
    feed_id: row.id
  }))
  return {
    data: result.data.map((row) => feedView(row, canReveal(ctx, projectId, access))),
    next_cursor: result.next_cursor
  }
}
