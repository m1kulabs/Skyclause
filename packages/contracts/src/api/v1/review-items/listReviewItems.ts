import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, ReviewItem } from '../../shared'
import { ReviewItemView, ReviewReason } from './_shared'

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
