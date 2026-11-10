import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Grade, Instant, Page, PageQuery, ReviewItem } from '../shared'

// #161: why a grade needs a person (ANL-2, ANL-4; TRD grading).
const ReviewReason = z.enum(['miss', 'false_alarm', 'expired_above_normal', 'out_of_band', 'unlisted_surge', 'no_call'])
// #161: the item's reasons, who explained it and when, and when it opened.
const ReviewItemView = ReviewItem.extend({
  grade: Grade,
  reasons: z.array(ReviewReason).optional(),
  explained_by: z.string().nullable().optional(),
  explained_at: Instant.nullable().optional(),
  opened_at: Instant.optional()
})
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
    // #161 ANL-2: `reason=no_call` lists the windows whose shadow verdict fired with no approved call.
    query: PageQuery.extend({ state: ReviewItem.shape.state.optional(), reason: ReviewReason.optional() })
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
