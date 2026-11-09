import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { Channel, Page } from '../../shared'

export const listChannels = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/channels',
  operationId: 'listChannels',
  tags: ['channels'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Channel) } } }
  },
  x: { owner: 'c-notice-templates', statement: 'channels.manage', idempotent: false }
})
