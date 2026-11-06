import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ScopedIdempotentOrganizationHeaders as IdempotentHeaders,
  ProblemResponses,
  ProblemContent
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Language, LocalDate, Page, PageQuery, Subscriber } from '../shared'

// NTC-13: an unconfirmed import has no consent yet and receives only its confirmation.
const ConsentRecord = z.object({ at: Instant, form: z.string(), notice_version: LocalDate, language: Language })
const SubscriberStatus = z.enum(['confirmed', 'unconfirmed', 'bounced', 'complained', 'suppressed', 'unsubscribed'])
const SubscriberView = Subscriber.extend({
  status: SubscriberStatus,
  suppressed: z.boolean(),
  last_notice_at: Instant.nullable(),
  consent: ConsentRecord.nullable()
})
const SubscriberInput = Subscriber.pick({ email: true, role: true, window_ids: true, channels: true, language: true })

export const listSubscribers = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/subscribers',
  operationId: 'listSubscribers',
  tags: ['subscribers'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    query: PageQuery.extend({
      window_id: z.string().optional(),
      channel: Subscriber.shape.channels.element.optional(),
      status: SubscriberStatus.optional()
    })
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(SubscriberView) } } }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: false }
})

export const createSubscriber = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/subscribers',
  operationId: 'createSubscriber',
  tags: ['subscribers'],
  request: {
    headers: IdempotentHeaders,
    params: IdParams,
    body: { required: true, content: { 'application/json': { schema: SubscriberInput } } }
  },
  responses: {
    ...ProblemResponses,
    201: {
      description: 'Unconfirmed subscriber; only the confirmation email may be sent.',
      content: { 'application/json': { schema: SubscriberView } }
    },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: ProblemContent
    },
    503: {
      description: 'privacy-notice-unpublished: consent writes await the published PDPA notice.',
      content: ProblemContent
    }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: true }
})

export const deleteSubscriber = createRoute({
  method: 'delete',
  path: '/v1/subscribers/{id}',
  operationId: 'deleteSubscriber',
  tags: ['subscribers'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    204: { description: 'Subscriber removed.' }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: false }
})

export const routes = [listSubscribers, createSubscriber, deleteSubscriber] as const
