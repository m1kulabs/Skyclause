import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Channel } from '../shared'

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
