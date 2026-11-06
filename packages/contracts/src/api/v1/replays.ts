import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Problem, Verdicts } from '../shared'

const IdParams = z.object({ id: z.uuidv7() })
const OrganizationHeader = z.object({ 'Skyclause-Organization': z.string().min(1) })
const ReplayResult = z.object({
  id: z.uuidv7(),
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: z.iso.datetime(), verdicts: Verdicts })),
  summary: z.record(z.string(), z.number())
})

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})
const commonErrors = {
  400: problemResponse('Invalid request'),
  401: problemResponse('Authentication required'),
  403: problemResponse('Insufficient permission'),
  404: problemResponse('Resource not found in this organisation'),
  429: problemResponse('Rate limit exceeded')
}

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
