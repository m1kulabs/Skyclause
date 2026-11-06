import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Bundle, BundleState, Instant, Pack, Page, PageQuery, RunTrigger } from '../shared'
import {
  BundleDraftedEventSchema,
  BundleNeedsReviewEventSchema,
  BundleSupersededEventSchema,
  BundleExpiredEventSchema,
  BundleEscalatedEventSchema,
  BundleApprovedEventSchema
} from '../../events'

// CAL-10, CAL-11 and CAL-13: the header and escalation history accompany the saved bundle.
const BundleView = Bundle.extend({
  trigger: RunTrigger,
  triggered_at: Instant,
  sheet_version_id: z.string(),
  alerts: z.array(z.object({ account_id: z.string(), notified_at: Instant, level: z.string() }))
})
const BundlePage = Page(BundleView)
const BundleQuery = PageQuery.extend({ pack: Pack.optional(), state: BundleState.optional() })
const BundleEvent = z.discriminatedUnion('type', [
  BundleDraftedEventSchema,
  BundleNeedsReviewEventSchema,
  BundleSupersededEventSchema,
  BundleExpiredEventSchema,
  BundleEscalatedEventSchema,
  BundleApprovedEventSchema
])

export const listProjectBundles = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/bundles',
  operationId: 'listProjectBundles',
  tags: ['bundles'],
  request: { headers: OrganizationHeaders, params: IdParams, query: BundleQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: BundlePage } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})

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

export const getBundle = createRoute({
  method: 'get',
  path: '/v1/bundles/{id}',
  operationId: 'getBundle',
  tags: ['bundles'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: BundleView } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})

export const listOrganisationBundles = createRoute({
  method: 'get',
  path: '/v1/bundles',
  operationId: 'listOrganisationBundles',
  tags: ['bundles'],
  request: { headers: OrganizationHeaders, query: BundleQuery.extend({ project_id: z.string().optional() }) },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: BundlePage } } }
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})

export const routes = [listProjectBundles, streamBundles, getBundle, listOrganisationBundles] as const
