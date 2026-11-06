import { CommonProblems, IdParams, IdempotencyHeaders } from '../common'

import { createRoute } from '../create-route'
import { Page, PageQuery, PushSubscription } from '../shared'

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

export const deletePushSubscription = createRoute({
  method: 'delete',
  path: '/api/push-subscriptions/{id}',
  operationId: 'deletePushSubscription',
  tags: ['push-subscriptions'],
  request: { params: IdParams },
  responses: { ...CommonProblems, 204: { description: 'Device unregistered' } },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: false }
})

export const routes = [listPushSubscriptions, createPushSubscription, deletePushSubscription] as const
