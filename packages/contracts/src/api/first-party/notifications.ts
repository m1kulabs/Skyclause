import { CommonProblems, IdParams } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Notification, Page, PageQuery } from '../shared'

export const listNotifications = createRoute({
  method: 'get',
  path: '/api/notifications',
  operationId: 'listNotifications',
  tags: ['notifications'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Notification) } } }
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})

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

export const routes = [listNotifications, streamNotifications, markNotificationRead] as const
