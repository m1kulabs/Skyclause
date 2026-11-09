import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { Subscriber } from '../../shared'
import { SubscriberPatch, TokenParams } from './_shared'

export const updateSubscription = createRoute({
  method: 'patch',
  path: '/api/subscribe/{token}',
  operationId: 'updateSubscription',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    body: { required: true, content: { 'application/json': { schema: SubscriberPatch } } }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Subscriber } } }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})
