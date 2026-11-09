import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { createRoute } from '../../create-route'
import { WebhookView } from './_shared'

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
      content: ProblemContent
    },
    422: {
      description: 'unsafe-url: the endpoint is not a safe public URL.',
      content: ProblemContent
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})
