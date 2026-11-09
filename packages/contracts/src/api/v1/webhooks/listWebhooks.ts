import { ScopedOrganizationHeaders as OrganizationHeaders, ProblemResponses } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { WebhookView } from './_shared'

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
