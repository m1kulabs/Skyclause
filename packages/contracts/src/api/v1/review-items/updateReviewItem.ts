import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { ReviewItemPatch, ReviewItemView } from './_shared'

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
