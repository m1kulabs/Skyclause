import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Forbidden, NotFound, OrgParams, OrganisationOAuthGrant, Unauthorized, ValidationFailed } from './_shared'

export const listOauthGrants = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/oauth-grants',
  operationId: 'listOauthGrants',
  tags: ['oauth-grants'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OrganisationOAuthGrant) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})
