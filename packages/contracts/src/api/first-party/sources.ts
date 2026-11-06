import { IdParams, CommonProblems, IdempotencyHeaders } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant } from '../shared'

const ProbationStatus = z.object({
  source_id: z.string(),
  probation: z.boolean(),
  labeller_ids: z.array(z.string()),
  n: z.number().int().nonnegative(),
  obscured_frames: z.number().int().nonnegative(),
  agreement: z.number().min(0).max(1).nullable()
})
const ProbationLabel = z.object({ frame_reading_id: z.string(), label: z.enum(['landmark_visible', 'obscured']) })

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

export const routes = [setSourceProbation, getNextProbationFrame, createProbationLabel] as const
