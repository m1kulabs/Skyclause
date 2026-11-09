import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { Channel } from '../../shared'

export const updateChannel = createRoute({
  method: 'patch',
  path: '/v1/projects/{id}/channels/{channel}',
  operationId: 'updateChannel',
  tags: ['channels'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams.extend({ channel: Channel.shape.channel }),
    body: { required: true, content: { 'application/json': { schema: Channel.pick({ enabled: true }) } } }
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Channel } } }
  },
  x: { owner: 'c-notice-templates', statement: 'channels.manage', idempotent: false }
})
