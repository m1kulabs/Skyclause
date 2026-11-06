import { ProblemResponse, CommonProblems, IdParams } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Listing } from '../shared'

export const decideListing = createRoute({
  method: 'post',
  path: '/api/listings/{id}/decide',
  operationId: 'decideListing',
  tags: ['listings'],
  request: {
    params: IdParams,
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
    200: { description: 'Success', content: { 'application/json': { schema: Listing } } },
    409: { ...ProblemResponse, description: 'The listing revision has changed' }
  },
  x: { owner: 'b-listings', statement: 'listing.decide', idempotent: false }
})

export const routes = [decideListing] as const
