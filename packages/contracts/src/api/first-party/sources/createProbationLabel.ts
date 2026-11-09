import { IdParams, CommonProblems, IdempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant } from '../../shared'
import { ProbationLabel, ProbationStatus } from './_shared'

export const createProbationLabel = createRoute({
  method: 'post',
  path: '/api/sources/{id}/probation/labels',
  operationId: 'createProbationLabel',
  tags: ['sources'],
  request: {
    params: IdParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: ProbationLabel } } }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Label recorded',
      content: {
        'application/json': {
          schema: ProbationLabel.extend({
            id: z.string(),
            labeller_id: z.string(),
            created_at: Instant,
            probation: ProbationStatus
          })
        }
      }
    }
  },
  x: { owner: 'b-device-ingest', statement: 'labeller', idempotent: true }
})
