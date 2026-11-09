import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { WebhookInput, WebhookView } from './_shared'

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
      content: ProblemContent
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})
