import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { BundleEvent } from './_shared'

export const streamBundles = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/bundles/stream',
  operationId: 'streamBundles',
  tags: ['bundles'],
  request: {
    headers: OrganizationHeaders.extend({ 'Last-Event-ID': z.string().regex(/^\d+$/).optional() }),
    params: IdParams
  },
  responses: {
    ...ProblemResponses,
    200: {
      description:
        'Bundle transition events; id is the per-project sequence. Heartbeats every 15 seconds; reconnect after five minutes.',
      content: { 'text/event-stream': { schema: BundleEvent } }
    }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})
