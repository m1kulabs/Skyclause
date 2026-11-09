import { createRoute } from '../../create-route'
import { AiSettings, Forbidden, NotFound, OrgParams, Unauthorized } from './_shared'

export const getOrganisationAiSettings = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/settings/ai',
  operationId: 'getOrganisationAiSettings',
  tags: ['ai-settings'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: AiSettings } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})
