import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { BundleDetail } from './_shared'

export const getBundle = createRoute({
  method: 'get',
  path: '/v1/bundles/{id}',
  operationId: 'getBundle',
  tags: ['bundles'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: BundleDetail } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})
