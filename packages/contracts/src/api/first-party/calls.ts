import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Problem } from '../shared'

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const openCall = createRoute({
  method: 'get',
  path: '/api/calls/{id}/open',
  operationId: 'openCall',
  tags: ['calls'],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    ...CommonProblems,
    303: { description: 'Open the call page without changing state', headers: z.object({ Location: z.string() }) }
  },
  x: { owner: 'c-call-page-ui', statement: 'session', idempotent: false }
})

export const routes = [openCall] as const
