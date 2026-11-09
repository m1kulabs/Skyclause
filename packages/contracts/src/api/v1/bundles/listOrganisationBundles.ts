import { ScopedOrganizationHeaders as OrganizationHeaders, ProblemResponses } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { BundlePage, BundleQuery } from './_shared'

export const listOrganisationBundles = createRoute({
  method: 'get',
  path: '/v1/bundles',
  operationId: 'listOrganisationBundles',
  tags: ['bundles'],
  request: { headers: OrganizationHeaders, query: BundleQuery.extend({ project_id: z.string().optional() }) },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: BundlePage } } }
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})
