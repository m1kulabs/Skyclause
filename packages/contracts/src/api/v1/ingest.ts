import { problemResponse, IdempotencyHeaders, JsonValue } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant } from '../shared'

const SourceParams = z.object({ sourceId: z.string() })
const IngestReading = z.object({
  metric: z.string(),
  unit: z.string(),
  observed_at: Instant,
  value: z.number().nullable().optional(),
  value_text: z.string().nullable().optional(),
  value_json: JsonValue.nullable().optional(),
  device_time: Instant.nullable().optional(),
  item_key: z.string().nullable().optional()
})
const IngestRequest = z.object({
  readings: z.array(IngestReading).min(1),
  posted_at: Instant.optional(),
  feed_age_s: z.number().int().nonnegative().optional(),
  fetch_latency_ms: z.number().nonnegative().optional()
})
const IngestResponse = z.object({
  source_id: z.string(),
  accepted: z.number().int(),
  received_at: Instant,
  camera_day_start: z.string(),
  camera_day_end: z.string()
})

export const ingestReadings = createRoute({
  method: 'post',
  path: '/v1/ingest/{sourceId}',
  operationId: 'ingestReadings',
  tags: ['Ingest'],
  request: {
    params: SourceParams,
    headers: IdempotencyHeaders,
    body: { content: { 'application/json': { schema: IngestRequest } } }
  },
  responses: {
    200: {
      description: 'Ingest result and camera daylight hours',
      content: { 'application/json': { schema: IngestResponse } }
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

export const routes = [ingestReadings] as const
