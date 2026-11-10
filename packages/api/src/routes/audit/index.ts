import type { Handlers } from '..'
import { inTenant } from '../../tenancy'
import { exportAuditCsv, exportAuditJson, listAuditEntries } from '../../services/audit'

// #107 a-audit-log: `GET /api/orgs/{org}/audit` and `/audit/export` (`audit.view`: Owner and Admin).
// Writes 405 nowhere: no POST, PATCH, PUT or DELETE answers these paths.

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
