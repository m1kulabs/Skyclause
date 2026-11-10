import { date, doublePrecision, integer, pgView, text, uuid } from 'drizzle-orm/pg-core'
import { bundleState, inputState } from './enums'
import { instant } from './columns'
import { pack } from './project'

// #111 (a-analytics): PRODUCT product-health views, created in migration 0015. Readable by `system` only (queried
// inside `withTenant` as a system principal); every other login is refused at the grant.

/** Distinct approving members per organisation per ISO week, against storm-afternoon and surge-night rota slots. */
export const weeklyApprovers = pgView('weekly_approvers', {
  orgId: uuid('org_id').notNull(),
  weekStart: date('week_start').notNull(),
  approvers: integer('approvers').notNull(),
  rotaSlots: integer('rota_slots').notNull()
}).existing()

/** Bundles past their SLA: escalated, or expired with no escalation logged. */
export const bundlesPastSla = pgView('bundles_past_sla', {
  orgId: uuid('org_id').notNull(),
  bundleId: uuid('bundle_id').notNull(),
  projectId: uuid('project_id').notNull(),
  pack: pack('pack').notNull(),
  state: bundleState('state').notNull(),
  escalationLevel: integer('escalation_level').notNull().default(0),
  slaDueAt: instant('sla_due_at'),
  reason: text('reason').notNull()
}).existing()

/** The share of hours each source was fresh, stale or erroring, from `poll` hours and the current `source_state`. */
export const signalHealth = pgView('signal_health', {
  sourceId: uuid('source_id').notNull(),
  currentState: inputState('current_state'),
  stateSince: instant('state_since'),
  hoursTotal: integer('hours_total').notNull(),
  hoursFresh: integer('hours_fresh').notNull(),
  hoursStale: integer('hours_stale').notNull(),
  hoursError: integer('hours_error').notNull(),
  shareFresh: doublePrecision('share_fresh'),
  shareStale: doublePrecision('share_stale'),
  shareError: doublePrecision('share_error')
}).existing()
