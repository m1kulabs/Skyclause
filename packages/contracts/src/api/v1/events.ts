import { problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { DomainEventSchema } from '../../events'

export const streamOrganisationEvents = createRoute({
  method: 'get',
  path: '/v1/events/stream',
  operationId: 'streamOrganisationEvents',
  tags: ['Events'],
  request: {
    headers: z.object({
      'Skyclause-Organization': z.string().min(1),
      'Last-Event-ID': z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Organisation domain events as server-sent events.',
      content: { 'text/event-stream': { schema: DomainEventSchema } }
    },
    400: problemResponse('The organisation header is missing.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The caller lacks project view permission.'),
    404: problemResponse('The organisation was not found.')
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})

export const routes = [streamOrganisationEvents] as const
