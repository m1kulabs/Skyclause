import { CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Notification } from '../../shared'

export const streamNotifications = createRoute({
  method: 'get',
  path: '/api/notifications/stream',
  operationId: 'streamNotifications',
  tags: ['notifications'],
  request: { headers: z.object({ 'Last-Event-ID': z.string().optional() }) },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Notification items for the signed-in account (spec §1)',
      content: { 'text/event-stream': { schema: Notification } }
    }
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})
