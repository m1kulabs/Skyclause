import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Listing, Page, PageQuery, Problem } from '../shared'

const ProjectParams = z.object({ id: z.uuidv7() })
const OrganizationHeader = z.object({ 'Skyclause-Organization': z.string().min(1) })
const IdempotentHeaders = OrganizationHeader.extend({ 'Idempotency-Key': z.string().min(1) })
const ListingBody = z.object({ source_url: z.url() })
const ListingView = Listing.omit({ pending_change: true }).extend({ pending_change: z.unknown().nullable() })

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})
const commonErrors = {
  400: problemResponse('Invalid request'),
  401: problemResponse('Authentication required'),
  403: problemResponse('Insufficient permission'),
  404: problemResponse('Resource not found in this organisation'),
  429: problemResponse('Rate limit exceeded')
}

export const listProjectListings = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/listings',
  operationId: 'listProjectListings',
  tags: ['listings'],
  request: { params: ProjectParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Listings proposed or accepted for the project',
      content: { 'application/json': { schema: Page(ListingView) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-listings', statement: 'project.view', idempotent: false }
})

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
    201: { description: 'A proposed event listing', content: { 'application/json': { schema: ListingView } } },
    ...commonErrors,
    422: problemResponse('The listing URL is not allow-listed or its content is invalid')
  },
  x: { owner: 'b-listings', statement: 'listing.propose', idempotent: true }
})

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
      content: { 'application/json': { schema: Page(ListingView) } }
    },
    ...commonErrors
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})

export const routes = [listProjectListings, proposeListing, listOrganisationListings] as const
