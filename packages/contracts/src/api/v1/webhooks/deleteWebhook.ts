import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'

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
