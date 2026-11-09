import { SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { notificationPreferences } from './_shared'

export const getMyNotificationPreferences = createRoute({
  method: 'get',
  path: '/api/me/notification-preferences',
  operationId: 'getMyNotificationPreferences',
  tags: ['Notifications'],
  responses: {
    200: {
      description: 'The signed-in account’s notification preferences.',
      content: { 'application/json': { schema: notificationPreferences } }
    },
    ...sessionErrors
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})
