import { problemResponse, IdempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { CameraFrame, IngestRequest, IngestResponse, SourceParams } from './_shared'

export const ingestReadings = createRoute({
  method: 'post',
  path: '/v1/ingest/{sourceId}',
  operationId: 'ingestReadings',
  tags: ['Ingest'],
  request: {
    params: SourceParams,
    headers: IdempotencyHeaders,
    body: { content: { 'application/json': { schema: z.union([IngestRequest, CameraFrame]) } } }
  },
  responses: {
    200: {
      description: 'Ingest result and camera daylight hours',
      content: {
        'application/json': {
          schema: z.union([IngestResponse, z.object({ ok: z.literal(true), duplicate: z.literal(true) })])
        }
      }
    },
    400: problemResponse('The request is invalid.'),
    401: problemResponse('Device authentication is required.'),
    403: problemResponse('The device token cannot ingest for this source.'),
    404: problemResponse('The source is unavailable.'),
    422: problemResponse('The readings do not match the source contract.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-device-ingest', statement: 'device', idempotent: true }
})
