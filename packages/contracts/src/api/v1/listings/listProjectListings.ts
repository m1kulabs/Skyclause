import {
  UuidIdParams as ProjectParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Listing, Page, PageQuery } from '../../shared'

export const listProjectListings = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/listings',
  operationId: 'listProjectListings',
  tags: ['listings'],
  request: { params: ProjectParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Listings proposed or accepted for the project',
      content: { 'application/json': { schema: Page(Listing) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-listings', statement: 'project.view', idempotent: false }
})
