import { SubscriberProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { SubscriberData, SubscriberPatch, TokenParams } from './_shared'

export const updateSubscriberData = createRoute({
  method: 'patch',
  path: '/api/subscribe/{token}/data',
  operationId: 'updateSubscriberData',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    body: { required: true, content: { 'application/json': { schema: SubscriberPatch } } }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: SubscriberData } } }
  },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})
