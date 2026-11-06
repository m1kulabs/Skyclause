import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Grade, Page, PageQuery, Problem, ReviewItem } from '../shared'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

const ReviewItemView = ReviewItem.extend({ grade: Grade })
// ANL-2: explanations are editable; the shared record leaves state values to the owning ticket.
const ReviewItemPatch = ReviewItem.pick({ state: true, explanation: true })
  .partial()
  .refine((value) => value.state !== undefined || value.explanation !== undefined, {
    message: 'Provide a state or explanation'
  })

export const listReviewItems = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/review-items',
  operationId: 'listReviewItems',
  tags: ['review-items'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    query: PageQuery.extend({ state: ReviewItem.shape.state.optional() })
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(ReviewItemView) } } }
  },
  x: { owner: 'c-grades', statement: 'ledger.view', idempotent: false }
})

export const updateReviewItem = createRoute({
  method: 'patch',
  path: '/v1/review-items/{id}',
  operationId: 'updateReviewItem',
  tags: ['review-items'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    body: { required: true, content: { 'application/json': { schema: ReviewItemPatch } } }
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: ReviewItemView } } }
  },
  x: { owner: 'c-grades', statement: 'bundle.approve', idempotent: false }
})

export const routes = [listReviewItems, updateReviewItem] as const
