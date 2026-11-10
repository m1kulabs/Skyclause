import type { Principal, RecordAudit } from '@skyclause/contracts'
import type { Tx, withTenant } from '@skyclause/db'
import type { Context } from 'hono'
import type { ApiEnv } from './context'

/** Spec §1 and TRD "Tenancy enforcement": `@skyclause/db`'s `withTenant({orgId, principal}, fn)` (f-db, #91). */
export type WithTenant = typeof withTenant

/** What every `packages/api/src/services/<area>.ts` function takes first (spec conventions). */
export interface ServiceContext {
  principal: Principal
  tx: Tx
}

/**
 * The route-to-service seam: opens `withTenant` for the request's principal and organisation, so a handler reads
 * `inTenant(c, (ctx) => listWindows(ctx, input))`.
 */
export function inTenant<T>(c: Context<ApiEnv>, fn: (ctx: ServiceContext) => Promise<T>): Promise<T> {
  const principal = c.get('principal')
  const orgId = c.get('orgId')
  if (!principal || !orgId) throw new Error('inTenant needs requireOrg to have run on this route')
  return c.get('deps').withTenant({ orgId, principal }, (tx) => fn({ principal, tx }))
}

/** One audit row in its own `withTenant` transaction, for the middleware's own audits (GST-7, AGT-6, D30). */
export function auditIn(
  c: Context<ApiEnv>,
  ctx: { orgId: string; principal: Principal },
  entry: Parameters<RecordAudit>[1]
): Promise<void> {
  const { withTenant, recordAudit } = c.get('deps')
  return withTenant(ctx, (tx) => recordAudit(tx, entry))
}
