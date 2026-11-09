import {
  NonEmptyIdParams as IdParams,
  ScopedIdempotentOrganizationHeaders as IdempotentHeaders,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { createRoute } from '../../create-route'
import { SubscriberInput, SubscriberView } from './_shared'

export const createSubscriber = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/subscribers',
  operationId: 'createSubscriber',
  tags: ['subscribers'],
  request: {
    headers: IdempotentHeaders,
    params: IdParams,
    body: { required: true, content: { 'application/json': { schema: SubscriberInput } } }
  },
  responses: {
    ...ProblemResponses,
    201: {
      description: 'Unconfirmed subscriber; only the confirmation email may be sent.',
      content: { 'application/json': { schema: SubscriberView } }
    },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: ProblemContent
    },
    503: {
      description: 'privacy-notice-unpublished: consent writes await the published PDPA notice.',
      content: ProblemContent
    }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: true }
})
