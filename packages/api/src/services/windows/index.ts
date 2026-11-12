import {
  NotBuiltError,
  SCOPE_STATEMENTS,
  type Can,
  type Operations,
  type Page,
  type Principal,
  type Statement
} from '@skyclause/contracts'
import {
  emitEvent,
  getProjectRecord,
  insertWindow,
  latestWindowCalls,
  listWindowRecords,
  track,
  type WindowCallRecord,
  type WindowRow
} from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { isMember, windowFor } from '../bundles'

type Ok<Id extends keyof Operations, S extends number> = Operations[Id] extends {
  responses: { [K in S]: { content: { 'application/json': { schema: z.ZodType<infer T> } } } }
}
  ? T
  : never
export type WindowView = Ok<'createWindow', 201>
export type WindowsQuery = z.infer<Operations['listWindows']['request']['query']>
export type WindowBody = z.infer<Operations['createWindow']['request']['body']['content']['application/json']['schema']>

export interface WindowsAccess {
  can: Can
  now: Date
}

const HOUR = 3_600_000
const MAX_LENGTH = 12 * HOUR
const MAX_AHEAD = 90 * 24 * HOUR
const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')
const denied = (statement: Statement) =>
  new ApiError(403, 'insufficient-scope', `This operation requires ${statement}.`)

/**
 * The statement check mount-all ran, again with the project (a grant or link may cover only some), then the project
 * itself in the caller's tenant: another organisation's, or an unknown, project is 404 (NFR-10).
 */
async function openProject(ctx: ServiceContext, projectId: string, statement: Statement, access: WindowsAccess) {
  const { principal, tx } = ctx
  const scopes =
    principal.kind === 'api_key' || principal.kind === 'oauth' || principal.kind === 'guest_token'
      ? principal.scopes
      : null
  if (
    principal.kind === 'device' ||
    principal.kind === 'system' ||
    (scopes && !scopes.some((scope) => SCOPE_STATEMENTS[scope].includes(statement))) ||
    !access.can(principal, statement)
  )
    throw denied(statement)
  if (
    !tx.orgId ||
    principal.orgId !== tx.orgId ||
    !z.uuid().safeParse(projectId).success ||
    (principal.kind === 'share_link' && principal.projectId !== projectId) ||
    (principal.kind === 'oauth' && principal.projectIds !== 'all' && !principal.projectIds.includes(projectId))
  )
    throw unavailable()
  if (!access.can(principal, statement, { projectId })) throw denied(statement)
  if (!(await getProjectRecord(tx, projectId))) throw unavailable()
}

const Cursor = z
  .object({ v: z.literal(1), org_id: z.uuid(), project_id: z.uuid(), starts_at: z.iso.datetime(), id: z.uuid() })
  .strict()

type CallSummary = NonNullable<WindowView['latest_calls']['sky']>
const summary = (row: WindowCallRecord): CallSummary => ({
  id: row.id,
  bundle_id: row.bundleId,
  state: row.state,
  mode: row.mode
})

function windowView(row: WindowRow, calls: WindowCallRecord[]): WindowView {
  const latest = (pack: 'sky' | 'crowd') => {
    const found = calls.find((entry) => entry.pack === pack)
    return found ? summary(found) : null
  }
  const sky = latest('sky')
  const crowd = latest('crowd')
  // Above Normal: a latest call whose mode is neither Normal nor No call. Watch is a flag on a Normal call.
  const risky = (call: CallSummary | null) => call !== null && call.mode !== null && call.mode !== 'normal'
  return {
    id: row.id,
    project_id: row.projectId,
    starts_at: instant(row.startsAt),
    ends_at: instant(row.endsAt),
    title: row.title,
    kind: row.kind,
    tz: row.tz,
    declared_by: row.declaredBy,
    guest: row.guest,
    via: row.via,
    expires_at: row.expiresAt ? instant(row.expiresAt) : null,
    series_id: row.seriesId,
    ics_feed_id: row.icsFeedId,
    cancelled_at: row.cancelledAt ? instant(row.cancelledAt) : null,
    share_link_id: row.shareLinkId,
    moderation: row.moderation,
    at_risk: risky(sky) || risky(crowd),
    latest_calls: { sky, crowd }
  }
}

/** `GET /v1/projects/{id}/windows`: by `starts_at` then `id`, cancelled windows included. */
export async function listWindows(
  ctx: ServiceContext,
  input: { projectId: string; query: WindowsQuery },
  access: WindowsAccess
): Promise<Page<WindowView>> {
  const { projectId, query } = input
  await openProject(ctx, projectId, 'project.view', access)
  const { tx, principal } = ctx
  if (query.from && query.to && query.to < query.from)
    throw new ApiError(422, 'validation-failed', 'The request is invalid.', {
      errors: [{ in: 'query', pointer: '/to', detail: 'Must not be before from' }]
    })
  let after: { startsAt: Date; id: string } | undefined
  if (query.cursor !== undefined) {
    const cursor = Cursor.safeParse(decodeCursor(query.cursor))
    if (!cursor.success || cursor.data.org_id !== tx.orgId || cursor.data.project_id !== projectId)
      throw new ApiError(422, 'validation-failed', 'The cursor does not match this project.', {
        errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
      })
    after = { startsAt: new Date(cursor.data.starts_at), id: cursor.data.id }
  }
  const rows = await listWindowRecords(tx, {
    projectId,
    limit: query.limit,
    after,
    from: query.from,
    to: query.to,
    kind: query.kind,
    atRisk: query.at_risk === undefined ? undefined : query.at_risk === 'true'
  })
  const result = page(rows, query.limit, (row) => ({
    v: 1,
    org_id: tx.orgId!,
    project_id: projectId,
    starts_at: row.startsAt.toISOString(),
    id: row.id
  }))
  const calls = await latestWindowCalls(
    tx,
    result.data.map((row) => row.id)
  )
  return {
    data: result.data.map((row) => {
      const view = windowView(
        row,
        calls.filter((entry) => entry.windowId === row.id)
      )
      return isMember(principal) ? view : windowFor(principal, view)
    }),
    next_cursor: result.next_cursor
  }
}

const invalid = (errors: Array<{ pointer: string; code: string; detail: string }>) =>
  new ApiError(422, 'validation-failed', 'The request is invalid.', {
    errors: errors.map((error) => ({ in: 'body', ...error }))
  })

/** WIN-8, server side. Each violation is its own field error; `code` is what the web form reads. */
export function windowViolations(body: Pick<WindowBody, 'kind' | 'starts_at' | 'ends_at' | 'tz'>, now: Date) {
  const errors: Array<{ pointer: string; code: string; detail: string }> = []
  const start = Date.parse(body.starts_at)
  const end = Date.parse(body.ends_at)
  if (!isValidZone(body.tz)) errors.push({ pointer: '/tz', code: 'invalid_tz', detail: 'Not an IANA time zone' })
  if (end < start || (end === start && body.kind !== 'commute_wave'))
    errors.push({ pointer: '/ends_at', code: 'end_before_start', detail: 'The window must end after it starts' })
  else if (end - start > MAX_LENGTH)
    errors.push({ pointer: '/ends_at', code: 'too_long', detail: 'A window is at most 12 hours long' })
  if (start > now.getTime() + MAX_AHEAD)
    errors.push({ pointer: '/starts_at', code: 'too_far', detail: 'A window starts at most 90 days ahead' })
  else if (start < now.getTime())
    errors.push({ pointer: '/starts_at', code: 'past', detail: 'A window cannot start in the past' })
  return errors
}

const ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
const isValidZone = (tz: string) => ZONES.has(tz)

type DeclaringVia = 'app' | 'api' | 'cli' | 'mcp'

/** Who declares and how. Guests, share links and the worker are out of this slice (their budget rules aren't built). */
function declarer(principal: Principal): { via: DeclaringVia; declaredBy: string } {
  const refuse = () => new ApiError(403, 'insufficient-scope', 'This principal cannot declare windows yet.')
  if (principal.kind !== 'session' && principal.kind !== 'api_key' && principal.kind !== 'oauth') throw refuse()
  if (principal.kind === 'session' && principal.isGuest) throw refuse()
  if (principal.kind === 'oauth' && principal.shareLinkId) throw refuse()
  const vias: Record<Principal['client'], DeclaringVia | null> = {
    app: 'app',
    playground: 'app',
    api: 'api',
    cli: 'cli',
    mcp: 'mcp',
    worker: null
  }
  const via = vias[principal.client]
  if (!via) throw refuse()
  return { via, declaredBy: principal.accountId }
}

/** The event and analytics catalogues call a browser declaration `form`. */
const CATALOGUE_VIA = { app: 'form', api: 'api', cli: 'cli', mcp: 'mcp' } as const

/** `POST /v1/projects/{id}/windows`: one single window. A series is not built, so `recurrence` answers 501. */
export async function createWindow(
  ctx: ServiceContext,
  input: { projectId: string; body: WindowBody },
  access: WindowsAccess
): Promise<WindowView> {
  const { projectId, body } = input
  await openProject(ctx, projectId, 'window.declare', access)
  const { via, declaredBy } = declarer(ctx.principal)
  const violations = windowViolations(body, access.now)
  if (violations.length) throw invalid(violations)
  if (body.recurrence) throw new NotBuiltError('b-windows-api')
  const row = await insertWindow(ctx.tx, {
    projectId,
    title: body.title,
    kind: body.kind,
    startsAt: new Date(body.starts_at),
    endsAt: new Date(body.ends_at),
    tz: body.tz,
    via,
    declaredBy,
    shareLinkId: null
  })
  await emitEvent(ctx.tx, {
    projectId,
    type: 'window.created',
    data: { window_id: row.id, via: CATALOGUE_VIA[via], times_changed: false, series_id: null }
  })
  await track(ctx.tx, 'window_declared', { via: CATALOGUE_VIA[via], recurring: false }, { projectId })
  return windowView(row, [])
}
