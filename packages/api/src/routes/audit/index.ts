import type { OpenAPIHono } from '@hono/zod-openapi'
import type { ApiEnv } from '../../context'
import { takePrincipal } from '../../middleware/auth'
import { requireOrg } from '../../middleware/org'
import { ApiError } from '../../problems'
import type { Handlers } from '..'
import { inTenant } from '../../tenancy'
import { exportAuditCsv, exportAuditJson, listAuditEntries } from '../../services/audit'

// #107 a-audit-log: `GET /api/orgs/{org}/audit` and `/audit/export` (`audit.view`: Owner and Admin).
// There are no write operations; same-organisation attempts are forbidden and cross-organisation attempts stay hidden.

export const auditHandlers: Handlers = {
  listAuditEntries: {
    handler: async (c) => {
      const { limit, cursor, ...filters } = c.req.valid('query')
      return c.json(await inTenant(c, (ctx) => listAuditEntries(ctx, { filters, limit, cursor })), 200)
    }
  },
  exportAuditLog: {
    handler: async (c) => {
      const { format, ...filters } = c.req.valid('query')
      const exporter = format === 'json' ? exportAuditJson : exportAuditCsv
      const stream = await inTenant(c, (ctx) => exporter(ctx, { filters }, (fn) => inTenant(c, fn)))
      return c.body(stream, 200, {
        'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit.${format}"`
      })
    }
  }
}

/** AUD-2: refusing a write is not a registry operation and never exposes another organisation. */
export function mountAuditWriteGuards(app: OpenAPIHono<ApiEnv>) {
  for (const path of ['/api/orgs/:org/audit', '/api/orgs/:org/audit/export']) {
    app.on(['POST', 'PUT', 'PATCH', 'DELETE'], path, takePrincipal(true), requireOrg, () => {
      throw new ApiError(403, 'insufficient-scope', 'The audit log is append-only and has no write operations.')
    })
  }
}
