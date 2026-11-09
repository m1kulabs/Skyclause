import {
  UuidIdParams as ProjectParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Listing } from '../../shared'
import { ListingBody } from './_shared'

export const proposeListing = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/listings',
  operationId: 'proposeListing',
  tags: ['listings'],
  request: {
    params: ProjectParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: ListingBody } } }
  },
  responses: {
    201: { description: 'A proposed event listing', content: { 'application/json': { schema: Listing } } },
    ...commonErrors,
    422: problemResponse('The listing URL is not allow-listed or its content is invalid')
  },
  x: { owner: 'b-listings', statement: 'listing.propose', idempotent: true }
})
