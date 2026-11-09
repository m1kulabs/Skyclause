import { IdParams, ProblemResponse, ReauthProblems as CommonProblems, IdempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { PublishSelection, PublishedSheetVersion } from './_shared'

export const publishClauseSheet = createRoute({
  method: 'post',
  path: '/api/clause-sheets/{id}/publish',
  operationId: 'publishClauseSheet',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: PublishSelection.extend({ preview_hash: z.string() }) } }
    }
  },
  responses: {
    ...CommonProblems,
    422: { ...ProblemResponse, description: 'not-publishable or idempotency-mismatch' },
    201: {
      description: 'Immutable version published',
      content: { 'application/json': { schema: PublishedSheetVersion } }
    },
    409: { ...ProblemResponse, description: 'preview-stale: reload the diff and replay' }
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_sheet.publish', idempotent: true }
})
