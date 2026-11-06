import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'

import { createRoute } from '../create-route'
import { Grade, Page, PageQuery, ReviewItem } from '../shared'

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
