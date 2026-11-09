import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { Analysis, AnalysisQuery } from './_shared'

export const getProjectAnalysis = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/analysis',
  operationId: 'getProjectAnalysis',
  tags: ['analysis'],
  request: { headers: OrganizationHeaders, params: IdParams, query: AnalysisQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Analysis } } }
  },
  x: { owner: 'c-analysis-api', statement: 'ledger.view', idempotent: false }
})
