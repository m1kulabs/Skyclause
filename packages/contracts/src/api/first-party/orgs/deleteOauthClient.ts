import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const deleteOauthClient = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/oauth-clients/{id}',
  operationId: 'deleteOauthClient',
  tags: ['oauth-clients'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})
