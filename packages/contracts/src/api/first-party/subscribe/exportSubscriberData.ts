import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { SubscriberData, TokenParams } from './_shared'

export const exportSubscriberData = createRoute({
  method: 'get',
  path: '/api/subscribe/{token}/data/export',
  operationId: 'exportSubscriberData',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Subscriber data returned directly',
      content: { 'application/json': { schema: SubscriberData } }
    }
  },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})
