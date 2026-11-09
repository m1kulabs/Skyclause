import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { CallExplanation } from './_shared'

export const getCallExplanation = createRoute({
  method: 'get',
  path: '/v1/calls/{id}/explanation',
  operationId: 'getCallExplanation',
  tags: ['calls'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: CallExplanation } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})
