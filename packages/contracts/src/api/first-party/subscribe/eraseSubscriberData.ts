import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { TokenParams } from './_shared'

export const eraseSubscriberData = createRoute({
  method: 'delete',
  path: '/api/subscribe/{token}/data',
  operationId: 'eraseSubscriberData',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: { ...CommonProblems, 204: { description: 'Personal data erased; only a hashed suppression remains' } },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})
