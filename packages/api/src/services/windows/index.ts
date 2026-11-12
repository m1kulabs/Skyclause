import { type Page } from '@skyclause/contracts'
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
import { validateFields } from './fields'
import { createWindowSeries } from './series'
import { createOperation, parseInput, consumeWindowBudget } from './shared'
export { windowViolations } from './fields'
export { createWindowSeries } from './series'
export { updateWindow, cancelWindow } from './lifecycle'
export type { UpdateWindowBody, WindowScope } from './shared'
import { isMember, windowFor } from '../bundles'

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

/** The event and analytics catalogues call a browser declaration `form`. */
const CATALOGUE_VIA = { app: 'form', api: 'api', cli: 'cli', mcp: 'mcp' } as const

/** Existing declaration path and idempotency middleware; recurrence branches into the series planner. */
export async function createWindow(
  ctx: ServiceContext,
  input: { projectId: string; body: WindowBody },
  access: WindowsAccess
): Promise<WindowView> {
  const { projectId } = input
  await openProject(ctx, projectId, 'window.declare', access)
  const { via, declaredBy } = declarer(ctx.principal)
  const body = parseInput(createOperation.request.body.content['application/json'].schema, input.body)
  await validateFields(ctx, body, access.now)
  if (body.recurrence) return createWindowSeries(ctx, { projectId, body }, access)
  await consumeWindowBudget(ctx, access)
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
