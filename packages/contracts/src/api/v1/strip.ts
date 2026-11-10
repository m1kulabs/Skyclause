import { OrganizationHeaders, IdParams as ProjectParams, problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { InputValue, Instant, Night, PackState, Verdicts, Window } from '../shared'

const ProjectStrip = z.object({
  project_id: z.string(),
  range: z.object({ from: Instant, to: Instant }),
  window: Window.nullable(),
  series: z.record(z.string(), z.array(z.tuple([Instant, z.number().nullable(), z.string()]))),
  inputs: z.array(InputValue),
  packs: z.array(PackState),
  verdicts: z.array(Verdicts),
  nights: z.array(Night),
  replay: z.object({ source: z.string(), captured_at: Instant }).optional()
})

export const getProjectStrip = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/strip',
  operationId: 'getProjectStrip',
  tags: ['Project strip'],
  request: { headers: OrganizationHeaders, params: ProjectParams },
  responses: {
    200: {
      description: 'Current project window strip and supporting data',
      content: { 'application/json': { schema: ProjectStrip } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const routes = [getProjectStrip] as const
