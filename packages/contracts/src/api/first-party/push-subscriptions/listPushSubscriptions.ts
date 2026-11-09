import { CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, PushSubscription } from '../../shared'

export const listPushSubscriptions = createRoute({
  method: 'get',
  path: '/api/push-subscriptions',
  operationId: 'listPushSubscriptions',
  tags: ['push-subscriptions'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(PushSubscription) } } }
  },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: false }
})
