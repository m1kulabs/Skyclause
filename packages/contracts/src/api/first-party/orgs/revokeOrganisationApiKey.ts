import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const revokeOrganisationApiKey = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/api-keys/{id}',
  operationId: 'revokeOrganisationApiKey',
  tags: ['api-keys'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: false }
})
