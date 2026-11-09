import {
  NonEmptyIdParams as IdParams,
  ScopedIdempotentOrganizationHeaders as IdempotentHeaders,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { createRoute } from '../../create-route'
import { SubscribeLink } from './_shared'

export const createSubscribeLink = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/subscribe-link',
  operationId: 'createSubscribeLink',
  tags: ['subscribe-link'],
  request: { headers: IdempotentHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    201: { description: 'Success', content: { 'application/json': { schema: SubscribeLink } } },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: ProblemContent
    }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: true }
})
