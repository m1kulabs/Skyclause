import {
  ScopedIdempotentOrganizationHeaders as IdempotentHeaders,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { WebhookInput, WebhookView } from './_shared'

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
      content: ProblemContent
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: true }
})
