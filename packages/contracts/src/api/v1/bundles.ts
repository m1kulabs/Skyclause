import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import {
  Bundle,
  BundleState,
  CallView,
  InputValue,
  Instant,
  Pack,
  Page,
  PageQuery,
  RecipientCounts,
  RunTrigger
} from '../shared'
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
  // The run's pinned sheet version; null for a run that has none.
  sheet_version_id: z.string().nullable(),
  alerts: z.array(z.object({ account_id: z.string(), notified_at: Instant, level: z.string() }))
})
// #150 (optional, getBundle only): CAL-5's trace line for a bundle with every call Normal ("Normal; N inputs fresh",
// with each fresh input and its age), CAL-11's escalations from `approval`, and each call's recipient counts.
const BundleDetail = BundleView.extend({
  calls: z.array(CallView.extend({ recipient_counts: RecipientCounts.optional() })),
  summary: z.object({ text: z.string(), inputs: z.array(InputValue) }).optional(),
  escalations: z.array(z.object({ actor_id: z.string(), at: Instant })).optional()
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
    200: { description: 'Success', content: { 'application/json': { schema: BundleDetail } } }
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
