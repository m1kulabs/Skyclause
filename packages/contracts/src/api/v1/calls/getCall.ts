import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { CallDetail } from './_shared'

export const getCall = createRoute({
  method: 'get',
  path: '/v1/calls/{id}',
  operationId: 'getCall',
  tags: ['calls'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: CallDetail } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})
