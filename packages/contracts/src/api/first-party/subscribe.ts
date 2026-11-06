import { IdempotencyHeaders, ProblemResponse, SubscriberProblems as CommonProblems } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Language, LocalDate, ProjectRef, Subscriber, Window } from '../shared'

const TokenParams = z.object({ token: z.string() })

const SubscriberFields = Subscriber.pick({ email: true, role: true, window_ids: true, channels: true, language: true })
const SubscriberPatch = SubscriberFields.partial()
const ConsentRecord = z.object({ at: Instant, form: z.string(), notice_version: LocalDate, language: Language })
const DeliveryRecord = z.object({
  id: z.string(),
  call_id: z.string().nullable(),
  language: Language,
  status: z.enum(['queued', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed', 'expired']),
  accepted_at: Instant.nullable()
})
const SubscriberData = z.object({
  subscriber: Subscriber,
  consent_records: z.array(ConsentRecord),
  delivery_history: z.array(DeliveryRecord)
})
const CrowdReply = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep') }),
  z.object({ kind: z.literal('shift'), shift_to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
  z.object({ kind: z.literal('shuttle') })
])

export const getSubscription = createRoute({
  method: 'get',
  path: '/api/subscribe/{token}',
  operationId: 'getSubscription',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            project: ProjectRef,
            project_name: z.string(),
            windows: z.array(Window),
            subscriber: Subscriber.nullable(),
            privacy_notice_version: LocalDate.nullable()
          })
        }
      }
    }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})

export const createSubscription = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}',
  operationId: 'createSubscription',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': { schema: SubscriberFields.extend({ consent: z.literal(true), notice_version: LocalDate }) }
      }
    }
  },
  responses: {
    ...CommonProblems,
    202: { description: 'Awaiting email confirmation', content: { 'application/json': { schema: Subscriber } } },
    503: { ...ProblemResponse, description: 'privacy-notice-unpublished' }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: true }
})

export const updateSubscription = createRoute({
  method: 'patch',
  path: '/api/subscribe/{token}',
  operationId: 'updateSubscription',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    body: { required: true, content: { 'application/json': { schema: SubscriberPatch } } }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Subscriber } } }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})

export const confirmSubscription = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/confirm',
  operationId: 'confirmSubscription',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Subscriber } } }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})

export const unsubscribeSubscription = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/unsubscribe',
  operationId: 'unsubscribeSubscription',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: { ...CommonProblems, 204: { description: 'Unsubscribed before the next notice' } },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})

export const createSubscriberReply = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/reply',
  operationId: 'createSubscriberReply',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: CrowdReply } } }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Reply recorded in the ledger',
      content: {
        'application/json': {
          schema: z.object({ id: z.string(), window_id: z.string(), reply: CrowdReply, at: Instant })
        }
      }
    }
  },
  x: { owner: 'c-recipient-replies', statement: 'token', idempotent: true }
})

export const createSubscriberFeedback = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/feedback',
  operationId: 'createSubscriberFeedback',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: z.object({ answer: z.boolean() }) } } }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Answer counted without free text',
      content: {
        'application/json': {
          schema: z.object({ window_id: z.string(), answer: z.boolean(), count: z.number().int().positive() })
        }
      }
    }
  },
  x: { owner: 'c-recipient-replies', statement: 'token', idempotent: true }
})

export const getSubscriberData = createRoute({
  method: 'get',
  path: '/api/subscribe/{token}/data',
  operationId: 'getSubscriberData',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: SubscriberData } } }
  },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})

export const updateSubscriberData = createRoute({
  method: 'patch',
  path: '/api/subscribe/{token}/data',
  operationId: 'updateSubscriberData',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    body: { required: true, content: { 'application/json': { schema: SubscriberPatch } } }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: SubscriberData } } }
  },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})

export const eraseSubscriberData = createRoute({
  method: 'delete',
  path: '/api/subscribe/{token}/data',
  operationId: 'eraseSubscriberData',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: { ...CommonProblems, 204: { description: 'Personal data erased; only a hashed suppression remains' } },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})

export const exportSubscriberData = createRoute({
  method: 'get',
  path: '/api/subscribe/{token}/data/export',
  operationId: 'exportSubscriberData',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Subscriber data returned directly',
      content: { 'application/json': { schema: SubscriberData } }
    }
  },
  x: { owner: 'a-subscriber-rights', statement: 'token', idempotent: false }
})

export const routes = [
  getSubscription,
  createSubscription,
  updateSubscription,
  confirmSubscription,
  unsubscribeSubscription,
  createSubscriberReply,
  createSubscriberFeedback,
  getSubscriberData,
  updateSubscriberData,
  eraseSubscriberData,
  exportSubscriberData
] as const
