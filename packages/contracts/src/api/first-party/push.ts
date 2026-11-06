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

export const getVapidPublicKey = createRoute({
  method: 'get',
  path: '/api/push/vapid-public-key',
  operationId: 'getVapidPublicKey',
  tags: ['push'],
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: z.object({ public_key: z.string() }) } } },
    503: { ...ProblemResponse, description: 'Web push has not been configured' }
  },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: false }
})

export const routes = [getVapidPublicKey] as const
