import { z } from '@hono/zod-openapi'
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
} from '../../shared'
import {
  BundleDraftedEventSchema,
  BundleNeedsReviewEventSchema,
  BundleSupersededEventSchema,
  BundleExpiredEventSchema,
  BundleEscalatedEventSchema,
  BundleApprovedEventSchema
} from '../../../events'

// CAL-10, CAL-11 and CAL-13: the header and escalation history accompany the saved bundle.
export const BundleView = Bundle.extend({
  trigger: RunTrigger,
  triggered_at: Instant,
  // The run's pinned sheet version; null for a run that has none.
  sheet_version_id: z.string().nullable(),
  alerts: z.array(z.object({ account_id: z.string(), notified_at: Instant, level: z.string() }))
})

// #150 (optional, getBundle only): CAL-5's trace line for a bundle with every call Normal ("Normal; N inputs fresh",
// with each fresh input and its age), CAL-11's escalations from `approval`, and each call's recipient counts.
export const BundleDetail = BundleView.extend({
  calls: z.array(CallView.extend({ recipient_counts: RecipientCounts.optional() })),
  summary: z.object({ text: z.string(), inputs: z.array(InputValue) }).optional(),
  escalations: z.array(z.object({ actor_id: z.string(), at: Instant })).optional()
})

export const BundlePage = Page(BundleView)

export const BundleQuery = PageQuery.extend({ pack: Pack.optional(), state: BundleState.optional() })

export const BundleEvent = z.discriminatedUnion('type', [
  BundleDraftedEventSchema,
  BundleNeedsReviewEventSchema,
  BundleSupersededEventSchema,
  BundleExpiredEventSchema,
  BundleEscalatedEventSchema,
  BundleApprovedEventSchema
])
