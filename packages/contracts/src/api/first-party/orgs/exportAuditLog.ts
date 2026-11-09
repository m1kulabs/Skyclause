import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { AuditFilters, Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const exportAuditLog = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/audit/export',
  operationId: 'exportAuditLog',
  tags: ['audit'],
  request: { params: OrgParams, query: AuditFilters },
  responses: {
    200: { description: 'Success.', content: { 'text/csv': { schema: z.string() } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-audit-log', statement: 'audit.view', idempotent: false }
})
