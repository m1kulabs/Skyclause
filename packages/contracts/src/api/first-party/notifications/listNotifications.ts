import { CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Notification, Page, PageQuery } from '../../shared'

export const listNotifications = createRoute({
  method: 'get',
  path: '/api/notifications',
  operationId: 'listNotifications',
  tags: ['notifications'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          // #156: the account's unread total across every page.
          schema: Page(Notification).extend({ unread_count: z.number().int().nonnegative().optional() })
        }
      }
    }
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})
