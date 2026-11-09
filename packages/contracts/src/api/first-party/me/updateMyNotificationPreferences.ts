import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { NotificationPreference } from '../../shared'
import { notificationPreferences, validationErrors } from './_shared'

export const updateMyNotificationPreferences = createRoute({
  method: 'patch',
  path: '/api/me/notification-preferences',
  operationId: 'updateMyNotificationPreferences',
  tags: ['Notifications'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ preferences: z.array(NotificationPreference).min(1) })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The updated notification preferences.',
      content: { 'application/json': { schema: notificationPreferences } }
    },
    ...validationErrors
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})
