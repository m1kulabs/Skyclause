import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { AuditEntry, AuditFilters, Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const listAuditEntries = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/audit',
  operationId: 'listAuditEntries',
  tags: ['audit'],
  request: { params: OrgParams, query: PageQuery.extend(AuditFilters.shape) },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(AuditEntry) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-audit-log', statement: 'audit.view', idempotent: false }
})
