import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { createRoute } from '../../create-route'
import { WebhookDispatch } from './_shared'

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
      content: ProblemContent
    }
  },
  x: { owner: 'e-webhooks', statement: 'integrations.manage', idempotent: false }
})
