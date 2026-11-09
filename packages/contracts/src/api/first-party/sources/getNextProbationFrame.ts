import { IdParams, CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant } from '../../shared'

export const getNextProbationFrame = createRoute({
  method: 'get',
  path: '/api/sources/{id}/probation/next',
  operationId: 'getNextProbationFrame',
  tags: ['sources'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            frame_reading_id: z.string(),
            observed_at: Instant,
            frame_url: z.url(),
            phone_obscured: z.boolean()
          })
        }
      }
    },
    204: { description: 'No unlabelled daylight frame is available' }
  },
  x: { owner: 'b-device-ingest', statement: 'labeller', idempotent: false }
})
