import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Page, PageQuery, Problem, Webhook, WebhookDelivery } from '../shared'
import { DomainEventSchema, WEBHOOK_EVENT_TYPES } from '../../events'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const IdempotentHeaders = OrganizationHeaders.extend({ 'Idempotency-Key': z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

// D38: only catalogue events may be subscribed to; a saved secret is never returned again.
const WebhookInput = Webhook.pick({ url: true, project_ids: true }).extend({
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1)
})
const WebhookView = Webhook.extend({ events: WebhookInput.shape.events })
const WebhookDeliveryView = WebhookDelivery.extend({
  state: z.string(),
  attempted_at: Instant,
  request_headers: z.record(z.string(), z.string()),
  request_body: DomainEventSchema,
  response_headers: z.record(z.string(), z.string()),
  response_body: z.string().nullable()
})
const WebhookDispatch = z.object({ dispatch_id: z.string(), event_id: z.string(), state: z.string() })

export const listWebhooks = createRoute({
  method: 'get',
  path: '/v1/webhooks',
  operationId: 'listWebhooks',
  tags: ['webhooks'],
  request: { headers: OrganizationHeaders, query: PageQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(WebhookView) } } }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const createWebhook = createRoute({
  method: 'post',
  path: '/v1/webhooks',
  operationId: 'createWebhook',
  tags: ['webhooks'],
  request: {
    headers: IdempotentHeaders,
    body: { required: true, content: { 'application/json': { schema: WebhookInput } } }
  },
  responses: {
    ...ProblemResponses,
    201: {
      description: 'Success',
      content: { 'application/json': { schema: WebhookView.extend({ secret: z.string().regex(/^skw_.+/) }) } }
    },
    422: {
      description: 'validation-failed, unsafe-url or idempotency-mismatch.',
      content: { 'application/problem+json': { schema: Problem } }
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: true }
})

export const getWebhook = createRoute({
  method: 'get',
  path: '/v1/webhooks/{id}',
  operationId: 'getWebhook',
  tags: ['webhooks'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: WebhookView } } }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const updateWebhook = createRoute({
  method: 'patch',
  path: '/v1/webhooks/{id}',
  operationId: 'updateWebhook',
  tags: ['webhooks'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: WebhookInput.partial()
            .extend({ disabled: z.boolean().optional() })
            .refine((value) => Object.keys(value).length > 0, { message: 'Provide a webhook setting' })
        }
      }
    }
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: WebhookView } } },
    422: {
      description: 'validation-failed or unsafe-url.',
      content: { 'application/problem+json': { schema: Problem } }
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const deleteWebhook = createRoute({
  method: 'delete',
  path: '/v1/webhooks/{id}',
  operationId: 'deleteWebhook',
  tags: ['webhooks'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    204: { description: 'Webhook deleted.' }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const verifyWebhook = createRoute({
  method: 'post',
  path: '/v1/webhooks/{id}/verify',
  operationId: 'verifyWebhook',
  tags: ['webhooks'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: {
      description: 'Result of sending {type: webhook.verify, challenge} and checking the echoed challenge.',
      content: { 'application/json': { schema: WebhookView } }
    },
    409: {
      description: 'webhook-unverified: the endpoint has not proved ownership.',
      content: { 'application/problem+json': { schema: Problem } }
    },
    422: {
      description: 'unsafe-url: the endpoint is not a safe public URL.',
      content: { 'application/problem+json': { schema: Problem } }
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const redeliverWebhook = createRoute({
  method: 'post',
  path: '/v1/webhooks/{id}/redeliver',
  operationId: 'redeliverWebhook',
  tags: ['webhooks'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    202: {
      description: 'Retry of the newest real event matching this webhook.',
      content: { 'application/json': { schema: WebhookDispatch } }
    },
    409: {
      description: 'no-event-yet or webhook-unverified: no event can be redelivered.',
      content: { 'application/problem+json': { schema: Problem } }
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const listWebhookDeliveries = createRoute({
  method: 'get',
  path: '/v1/webhooks/{id}/deliveries',
  operationId: 'listWebhookDeliveries',
  tags: ['webhooks'],
  request: { headers: OrganizationHeaders, params: IdParams, query: PageQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(WebhookDeliveryView) } } }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})

export const routes = [
  listWebhooks,
  createWebhook,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  verifyWebhook,
  redeliverWebhook,
  listWebhookDeliveries
] as const
