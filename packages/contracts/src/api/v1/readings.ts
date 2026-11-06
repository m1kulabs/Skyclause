import { OrganizationStreamHeaders as OrganizationHeaders, IdParams as ProjectParams, problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import {
  PollRecordedEventSchema,
  SourceErrorEventSchema,
  SourceRecoveredEventSchema,
  SourceStaleEventSchema
} from '../../events'
import { createRoute } from '../create-route'

const ReadingStreamEvent = z.union([
  SourceErrorEventSchema,
  SourceStaleEventSchema,
  SourceRecoveredEventSchema,
  PollRecordedEventSchema
])

export const streamReadings = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/readings/stream',
  operationId: 'streamReadings',
  tags: ['Readings'],
  request: { headers: OrganizationHeaders, params: ProjectParams },
  responses: {
    200: {
      description: 'Project reading and source state events',
      content: { 'text/event-stream': { schema: ReadingStreamEvent } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const routes = [streamReadings] as const
