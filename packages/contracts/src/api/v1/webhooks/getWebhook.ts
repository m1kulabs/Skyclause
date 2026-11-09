import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { WebhookView } from './_shared'

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
