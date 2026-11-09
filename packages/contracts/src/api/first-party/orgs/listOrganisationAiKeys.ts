import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Forbidden, NotFound, OrgParams, OrganisationAiKey, Unauthorized, ValidationFailed } from './_shared'

export const listOrganisationAiKeys = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/ai-keys',
  operationId: 'listOrganisationAiKeys',
  tags: ['ai-keys'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OrganisationAiKey) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})
