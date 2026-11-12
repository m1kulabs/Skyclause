import {
  SCOPE_STATEMENTS,
  V1_ROUTES,
  type BudgetGate,
  type Can,
  type Operations,
  type Principal,
  type Statement
} from '@skyclause/contracts'
import {
  budgetGate,
  getProjectRecord,
  getWindowRecord,
  latestWindowCalls,
  type WindowCallRecord,
  type WindowRow
} from '@skyclause/db'
import { z } from 'zod'
import { ApiError, validationFailed } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

type Ok<Id extends keyof Operations, S extends number> = Operations[Id] extends {
  responses: { [K in S]: { content: { 'application/json': { schema: z.ZodType<infer T> } } } }
}
  ? T
  : never
export type WindowView = Ok<'createWindow', 201>
export type WindowsQuery = z.infer<Operations['listWindows']['request']['query']>
export type WindowBody = z.infer<Operations['createWindow']['request']['body']['content']['application/json']['schema']>
export type UpdateWindowBody = z.infer<
  Operations['updateWindow']['request']['body']['content']['application/json']['schema']
>
export type WindowScope = z.infer<Operations['updateWindow']['request']['query']>['scope']

export const createOperation = V1_ROUTES.find(
  (route) => route.operationId === 'createWindow'
) as Operations['createWindow']
export const updateOperation = V1_ROUTES.find(
  (route) => route.operationId === 'updateWindow'
) as Operations['updateWindow']
export function parseInput<T>(schema: z.ZodType<T>, value: unknown, target = 'body'): T {
  const result = schema.safeParse(value)
  if (!result.success) throw validationFailed(target, result.error)
  return result.data
}

export interface WindowsAccess {
  can: Can
  now: Date
  budget?: BudgetGate
}

const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')
const denied = (statement: Statement) =>
  new ApiError(403, 'insufficient-scope', `This operation requires ${statement}.`)

/**
 * The statement check mount-all ran, again with the project (a grant or link may cover only some), then the project
 * itself in the caller's tenant: another organisation's, or an unknown, project is 404 (NFR-10).
 */
export async function openProject(ctx: ServiceContext, projectId: string, statement: Statement, access: WindowsAccess) {
  const { principal, tx } = ctx
  assertWindowsStatement(ctx, statement, access)
  if (
    !tx.orgId ||
    principal.kind === 'system' ||
    principal.orgId !== tx.orgId ||
    !z.uuid().safeParse(projectId).success ||
    (principal.kind === 'share_link' && principal.projectId !== projectId) ||
    (principal.kind === 'oauth' && principal.projectIds !== 'all' && !principal.projectIds.includes(projectId))
  )
    throw unavailable()
  if (!access.can(principal, statement, { projectId })) throw denied(statement)
  if (!(await getProjectRecord(tx, projectId))) throw unavailable()
}

export function assertWindowsStatement(ctx: ServiceContext, statement: Statement, access: WindowsAccess) {
  const { principal } = ctx
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
}

export async function openWindow(ctx: ServiceContext, id: string, access: WindowsAccess): Promise<WindowRow> {
  assertWindowsStatement(ctx, 'window.declare', access)
  declarer(ctx.principal)
  if (
    !ctx.tx.orgId ||
    ctx.principal.kind === 'system' ||
    ctx.principal.orgId !== ctx.tx.orgId ||
    !z.uuid().safeParse(id).success
  )
    throw unavailable()
  const row = await getWindowRecord(ctx.tx, id)
  if (!row) throw unavailable()
  await openProject(ctx, row.projectId, 'window.declare', access)
  if (row.guest || row.shareLinkId) throw denied('window.declare')
  return row
}

export async function consumeWindowBudget(ctx: ServiceContext, access: WindowsAccess) {
  const budget = await (access.budget ?? budgetGate).consume(ctx.tx, ctx.principal, 'window')
  if (!budget.ok)
    throw new ApiError(
      429,
      'budget-exhausted',
      'The window budget is exhausted.',
      { resets_at: budget.resetsAt },
      { 'Retry-After': String(Math.max(1, Math.ceil((Date.parse(budget.resetsAt) - access.now.getTime()) / 1000))) }
    )
}

export async function currentWindowView(ctx: ServiceContext, row: WindowRow): Promise<WindowView> {
  return windowView(row, await latestWindowCalls(ctx.tx, [row.id]))
}

type CallSummary = NonNullable<WindowView['latest_calls']['sky']>
const summary = (row: WindowCallRecord): CallSummary => ({
  id: row.id,
  bundle_id: row.bundleId,
  state: row.state,
  mode: row.mode
})

export function windowView(row: WindowRow, calls: WindowCallRecord[]): WindowView {
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

type DeclaringVia = 'app' | 'api' | 'cli' | 'mcp'

/** Who declares and how. Guests, share links and the worker are out of this slice (their budget rules aren't built). */
export function declarer(principal: Principal): { via: DeclaringVia; declaredBy: string } {
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
