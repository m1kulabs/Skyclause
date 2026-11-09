import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { TokenParams } from './_shared'

export const unsubscribeSubscription = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/unsubscribe',
  operationId: 'unsubscribeSubscription',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: { ...CommonProblems, 204: { description: 'Unsubscribed before the next notice' } },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})
