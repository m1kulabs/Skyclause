import { CommonProblems, IdParams } from '../../common'
import { createRoute } from '../../create-route'

export const deletePushSubscription = createRoute({
  method: 'delete',
  path: '/api/push-subscriptions/{id}',
  operationId: 'deletePushSubscription',
  tags: ['push-subscriptions'],
  request: { params: IdParams },
  responses: { ...CommonProblems, 204: { description: 'Device unregistered' } },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: false }
})
