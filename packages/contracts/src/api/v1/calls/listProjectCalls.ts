import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { CallView, Page } from '../../shared'
import { CallQuery } from './_shared'

export const listProjectCalls = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/calls',
  operationId: 'listProjectCalls',
  tags: ['calls'],
  request: { headers: OrganizationHeaders, params: IdParams, query: CallQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(CallView) } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})
