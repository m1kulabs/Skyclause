import { CommonProblems, IdParams } from '../../common'
import { createRoute } from '../../create-route'
import { Notification } from '../../shared'

export const markNotificationRead = createRoute({
  method: 'post',
  path: '/api/notifications/{id}/read',
  operationId: 'markNotificationRead',
  tags: ['notifications'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Notification } } }
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})
