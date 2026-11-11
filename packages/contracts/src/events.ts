import { z } from 'zod'

// Spec §5 event data uses the thin envelope from TRD "Webhook event catalogue".
const packSchema = z.enum(['sky', 'crowd'])
const modeSchema = z.enum(['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'surge_night'])
const triggerSchema = z.enum(['schedule', 'crossing', 'listing', 'calendar', 'request'])
const windowViaSchema = z.enum(['form', 'ics', 'm365', 'api', 'cli', 'mcp', 'guest', 'share'])
const idSchema = z.uuidv7()
const gradeSchema = z.enum([
  'hit',
  'miss',
  'false_alarm',
  'correct_normal',
  'no_call',
  'in_band',
  'out_of_band',
  'unlisted_surge',
  'pending'
])

export const EventEnvelopeSchema = z.object({
  id: idSchema,
  type: z.string(),
  created_at: z.iso.datetime(),
  org_id: idSchema,
  project_id: idSchema,
  data: z.record(z.string(), z.unknown())
})

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>

const eventEnvelope = <Type extends string, Data extends z.ZodType>(type: Type, data: Data) =>
  EventEnvelopeSchema.extend({ type: z.literal(type), data })

export const SourceErrorEventSchema = eventEnvelope(
  'source.error',
  z.object({
    source_id: idSchema,
    state: z.literal('error'),
    since: z.iso.datetime(),
    http_status: z.number().int().nullable()
  })
)

export const SourceStaleEventSchema = eventEnvelope(
  'source.stale',
  z.object({
    source_id: idSchema,
    state: z.literal('stale'),
    since: z.iso.datetime(),
    http_status: z.number().int().nullable()
  })
)

export const SourceRecoveredEventSchema = eventEnvelope(
  'source.recovered',
  z.object({
    source_id: idSchema,
    state: z.literal('recovered'),
    since: z.iso.datetime(),
    http_status: z.number().int().nullable()
  })
)

export const CrossingDetectedEventSchema = eventEnvelope(
  'crossing.detected',
  z.object({
    crossing_id: idSchema,
    pack: packSchema,
    scope: z.object({ kind: z.enum(['site', 'window', 'night']), id: idSchema.nullable() }),
    from: modeSchema.nullable(),
    to: modeSchema.nullable(),
    at: z.iso.datetime(),
    snapshot_id: idSchema,
    verdict_hash: z.string()
  })
)

export const RunCompletedEventSchema = eventEnvelope(
  'run.completed',
  z.object({
    run_id: idSchema,
    pack: packSchema,
    trigger: triggerSchema,
    bundle_id: idSchema,
    shadow_mode: z.boolean()
  })
)

export const RunFailedEventSchema = eventEnvelope(
  'run.failed',
  z.object({
    run_id: idSchema,
    pack: packSchema,
    trigger: triggerSchema,
    reason: z.string(),
    shadow_mode: z.boolean()
  })
)

const bundleTransitionData = z.object({
  bundle_id: idSchema,
  pack: packSchema,
  state: z.enum(['drafted', 'needs_review', 'superseded', 'expired', 'escalated', 'approved']),
  call_ids: z.array(idSchema),
  sla_due_at: z.iso.datetime().nullable()
})

export const BundleDraftedEventSchema = eventEnvelope('bundle.drafted', bundleTransitionData)
export const BundleNeedsReviewEventSchema = eventEnvelope('bundle.needs_review', bundleTransitionData)
export const BundleSupersededEventSchema = eventEnvelope('bundle.superseded', bundleTransitionData)
export const BundleExpiredEventSchema = eventEnvelope('bundle.expired', bundleTransitionData)
export const BundleEscalatedEventSchema = eventEnvelope(
  'bundle.escalated',
  bundleTransitionData.extend({ level: z.enum(['next_approver', 'admins']) })
)
export const BundleApprovedEventSchema = eventEnvelope(
  'bundle.approved',
  bundleTransitionData.extend({
    sending_call_ids: z.array(idSchema),
    rejected_call_ids: z.array(idSchema)
  })
)

// `mode` is null for a No call, which is approved and sent like any other call (#158).
export const CallSentEventSchema = eventEnvelope(
  'call.sent',
  z.object({ call_id: idSchema, mode: modeSchema.nullable(), outcome: z.string() })
)

export const CallGradedEventSchema = eventEnvelope('call.graded', z.object({ call_id: idSchema, outcome: gradeSchema }))

export const NightGradedEventSchema = eventEnvelope(
  'night.graded',
  z.object({ night_id: idSchema, outcome: gradeSchema })
)

export const ReviewItemOpenedEventSchema = eventEnvelope(
  'review_item.opened',
  z.object({ review_item_id: idSchema, outcome: gradeSchema })
)

const listingData = z.object({
  listing_id: idSchema,
  state: z.enum(['proposed', 'listed', 'rejected', 'cancelled', 'unlisted']),
  night_id: idSchema
})

export const ListingProposedEventSchema = eventEnvelope('listing.proposed', listingData)
export const ListingListedEventSchema = eventEnvelope('listing.listed', listingData)
export const ListingChangedEventSchema = eventEnvelope('listing.changed', listingData)

export const EvidenceRequestAnsweredEventSchema = eventEnvelope(
  'evidence_request.answered',
  z.object({
    evidence_request_id: idSchema,
    reply_channel: z.enum(['email', 'app', 'api', 'mcp'])
  })
)

const windowEventData = z.object({
  window_id: idSchema,
  via: windowViaSchema,
  times_changed: z.boolean(),
  series_id: idSchema.nullable()
})

export const WindowCreatedEventSchema = eventEnvelope('window.created', windowEventData)
export const WindowUpdatedEventSchema = eventEnvelope('window.updated', windowEventData)
export const WindowCancelledEventSchema = eventEnvelope('window.cancelled', windowEventData)

export const PollRecordedEventSchema = eventEnvelope(
  'poll.recorded',
  z.object({
    source_id: idSchema,
    poll_id: idSchema,
    outcome: z.string(),
    http_status: z.number().int().nullable(),
    new_rows: z.number().int()
  })
)

const sourceBindingData = z.object({ source_id: idSchema, role: z.string() })
export const SourceBoundEventSchema = eventEnvelope('source.bound', sourceBindingData)
export const SourceUnboundEventSchema = eventEnvelope('source.unbound', sourceBindingData)

export const ClauseSheetPublishedEventSchema = eventEnvelope(
  'clause_sheet.published',
  z.object({ sheet_id: idSchema, pack: packSchema, version_n: z.number().int() })
)

export const DOMAIN_EVENT_SCHEMAS = {
  'source.error': SourceErrorEventSchema,
  'source.stale': SourceStaleEventSchema,
  'source.recovered': SourceRecoveredEventSchema,
  'crossing.detected': CrossingDetectedEventSchema,
  'run.completed': RunCompletedEventSchema,
  'run.failed': RunFailedEventSchema,
  'bundle.drafted': BundleDraftedEventSchema,
  'bundle.needs_review': BundleNeedsReviewEventSchema,
  'bundle.superseded': BundleSupersededEventSchema,
  'bundle.expired': BundleExpiredEventSchema,
  'bundle.escalated': BundleEscalatedEventSchema,
  'bundle.approved': BundleApprovedEventSchema,
  'call.sent': CallSentEventSchema,
  'call.graded': CallGradedEventSchema,
  'night.graded': NightGradedEventSchema,
  'review_item.opened': ReviewItemOpenedEventSchema,
  'listing.proposed': ListingProposedEventSchema,
  'listing.listed': ListingListedEventSchema,
  'listing.changed': ListingChangedEventSchema,
  'evidence_request.answered': EvidenceRequestAnsweredEventSchema,
  'window.created': WindowCreatedEventSchema,
  'window.updated': WindowUpdatedEventSchema,
  'window.cancelled': WindowCancelledEventSchema,
  'poll.recorded': PollRecordedEventSchema,
  'source.bound': SourceBoundEventSchema,
  'source.unbound': SourceUnboundEventSchema,
  'clause_sheet.published': ClauseSheetPublishedEventSchema
} as const

export const DomainEventSchema = z.discriminatedUnion('type', [
  SourceErrorEventSchema,
  SourceStaleEventSchema,
  SourceRecoveredEventSchema,
  CrossingDetectedEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  BundleDraftedEventSchema,
  BundleNeedsReviewEventSchema,
  BundleSupersededEventSchema,
  BundleExpiredEventSchema,
  BundleEscalatedEventSchema,
  BundleApprovedEventSchema,
  CallSentEventSchema,
  CallGradedEventSchema,
  NightGradedEventSchema,
  ReviewItemOpenedEventSchema,
  ListingProposedEventSchema,
  ListingListedEventSchema,
  ListingChangedEventSchema,
  EvidenceRequestAnsweredEventSchema,
  WindowCreatedEventSchema,
  WindowUpdatedEventSchema,
  WindowCancelledEventSchema,
  PollRecordedEventSchema,
  SourceBoundEventSchema,
  SourceUnboundEventSchema,
  ClauseSheetPublishedEventSchema
])

export type DomainEvent = z.infer<typeof DomainEventSchema>
export type DomainEventType = keyof typeof DOMAIN_EVENT_SCHEMAS

// TRD "Webhook event catalogue" excludes Spec §5's internal events.
export const WEBHOOK_EVENT_TYPES = [
  'source.error',
  'source.stale',
  'source.recovered',
  'crossing.detected',
  'run.completed',
  'run.failed',
  'bundle.drafted',
  'bundle.needs_review',
  'bundle.escalated',
  'bundle.approved',
  'bundle.superseded',
  'bundle.expired',
  'call.sent',
  'call.graded',
  'listing.proposed',
  'listing.listed',
  'listing.changed',
  'night.graded',
  'review_item.opened',
  'evidence_request.answered'
] as const satisfies readonly DomainEventType[]

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]
