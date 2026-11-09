import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { SubscriberCounts } from './_shared'

export const getSubscriberCounts = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/subscriber-counts',
  operationId: 'getSubscriberCounts',
  tags: ['subscriber-counts'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: SubscriberCounts } } }
  },
  x: { owner: 'c-subscribers', statement: 'project.view', idempotent: false }
})
