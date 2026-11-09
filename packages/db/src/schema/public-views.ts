import { bigint, boolean, integer, jsonb, pgView, text, uuid } from 'drizzle-orm/pg-core'
import { instant } from './columns'
import { callState, gradeOutcome, mode } from './enums'
import { pack } from './project'

// What `public_reader` sees of P tables (#79 §3): rows of `public = true` projects, through `security_barrier` views
// migration 0004 creates. `published_grade` (`d-public-api`) narrows grades further.

export const publicCall = pgView('public_call', {
  id: uuid('id').notNull(),
  orgId: uuid('org_id').notNull(),
  projectId: uuid('project_id').notNull(),
  bundleId: uuid('bundle_id').notNull(),
  windowId: uuid('window_id'),
  nightId: uuid('night_id'),
  mode: mode('mode'),
  watch: boolean('watch').notNull(),
  noCall: jsonb('no_call'),
  fired: jsonb('fired').notNull(),
  shadow: jsonb('shadow').notNull(),
  chosen: text('chosen').notNull(),
  agrees: boolean('agrees').notNull(),
  decision: text('decision'),
  state: callState('state').notNull(),
  supersededByCallId: uuid('superseded_by_call_id'),
  icsUid: text('ics_uid'),
  icsSequence: integer('ics_sequence').notNull(),
  expiresAt: instant('expires_at').notNull(),
  triggeredAt: instant('triggered_at').notNull(),
  draftedAt: instant('drafted_at').notNull(),
  approvedAt: instant('approved_at'),
  sentAt: instant('sent_at')
}).existing()

export const publicGrade = pgView('public_grade', {
  id: uuid('id').notNull(),
  orgId: uuid('org_id').notNull(),
  projectId: uuid('project_id').notNull(),
  pack: pack('pack').notNull(),
  callId: uuid('call_id'),
  nightId: uuid('night_id'),
  windowId: uuid('window_id'),
  sheetVersionId: uuid('sheet_version_id').notNull(),
  outcome: gradeOutcome('outcome').notNull(),
  proposedMode: mode('proposed_mode'),
  observedMode: mode('observed_mode'),
  modeDiff: integer('mode_diff').notNull(),
  noCall: boolean('no_call').notNull(),
  agrees: boolean('agrees').notNull(),
  staleInputs: boolean('stale_inputs').notNull(),
  createdAt: instant('created_at').notNull()
}).existing()

export const publicLedgerEntry = pgView('public_ledger_entry', {
  id: uuid('id').notNull(),
  orgId: uuid('org_id').notNull(),
  projectId: uuid('project_id').notNull(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  kind: text('kind').notNull(),
  refs: jsonb('refs').notNull(),
  body: jsonb('body').notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
  at: instant('at').notNull(),
  corrects: uuid('corrects')
}).existing()
