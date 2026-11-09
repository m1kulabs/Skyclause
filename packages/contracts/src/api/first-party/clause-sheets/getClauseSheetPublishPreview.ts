import { IdParams, ProblemResponse, ReauthProblems as CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { PublishPreview, PublishSelection } from './_shared'

export const getClauseSheetPublishPreview = createRoute({
  method: 'get',
  path: '/api/clause-sheets/{id}/publish-preview',
  operationId: 'getClauseSheetPublishPreview',
  tags: ['clause-sheets'],
  request: { params: IdParams, query: PublishSelection },
  responses: {
    ...CommonProblems,
    422: { ...ProblemResponse, description: 'not-publishable or idempotency-mismatch' },
    200: { description: 'Success', content: { 'application/json': { schema: PublishPreview } } }
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_sheet.publish', idempotent: false }
})
