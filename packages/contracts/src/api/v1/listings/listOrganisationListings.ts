import { OrganizationHeaders as OrganizationHeader, CommonErrors as commonErrors } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Listing, Page, PageQuery } from '../../shared'

export const listOrganisationListings = createRoute({
  method: 'get',
  path: '/v1/listings',
  operationId: 'listOrganisationListings',
  tags: ['listings'],
  request: {
    headers: OrganizationHeader,
    query: PageQuery.extend({ state: z.literal('proposed') })
  },
  responses: {
    200: {
      description: 'Proposed listings across projects in the organisation',
      content: { 'application/json': { schema: Page(Listing) } }
    },
    ...commonErrors
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})
