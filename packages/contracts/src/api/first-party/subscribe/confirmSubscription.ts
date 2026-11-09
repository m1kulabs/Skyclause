import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { Subscriber } from '../../shared'
import { TokenParams } from './_shared'

export const confirmSubscription = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/confirm',
  operationId: 'confirmSubscription',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Subscriber } } }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})
