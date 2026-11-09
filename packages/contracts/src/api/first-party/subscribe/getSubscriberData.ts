import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { SubscriberData, TokenParams } from './_shared'

export const getSubscriberData = createRoute({
  method: 'get',
  path: '/api/subscribe/{token}/data',
  operationId: 'getSubscriberData',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: SubscriberData } } }
  },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})
