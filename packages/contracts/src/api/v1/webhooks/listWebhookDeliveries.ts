import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { WebhookDeliveryView } from './_shared'

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
