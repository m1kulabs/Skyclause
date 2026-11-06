// Spec §2 `metrics.ts`: Cloud Monitoring metric names. One `skyclause.<sli>` per row of TRD's SLI table
// (availability comes from uptime checks, source freshness from the auditor), plus NFR-1's storage report.

export const METRICS = {
  pollsOnSchedule: 'skyclause.polls_on_schedule',
  readingStored: 'skyclause.reading_stored',
  readingToVerdict: 'skyclause.reading_to_verdict',
  crossingToNeedsReview: 'skyclause.crossing_to_needs_review',
  approverAlerted: 'skyclause.approver_alerted',
  approvalToProvider: 'skyclause.approval_to_provider',
  approvalSla: 'skyclause.approval_sla',
  /** The full TRD SLI row name; `readingToVerdict` remains available to existing consumers. */
  readingToShadowVerdict: 'skyclause.reading_to_shadow_verdict',
  sourceFreshness: 'skyclause.source_freshness',
  appApiMcpAvailability: 'skyclause.app_api_mcp_availability',
  /** #111 records it from `POST /e`. */
  webVitals: 'skyclause.web_vitals',
  heartbeat: 'skyclause.heartbeat'
} as const

/** `skyclause.heartbeat{name}`: `auditor` (b-auditor) and `minute_tick` (f-monorepo). */
export type HeartbeatName = 'auditor' | 'minute_tick'

/**
 * The `stat` attribute on each SLI gauge. Counts and seconds describe one window; `breach` is 1 when the
 * window misses its target, which is what every alert policy reads.
 */
export type SliStat =
  | 'slots'
  | 'on_time'
  | 'missed'
  | 'missed_in_a_row'
  | 'readings'
  | 'late'
  | 'max_s'
  | 'evaluations'
  | 'bundles'
  | 'notices'
  | 'within_60s'
  | 'failed_in_a_row'
  | 'p95_s'
  | 'due'
  | 'breached'
  | 'unescalated'
  | 'breach'
