import type { MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../../context'
import { requireHumanSession, requireRecentAuth } from '../../middleware/auth'
import { requireIdempotency } from '../../middleware/idempotency'
import { approveBundle } from '../../services/approvals'
import { inTenant } from '../../tenancy'
import type { Handlers } from '../index'

// #153 c-approval-api: `POST /api/bundles/{id}/approve` (#79 §4: `bundle.approve`, a human session authenticated
// within 12 hours, the Origin check and `/api`'s refusal of keys and tokens come from the mount).

/**
 * The registry marks the operation `idempotent: false`, so the app sends no key; a request that carries
 * `Idempotency-Key` gets `requireIdempotency`'s replay. A repeat without one finds the bundle no longer under review.
 */
const idempotentWhenKeyed: MiddlewareHandler<ApiEnv> = (c, next) =>
  c.req.header('Idempotency-Key') ? requireIdempotency(c, next) : next()

export const approvalHandlers: Handlers = {
  approveBundle: {
    middleware: [requireHumanSession, requireRecentAuth(12), idempotentWhenKeyed],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const { config, now } = c.get('deps')
      const { appOrigin, marketingOrigin } = config()
      const here = new URL(c.req.url).origin
      const outcome = await inTenant(c, (ctx) =>
        approveBundle(ctx, {
          id,
          ...body,
          now: now(),
          // Permalinks live on MARKETING_ORIGIN under HOST_MODE=multi, else on this host (D46).
          origin: marketingOrigin ?? here,
          origins: [...new Set([marketingOrigin, appOrigin, here].filter((o): o is string => Boolean(o)))]
        })
      )
      // A re-check's snapshot and `reconfirm` commit before their problem answers.
      if (!outcome.ok) throw outcome.problem
      return c.json(outcome.bundle, 200)
    }
  }
}
