import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Channel, Problem } from '../shared'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
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

// NTC-13: approvers receive counts, without subscriber addresses or consent records.
const SubscriberCounts = z.object({
  total: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  unconfirmed: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),
  complained: z.number().int().nonnegative(),
  unsubscribed: z.number().int().nonnegative(),
  by_window: z.array(z.object({ window_id: z.string(), count: z.number().int().nonnegative() })),
  by_channel: z.array(z.object({ channel: Channel.shape.channel, count: z.number().int().nonnegative() }))
})

export const getSubscriberCounts = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/subscriber-counts',
  operationId: 'getSubscriberCounts',
  tags: ['subscriber-counts'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: SubscriberCounts } } }
  },
  x: { owner: 'c-subscribers', statement: 'project.view', idempotent: false }
})

export const routes = [getSubscriberCounts] as const
