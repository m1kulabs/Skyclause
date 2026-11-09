import { createRoute } from '../../create-route'
import { Deletion, Forbidden, NotFound, OrgParams, Unauthorized } from './_shared'

export const getOrganisationDeletion = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/deletion',
  operationId: 'getOrganisationDeletion',
  tags: ['deletion'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Deletion } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-data-rights', statement: 'org.delete', idempotent: false }
})
