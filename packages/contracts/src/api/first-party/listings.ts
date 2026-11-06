import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Listing, Problem } from '../shared'

// zod-to-openapi recurses indefinitely over z.json(); retain its validator and
// describe all JSON types explicitly for the OpenAPI 3.1 document.
const ListingResponse = Listing.extend({
  pending_change: Listing.shape.pending_change.openapi({
    type: ['object', 'array', 'string', 'number', 'boolean', 'null']
  })
})

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const decideListing = createRoute({
  method: 'post',
  path: '/api/listings/{id}/decide',
  operationId: 'decideListing',
  tags: ['listings'],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            action: z.enum(['list', 'reject_listing', 'approve_change', 'approve_cancel']),
            class: z.string().optional()
          })
        }
      }
    }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ListingResponse } } },
    409: { ...ProblemResponse, description: 'The listing revision has changed' }
  },
  x: { owner: 'b-listings', statement: 'listing.decide', idempotent: false }
})

export const routes = [decideListing] as const
