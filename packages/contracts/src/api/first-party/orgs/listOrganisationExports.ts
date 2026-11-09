import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Forbidden, NotFound, OrgParams, OrganisationExport, Unauthorized, ValidationFailed } from './_shared'

export const listOrganisationExports = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/exports',
  operationId: 'listOrganisationExports',
  tags: ['exports'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OrganisationExport) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-data-rights', statement: 'org.export', idempotent: false }
})
