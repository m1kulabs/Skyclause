import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { BundlePage, BundleQuery } from './_shared'

export const listProjectBundles = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/bundles',
  operationId: 'listProjectBundles',
  tags: ['bundles'],
  request: { headers: OrganizationHeaders, params: IdParams, query: BundleQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: BundlePage } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})
