import type { Principal, RecordAudit, TxHandle } from '@skyclause/contracts'
import type { Context } from 'hono'
import type { ApiEnv } from './context'

// Spec §1 and TRD "Tenancy enforcement": `withTenant({orgId, principal}, fn)` from `@skyclause/db` (f-db, #91).
export type WithTenant = <T>(
  ctx: { orgId: string; principal: Principal },
  fn: (tx: TxHandle) => Promise<T>
) => Promise<T>

/** What every `packages/api/src/services/<area>.ts` function takes first (spec conventions). */
export interface ServiceContext {
  principal: Principal
  tx: TxHandle
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
