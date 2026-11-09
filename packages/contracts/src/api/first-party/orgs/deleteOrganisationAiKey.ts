import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const deleteOrganisationAiKey = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/ai-keys/{id}',
  operationId: 'deleteOrganisationAiKey',
  tags: ['ai-keys'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})
