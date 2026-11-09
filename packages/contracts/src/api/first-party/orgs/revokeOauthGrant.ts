import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const revokeOauthGrant = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/oauth-grants/{id}',
  operationId: 'revokeOauthGrant',
  tags: ['oauth-grants'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})
