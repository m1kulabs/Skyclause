import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Problem } from '../shared'

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

export const createDeveloperGuestToken = createRoute({
  method: 'post',
  path: '/api/developers/guest-token',
  operationId: 'createDeveloperGuestToken',
  tags: ['developers'],
  request: {
    headers: z.object({ 'Idempotency-Key': z.string().min(1) }),
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ scopes: z.array(z.enum(['read', 'draft'])).min(1) }) } }
    }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Guest token created with the issuing session budgets',
      content: {
        'application/json': {
          schema: z.object({ token: z.string(), scopes: z.array(z.enum(['read', 'draft'])), expires_at: Instant })
        }
      }
    }
  },
  x: { owner: 'e-console-api', statement: 'guest', idempotent: true }
})

export const routes = [createDeveloperGuestToken] as const
