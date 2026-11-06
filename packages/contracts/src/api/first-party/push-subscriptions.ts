import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Page, PageQuery, PushSubscription, Problem } from '../shared'

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

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
    headers: z.object({ 'Idempotency-Key': z.string().min(1) }),
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
  request: { params: z.object({ id: z.string() }) },
  responses: { ...CommonProblems, 204: { description: 'Device unregistered' } },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: false }
})

export const routes = [listPushSubscriptions, createPushSubscription, deletePushSubscription] as const
