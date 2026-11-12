import { NotBuiltError, type Page } from '@skyclause/contracts'
import { emitEvent, insertWindow, latestWindowCalls, listWindowRecords, track } from '@skyclause/db'
import {
  declarer,
  openProject,
  windowView,
  type WindowBody,
  type WindowsAccess,
  type WindowsQuery,
  type WindowView
} from './shared'
export type { WindowBody, WindowsAccess, WindowsQuery, WindowView } from './shared'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import { isMember, windowFor } from '../bundles'

const HOUR = 3_600_000
const MAX_LENGTH = 12 * HOUR
const MAX_AHEAD = 90 * 24 * HOUR
const Cursor = z
  .object({ v: z.literal(1), org_id: z.uuid(), project_id: z.uuid(), starts_at: z.iso.datetime(), id: z.uuid() })
  .strict()

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
