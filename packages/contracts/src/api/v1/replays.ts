import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Verdicts } from '../shared'

const ReplayResult = z.object({
  id: z.uuidv7(),
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: z.iso.datetime(), verdicts: Verdicts })),
  summary: z.record(z.string(), z.number())
})

export const getReplay = createRoute({
  method: 'get',
  path: '/v1/replays/{id}',
  operationId: 'getReplay',
  tags: ['replays'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A labelled clause replay', content: { 'application/json': { schema: ReplayResult } } },
    ...commonErrors
  },
  x: { owner: 'b-replay', statement: 'project.view', idempotent: false }
})

export const routes = [getReplay] as const
