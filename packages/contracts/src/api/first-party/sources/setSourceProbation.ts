import { IdParams, CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { ProbationStatus } from './_shared'

export const setSourceProbation = createRoute({
  method: 'put',
  path: '/api/sources/{id}/probation',
  operationId: 'setSourceProbation',
  tags: ['sources'],
  request: {
    params: IdParams,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ labeller_ids: z.array(z.string()).length(2) }) } }
    }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProbationStatus } } }
  },
  x: { owner: 'b-device-ingest', statement: 'sources.manage', idempotent: false }
})
