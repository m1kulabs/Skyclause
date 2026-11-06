import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Problem } from '../shared'

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  403: { ...ProblemResponse, description: 'Bot check failed' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const createGuest = createRoute({
  method: 'post',
  path: '/api/guest',
  operationId: 'createGuest',
  tags: ['guest'],
  request: {
    headers: z.object({ 'Idempotency-Key': z.string().min(1) }),
    body: {
      required: true,
      content: { 'application/x-www-form-urlencoded': { schema: z.object({ turnstile_token: z.string().min(1) }) } }
    }
  },
  responses: {
    ...CommonProblems,
    303: {
      description: 'Anonymous session created; open the Commons',
      headers: z.object({ Location: z.literal('/commons/bukit-jalil') })
    }
  },
  x: { owner: 'd-guest-entry', statement: 'public', idempotent: true }
})

export const routes = [createGuest] as const
