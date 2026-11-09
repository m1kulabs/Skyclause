import { ScopedOrganizationHeaders as OrganizationHeaders, ProblemResponses } from '../../common'
import { createRoute } from '../../create-route'
import { Analysis, AnalysisQuery } from './_shared'

export const getOrganisationAnalysis = createRoute({
  method: 'get',
  path: '/v1/analysis',
  operationId: 'getOrganisationAnalysis',
  tags: ['analysis'],
  request: { headers: OrganizationHeaders, query: AnalysisQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Analysis } } }
  },
  x: { owner: 'c-analysis-api', statement: 'ledger.view', idempotent: false }
})
