import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Problem } from '../shared'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const IdempotentHeaders = OrganizationHeaders.extend({ 'Idempotency-Key': z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

const SubscribeLink = z.object({ id: z.string(), project_id: z.string(), url: z.url() })

export const createSubscribeLink = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/subscribe-link',
  operationId: 'createSubscribeLink',
  tags: ['subscribe-link'],
  request: { headers: IdempotentHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    201: { description: 'Success', content: { 'application/json': { schema: SubscribeLink } } },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: { 'application/problem+json': { schema: Problem } }
    }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: true }
})

export const routes = [createSubscribeLink] as const
