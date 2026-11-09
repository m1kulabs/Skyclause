import { createRoute } from '../../create-route'
import { ApiKey, Page, PageQuery } from '../../shared'
import { Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const listOrganisationApiKeys = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/api-keys',
  operationId: 'listOrganisationApiKeys',
  tags: ['api-keys'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(ApiKey) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: false }
})
