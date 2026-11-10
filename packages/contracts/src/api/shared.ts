import { z } from '@hono/zod-openapi'
import { ROLES } from '../auth'
import { SheetInput } from '../clauses'
import { JsonValue } from './common'
export { Problem } from './common'

// Spec conventions and TRD "API conventions": snake_case, RFC 3339 UTC, whole-second ages.
export const Instant = z.iso.datetime()
export type Instant = z.infer<typeof Instant>
export const LocalDate = z.iso.date()
export type LocalDate = z.infer<typeof LocalDate>
export const Pack = z.enum(['sky', 'crowd'])
export type Pack = z.infer<typeof Pack>
export const InputState = z.enum(['fresh', 'stale', 'error', 'recovered', 'pending', 'probation', 'off_hours'])
export type InputState = z.infer<typeof InputState>
export const Mode = z.enum(['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'surge_night'])
export type Mode = z.infer<typeof Mode>
export const Recommendation = z.enum([
  'keep_with_advisory',
  'shift_start',
  'shift_end',
  'ask_shuttle',
  'leave_before_doors'
])
export type Recommendation = z.infer<typeof Recommendation>
export const Language = z.enum(['en', 'ms'])
export type Language = z.infer<typeof Language>
export const Ref = z.object({ type: z.string(), id: z.string() })
export type Ref = z.infer<typeof Ref>
export const ScopeRef = z.object({ kind: z.enum(['site', 'window', 'night']), id: z.string().nullable() })
export type ScopeRef = z.infer<typeof ScopeRef>

// TRD "API conventions": RFC 9457 errors and cursor pagination.
export function Page<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), next_cursor: z.string().nullable() })
}
export type Page<T> = { data: T[]; next_cursor: string | null }
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional()
})
export type PageQuery = z.infer<typeof PageQuery>

// Spec §1 IndicatorValue; TRD "Explanations, versions and replays"; PRD LND-1.
export const InputValue = z.object({
  name: z.string(),
  value: z.union([z.number(), z.boolean(), z.string(), z.array(z.number())]).nullable(),
  unit: z.string(),
  state: InputState,
  since: Instant.nullable(),
  age_s: z.number().int().nonnegative().nullable(),
  source_ids: z.array(z.string()),
  source_url: z.url().nullable(),
  reading_ids: z.array(z.string()),
  observed_at: Instant.nullable()
})
export type InputValue = z.infer<typeof InputValue>
export const BlockedInput = z.object({
  name: z.string(),
  source_id: z.string().nullable(),
  state: InputState,
  since: Instant
})
export type BlockedInput = z.infer<typeof BlockedInput>
export const ClauseResult = z.object({
  key: z.string(),
  result: z.enum(['fired', 'not_fired', 'blocked', 'not_open']),
  blocked_by: z.array(BlockedInput),
  span: z.object({ from: Instant, to: Instant, complete: z.boolean() }).optional(),
  inputs: z.array(InputValue)
})
export type ClauseResult = z.infer<typeof ClauseResult>
export const ClauseExplanation = ClauseResult.extend({
  cel: z.string(),
  wording: z.object({ en: z.string().optional(), ms: z.string().optional() })
})
export type ClauseExplanation = z.infer<typeof ClauseExplanation>
export const Verdict = z.object({
  scope: ScopeRef,
  pack: Pack,
  mode: Mode.nullable(),
  watch: z.boolean(),
  no_call: z.object({ inputs: z.array(BlockedInput) }).nullable(),
  recommendations: z.array(Recommendation),
  clauses: z.array(ClauseResult),
  open_from: Instant.nullable()
})
export type Verdict = z.infer<typeof Verdict>
export const Verdicts = z.object({
  t_eval: Instant,
  pack: Pack,
  content_hash: z.string(),
  snapshot_hash: z.string(),
  site: z.array(Verdict),
  windows: z.array(Verdict),
  nights: z.array(Verdict),
  hash: z.string()
})
export type Verdicts = z.infer<typeof Verdicts>

// Spec D3: distinguish an approved call from the labelled engine verdict; null means no basis yet.
export const PackState = z.object({
  pack: Pack,
  basis: z.enum(['approved_call', 'engine_verdict']).nullable(),
  call_id: z.string().nullable(),
  mode: Mode.nullable(),
  watch: z.boolean(),
  no_call: z.object({ inputs: z.array(BlockedInput) }).nullable()
})
export type PackState = z.infer<typeof PackState>

// PRD SET-2; Spec §1: shortcuts default on. Density has no documented value catalogue.
export const Preferences = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  high_contrast: z.boolean(),
  density: z.enum(['compact', 'comfortable']),
  reduced_motion: z.boolean(),
  language: Language,
  shortcuts: z.boolean().default(true),
  sidebar_collapsed: z.boolean().default(false)
})
export type Preferences = z.infer<typeof Preferences>
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  high_contrast: false,
  density: 'comfortable',
  reduced_motion: false,
  language: 'en',
  shortcuts: true,
  sidebar_collapsed: false
}

// Spec §1: the /api/notifications item is also the notification stream payload.
export const NOTIFICATION_KINDS = ['needs_review', 'escalated', 'source_error', 'review_item', 'auditor'] as const
export const NotificationKind = z.enum(NOTIFICATION_KINDS)
export type NotificationKind = z.infer<typeof NotificationKind>
export const ProjectRef = z.object({ id: z.string(), slug: z.string(), org_slug: z.string() })
export type ProjectRef = z.infer<typeof ProjectRef>
export const Notification = z.object({
  id: z.string(),
  kind: NotificationKind,
  ref: Ref,
  project: ProjectRef.nullable(),
  recovered: z.boolean(),
  created_at: Instant,
  read_at: Instant.nullable()
})
export type Notification = z.infer<typeof Notification>
export const NotificationPreference = z.object({ kind: NotificationKind, enabled: z.boolean() })
export type NotificationPreference = z.infer<typeof NotificationPreference>

// Spec §3 and TRD "Entities and keys": shared resource shapes for Spec §4 reads and writes.
export const ProjectPack = z.object({
  pack: Pack,
  enabled: z.boolean(),
  sheet_id: z.string().nullable(),
  schedule: JsonValue.nullable(),
  sla_s: z.number().int().nullable()
})
export type ProjectPack = z.infer<typeof ProjectPack>
export const Project = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  slug: z.string(),
  time_zone: z.string(),
  public: z.boolean(),
  semester_ends_on: LocalDate.nullable(),
  site_name: z.string().nullable(),
  site_lat: z.number().nullable(),
  site_lon: z.number().nullable(),
  archived_at: Instant.nullable(),
  camera_day_start: z.string().nullable(),
  camera_day_end: z.string().nullable(),
  warning_area_terms: z.array(z.string()),
  packs: z.array(ProjectPack)
})
export type Project = z.infer<typeof Project>
export const Window = z.object({
  id: z.string(),
  project_id: z.string(),
  starts_at: Instant,
  ends_at: Instant,
  title: z.string(),
  kind: z.enum(['class', 'event', 'commute_wave']),
  tz: z.string(),
  declared_by: z.string(),
  guest: z.boolean(),
  via: z.enum(['app', 'form', 'ics', 'api', 'cli', 'mcp', 'guest', 'share']),
  expires_at: Instant.nullable(),
  series_id: z.string().nullable(),
  ics_feed_id: z.string().nullable(),
  cancelled_at: Instant.nullable(),
  share_link_id: z.string().nullable(),
  moderation: z.enum(['visible', 'hidden_pending_review', 'removed'])
})
export type Window = z.infer<typeof Window>
export const IcsFeed = z.object({
  id: z.string(),
  project_id: z.string(),
  url: z.url().nullable(),
  filename: z.string().optional()
})
export type IcsFeed = z.infer<typeof IcsFeed>
export const SourceKind = z.enum([
  'jps_rain',
  'met_warning',
  'met_forecast',
  'apims',
  'rapidrail_od',
  'gtfs_static',
  'gtfs_rt',
  'golive',
  'wikipedia',
  'camera',
  'pi'
])
export type SourceKind = z.infer<typeof SourceKind>
export const SourceRole = z.enum([
  'rain_gauge',
  'api_station',
  'warnings',
  'met_forecast',
  'rail_station',
  'venue_listings',
  'bus_feed',
  'gtfs_static',
  'camera',
  'pi'
])
export type SourceRole = z.infer<typeof SourceRole>
export const SourceState = z.object({
  state: InputState,
  since: Instant,
  http_status: z.number().int().nullable(),
  pending_until: Instant.nullable()
})
export type SourceState = z.infer<typeof SourceState>
export const Source = z.object({
  id: z.string(),
  kind: SourceKind,
  external_id: z.string(),
  owner_org_id: z.string().nullable(),
  name: z.string(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  url: z.url(),
  cadence_s: z.number().int(),
  stale_after_s: z.number().int(),
  licence_id: z.string(),
  licence_label: z.string()
})
export type Source = z.infer<typeof Source>
// `poll_id` is null for a device reading without a poll and `unit` for a unitless record, as `reading` stores them.
export const Reading = z.object({
  id: z.string(),
  source_id: z.string(),
  poll_id: z.string().nullable(),
  metric: z.string(),
  unit: z.string().nullable(),
  observed_at: Instant,
  received_at: Instant,
  value: z.number().nullable(),
  value_text: z.string().nullable(),
  value_json: JsonValue.nullable(),
  device_time: Instant.nullable(),
  item_key: z.string().nullable(),
  revision: z.string()
})
export type Reading = z.infer<typeof Reading>
export const Poll = z.object({
  id: z.string(),
  source_id: z.string(),
  started_at: Instant,
  http_status: z.number().int().nullable(),
  latency_ms: z.number(),
  outcome: z.string(),
  request_id: z.string(),
  error_code: z.string().nullable()
})
export type Poll = z.infer<typeof Poll>
export const Listing = z.object({
  id: z.string(),
  project_id: z.string(),
  listing_key: z.string(),
  source_url: z.url(),
  source_revision: z.string(),
  state: z.enum(['proposed', 'listed', 'rejected', 'cancelled']),
  class: z.string(),
  class_hint: z.string().nullable(),
  single_source: z.boolean(),
  historical: z.boolean(),
  night_id: z.string().nullable(),
  pending_change: JsonValue.nullable()
})
export type Listing = z.infer<typeof Listing>
export const Night = z.object({
  id: z.string(),
  project_id: z.string(),
  date: LocalDate,
  state: z.enum(['upcoming', 'in_progress', 'awaiting_actuals', 'graded', 'unlisted']),
  doors: Instant,
  show: Instant,
  arrival_start: Instant,
  arrival_end: Instant,
  exit_start: Instant.nullable(),
  exit_end: Instant.nullable()
})
export type Night = z.infer<typeof Night>
export const Forecast = z.object({
  id: z.string(),
  night_id: z.string(),
  baseline: z.number(),
  uplift: z.number(),
  forecast: z.number(),
  band_low: z.number(),
  band_high: z.number(),
  created_at: Instant,
  method: z.string(),
  reading_ids: z.array(z.string())
})
export type Forecast = z.infer<typeof Forecast>

export const RunTrigger = z.enum(['schedule', 'crossing', 'window', 'listing', 'calendar', 'request'])
export type RunTrigger = z.infer<typeof RunTrigger>
export const Run = z.object({
  id: z.string(),
  project_id: z.string(),
  pack: Pack,
  trigger: RunTrigger,
  dedupe_key: z.string(),
  // #151: null until the run's snapshot and shadow steps set them, so for every queued run.
  sheet_version_id: z.string().nullable(),
  snapshot_id: z.string().nullable(),
  model: z.string().nullable(),
  fallback_used: z.boolean(),
  status: z.enum(['queued', 'running', 'drafted', 'no_draft', 'failed']),
  reason: z.string().nullable(),
  trigger_ref: z.string().nullable(),
  window_ids: z.array(z.string()),
  verdict_hash: z.string().nullable()
})
export type Run = z.infer<typeof Run>
export const Notice = z.object({ language: Language, subject: z.string().max(120), body: z.string().max(2000) })
export type Notice = z.infer<typeof Notice>
export const CallState = z.enum([
  'drafted',
  'approved',
  'edited',
  'rejected',
  'expired',
  'superseded',
  'sending',
  'sent',
  'failed'
])
export type CallState = z.infer<typeof CallState>
// TRD "Agent inputs and output schema", enriched by Spec §3's persisted call fields.
export const CallView = z.object({
  id: z.string(),
  bundle_id: z.string(),
  window_id: z.string().nullable(),
  night_id: z.string().nullable(),
  mode: Mode.nullable(),
  watch: z.boolean(),
  no_call: z.array(z.string()).nullable(),
  fired: z.array(z.object({ clause: z.string(), inputs: z.array(z.string()) })),
  recommendations: z.array(Recommendation),
  recipients: z.array(z.string()),
  notices: z.array(Notice),
  reason: z.string().max(1500),
  state: CallState,
  shadow: Verdict,
  chosen: z.string(),
  agrees: z.boolean(),
  decision: z.string().nullable(),
  expires_at: Instant,
  triggered_at: Instant,
  drafted_at: Instant,
  approved_at: Instant.nullable(),
  sent_at: Instant.nullable(),
  superseded_by_call_id: z.string().nullable(),
  // D20: set when the call is first sent; null until then.
  ics_uid: z.string().nullable(),
  ics_sequence: z.number().int()
})
export type CallView = z.infer<typeof CallView>
// #150: a call's recipients, counted by language (c-notice-templates' `recipientsByLanguage`), by channel and
// suppressed (from its `notice` rows), on the getBundle and getCall reads.
export const RecipientCounts = z.object({
  by_language: z.object({ en: z.number().int().nonnegative(), ms: z.number().int().nonnegative() }),
  by_channel: z.object({ email: z.number().int().nonnegative(), push: z.number().int().nonnegative() }),
  suppressed: z.number().int().nonnegative()
})
export type RecipientCounts = z.infer<typeof RecipientCounts>
// TRD "Bundle state machine": edited/rejected are per-call states (PRD CAL-7).
export const BundleState = z.enum([
  'drafted',
  'closed',
  'needs_review',
  'superseded',
  'expired',
  'reconfirm',
  'approved',
  'sending',
  'sent',
  'graded'
])
export type BundleState = z.infer<typeof BundleState>
// #499: a window or night whose engine verdict fired with no call in the draft (#467's compare `missing` row). It holds
// the bundle in review until an approver drafts the engine's call for it (`call_id`) or dismisses it with a `reason`,
// or a newer bundle covering it supersedes it (`superseded_by`).
export const MissingCall = z.object({
  window_id: z.string().nullable(),
  night_id: z.string().nullable(),
  // The engine's verdict as the run saw it.
  shadow: Verdict,
  // The window's candidate subscribers at the run: a drafted call's recipients.
  recipients: z.array(z.string()),
  resolution: z.enum(['drafted', 'dismissed', 'superseded']).nullable(),
  call_id: z.string().nullable(),
  reason: z.string().nullable(),
  resolved_by: z.string().nullable(),
  resolved_at: Instant.nullable(),
  superseded_by: z.string().nullable()
})
export type MissingCall = z.infer<typeof MissingCall>
export const Bundle = z.object({
  id: z.string(),
  project_id: z.string(),
  run_id: z.string(),
  pack: Pack,
  state: BundleState,
  superseded_by: z.string().nullable(),
  review_hash: z.string(),
  // PRJ-7: only a bundle that needs review has an SLA; null for one that closed at drafting.
  sla_due_at: Instant.nullable(),
  needs_review_at: Instant.nullable(),
  approved_by: z.string().nullable(),
  escalation_level: z.number().int(),
  draft_only: z.boolean(),
  calls: z.array(CallView),
  // #499 (optional): sent only when the draft left out a fired window or night.
  missing: z.array(MissingCall).optional()
})
export type Bundle = z.infer<typeof Bundle>
export const LedgerKind = z.enum([
  'call_approved',
  'call_edited',
  'call_rejected',
  'call_expired',
  'call_sent',
  'grade',
  'night_graded',
  'listing_listed',
  'listing_changed',
  'listing_cancelled',
  'clause_version',
  'window_cancelled',
  'evidence_replied',
  'crowd_reply',
  'correction'
])
export type LedgerKind = z.infer<typeof LedgerKind>
export const LedgerEntry = z.object({
  id: z.string(),
  project_id: z.string(),
  seq: z.number().int(),
  kind: LedgerKind,
  refs: z.record(z.string(), z.string()),
  body: JsonValue,
  prev_hash: z.string(),
  hash: z.string(),
  at: Instant,
  corrects: z.string().optional()
})
export type LedgerEntry = z.infer<typeof LedgerEntry>
export const Grade = z.object({
  id: z.string(),
  call_id: z.string().nullable(),
  night_id: z.string().nullable(),
  outcome: z.string(),
  sheet_version_id: z.string(),
  pack: Pack,
  window_id: z.string().nullable(),
  proposed_mode: Mode.nullable(),
  observed_mode: Mode.nullable(),
  mode_diff: z.number(),
  no_call: z.boolean(),
  agrees: z.boolean(),
  stale_inputs: z.boolean()
})
export type Grade = z.infer<typeof Grade>
export const ReviewItem = z.object({ id: z.string(), grade_id: z.string(), state: z.string(), explanation: z.string() })
export type ReviewItem = z.infer<typeof ReviewItem>
export const EvidenceRequest = z.object({
  id: z.string(),
  project_id: z.string(),
  span: z.object({ from: Instant, to: Instant }),
  requester: z.string(),
  call_id: z.string().nullable(),
  via: z.enum(['email', 'app', 'api', 'mcp']),
  leaves_org: z.boolean(),
  reply_channel: z.enum(['email', 'in_app']).nullable(),
  status: z.string(),
  received_at: Instant,
  drafted_at: Instant.nullable(),
  approved_at: Instant.nullable(),
  replied_at: Instant.nullable()
})
export type EvidenceRequest = z.infer<typeof EvidenceRequest>
export const Subscriber = z.object({
  id: z.string(),
  project_id: z.string(),
  email: z.email(),
  role: z.string(),
  window_ids: z.array(z.string()),
  channels: z.array(z.enum(['email', 'ics', 'webhook', 'in_app'])),
  language: Language,
  confirmed_at: Instant.nullable()
})
export type Subscriber = z.infer<typeof Subscriber>
export const Channel = z.object({ channel: z.enum(['email', 'ics', 'webhook', 'in_app']), enabled: z.boolean() })
export type Channel = z.infer<typeof Channel>
export const Webhook = z.object({
  id: z.string(),
  url: z.url(),
  events: z.array(z.string()),
  project_ids: z.array(z.string()),
  disabled_at: Instant.nullable(),
  verified_at: Instant.nullable(),
  status: z.string()
})
export type Webhook = z.infer<typeof Webhook>
export const WebhookDelivery = z.object({
  id: z.string(),
  event_id: z.string(),
  dispatch_id: z.string(),
  attempt: z.number().int(),
  status_code: z.number().int().nullable(),
  latency_ms: z.number()
})
export type WebhookDelivery = z.infer<typeof WebhookDelivery>
export const ShareLink = z.object({
  id: z.string(),
  project_id: z.string(),
  access: z.enum(['view', 'reviewer']),
  expires_at: Instant.nullable(),
  revoked_at: Instant.nullable(),
  last_used_at: Instant.nullable().optional()
})
export type ShareLink = z.infer<typeof ShareLink>
export const RotaShift = z.object({
  id: z.string(),
  account_id: z.string(),
  project_id: z.string().nullable(),
  // TRD rota days use ISO weekdays (Monday=1 through Sunday=7), matching `rota_shift.days`' integer array.
  days: z.array(z.number().int().min(1).max(7)),
  local_start: z.string(),
  local_end: z.string(),
  condition: z.string().nullable(),
  order: z.number().int(),
  template: z.enum(['storm_afternoon', 'surge_night', 'custom'])
})
export type RotaShift = z.infer<typeof RotaShift>
export const Membership = z.object({
  id: z.string(),
  org_id: z.string(),
  account_id: z.string(),
  role: z.enum(ROLES),
  reads_malay: z.boolean()
})
export type Membership = z.infer<typeof Membership>
export const ApiKey = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.enum(['read', 'draft', 'admin'])),
  created_at: Instant,
  expires_at: Instant,
  last_used_at: Instant.nullable(),
  created_by: z.string()
})
export type ApiKey = z.infer<typeof ApiKey>
export const AiKey = z.object({
  id: z.string(),
  provider: z.string(),
  owner_type: z.string(),
  last4: z.string(),
  fingerprint: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  declared_tier: z.string(),
  priority: z.number().int()
})
export type AiKey = z.infer<typeof AiKey>
export const ExportJob = z.object({
  id: z.string(),
  scope: z.enum(['account', 'organisation']),
  status: z.string(),
  formats: z.array(z.enum(['json', 'csv'])),
  error: z.string().nullable(),
  expires_at: Instant.nullable()
})
export type ExportJob = z.infer<typeof ExportJob>
export const Verification = z.object({
  id: z.string(),
  target: z.enum([
    'claude_ai',
    'claude_desktop',
    'claude_code',
    'chatgpt',
    'gemini_cli',
    'gemini_enterprise',
    'cursor',
    'vscode'
  ]),
  client_version: z.string(),
  tested_at: Instant,
  result: z.string(),
  tested_by: z.string(),
  notes: z.string().nullable()
})
export type Verification = z.infer<typeof Verification>
export const PublicProjectState = z.object({
  state_version: z.string(),
  project: ProjectRef,
  packs: z.array(PackState)
})
export type PublicProjectState = z.infer<typeof PublicProjectState>

// Spec §1 clause fields (`../clauses`) and §3 version metadata, used by read/draft/evaluate/publish operations.
export const SheetContent = SheetInput
export type SheetContent = z.infer<typeof SheetContent>
export const SheetVersion = z.object({
  id: z.string(),
  status: z.enum(['draft', 'published']),
  n: z.number().int(),
  content: SheetContent,
  content_hash: z.string(),
  published_by: z.string().nullable()
})
export type SheetVersion = z.infer<typeof SheetVersion>
export const ClauseSheet = z.object({
  id: z.string(),
  project_id: z.string(),
  pack: Pack,
  live_version_id: z.string().nullable()
})
export type ClauseSheet = z.infer<typeof ClauseSheet>
export const SourceBinding = z.object({ project_id: z.string(), source_id: z.string(), role: SourceRole })
export type SourceBinding = z.infer<typeof SourceBinding>

// Spec §3 organisation/member/key records shared across the first-party operations.
export const Plan = z.enum(['community', 'team', 'campus', 'commons'])
export type Plan = z.infer<typeof Plan>
export const Organisation = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: Plan,
  deletion_requested_at: Instant.nullable(),
  purge_after: Instant.nullable(),
  onboarding_skipped: z.boolean(),
  ai_fallback_enabled: z.boolean(),
  allow_member_ai_keys: z.boolean()
})
export type Organisation = z.infer<typeof Organisation>
export const Invitation = z.object({ id: z.string(), email: z.email(), role: z.enum(ROLES) })
export type Invitation = z.infer<typeof Invitation>
export const OwnershipTransfer = z.object({ id: z.string(), to_member_id: z.string(), status: z.string() })
export type OwnershipTransfer = z.infer<typeof OwnershipTransfer>
export const AiUsage = z.object({
  run_id: z.string().nullable(),
  ai_key_id: z.string().nullable(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int()
})
export type AiUsage = z.infer<typeof AiUsage>
export const OAuthGrant = z.object({
  id: z.string(),
  client_id: z.string(),
  org_id: z.string(),
  resource: z.enum(['api', 'mcp']),
  project_ids: z.union([z.array(z.string()), z.literal('all')]),
  scopes: z.array(z.enum(['read', 'draft'])),
  share_link_id: z.string().nullable(),
  revoked_at: Instant.nullable()
})
export type OAuthGrant = z.infer<typeof OAuthGrant>
export const PushSubscription = z.object({
  id: z.string(),
  account_id: z.string(),
  endpoint: z.url(),
  p256dh: z.string(),
  auth: z.string(),
  user_agent: z.string(),
  last_ok_at: Instant.nullable()
})
export type PushSubscription = z.infer<typeof PushSubscription>

// Spec §3 analysis_metric; PRD ANL-5: n=0 has no interval.
export const AnalysisMetric = z.object({
  metric: z.string(),
  x: z.number().nullable(),
  // Scalar metrics (minutes and forecast error) are returned by c-analysis-api, never computed by a screen.
  value: z.number().nullable().optional(),
  n: z.number().int(),
  low: z.number().nullable(),
  high: z.number().nullable()
})
export type AnalysisMetric = z.infer<typeof AnalysisMetric>
