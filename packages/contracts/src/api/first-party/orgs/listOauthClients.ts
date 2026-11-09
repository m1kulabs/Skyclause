import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Forbidden, NotFound, OAuthClient, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const listOauthClients = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/oauth-clients',
  operationId: 'listOauthClients',
  tags: ['oauth-clients'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OAuthClient) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})
