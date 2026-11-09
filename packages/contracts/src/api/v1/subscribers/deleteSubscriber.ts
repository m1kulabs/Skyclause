import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'

export const deleteSubscriber = createRoute({
  method: 'delete',
  path: '/v1/subscribers/{id}',
  operationId: 'deleteSubscriber',
  tags: ['subscribers'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    204: { description: 'Subscriber removed.' }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: false }
})
