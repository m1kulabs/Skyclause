import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Page, PageQuery, Subscriber } from '../../shared'
import { SubscriberStatus, SubscriberView } from './_shared'

export const listSubscribers = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/subscribers',
  operationId: 'listSubscribers',
  tags: ['subscribers'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    query: PageQuery.extend({
      window_id: z.string().optional(),
      channel: Subscriber.shape.channels.element.optional(),
      status: SubscriberStatus.optional()
    })
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(SubscriberView) } } }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: false }
})
