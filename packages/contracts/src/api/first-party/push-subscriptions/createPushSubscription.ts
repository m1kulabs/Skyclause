import { CommonProblems, IdempotencyHeaders } from '../../common'
import { createRoute } from '../../create-route'
import { PushSubscription } from '../../shared'

export const createPushSubscription = createRoute({
  method: 'post',
  path: '/api/push-subscriptions',
  operationId: 'createPushSubscription',
  tags: ['push-subscriptions'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: PushSubscription.pick({ endpoint: true, p256dh: true, auth: true, user_agent: true })
        }
      }
    }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Device registered for approver alerts',
      content: { 'application/json': { schema: PushSubscription } }
    }
  },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: true }
})
