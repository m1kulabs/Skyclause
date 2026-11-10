import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { indicatorSnapshot, sheetVersion } from './clauses'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { approvalAction, bundleState, callState, mode, runStatus, runTrigger } from './enums'
import { evidenceRequest } from './grades'
import { pack, project } from './project'
import { listing, night, window } from './windows'

// TRD entities and #79 §3 rows for `c-run-orchestrator`, `c-bundle-lifecycle` and `c-approval-api`. All T; `call` P.

/** A run of the decision agent (TRD). `requestRun` relies on the two unique indexes (#79 §1). */
export const run = tenantTable(
  'run',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    trigger: runTrigger('trigger').notNull(),
    triggerRef: text('trigger_ref'),
    dedupeKey: text('dedupe_key').notNull(),
    sheetVersionId: uuid('sheet_version_id'),
    snapshotId: uuid('snapshot_id'),
    windowIds: uuid('window_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    // c-run-orchestrator: a Crowd run's nights, the dedupe keys coalesced into this run, and who asked by POST
    // (`{kind, account_id}`, IDs only).
    nightIds: uuid('night_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    coalescedKeys: text('coalesced_keys')
      .array()
      .notNull()
      .default(sql`'{}'`),
    requestedBy: jsonb('requested_by'),
    status: runStatus('status').notNull().default('queued'),
    reason: text('reason'),
    verdictHash: text('verdict_hash'),
    model: text('model'),
    provider: text('provider'),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    triggeredAt: instant('triggered_at').notNull(),
    traceId: text('trace_id'),
    ...timestamps()
  },
  (self) => [
    orgKey('run', self),
    sameOrg('run_project', self, self.projectId, project, true),
    sameOrg('run_sheet_version', self, self.sheetVersionId, sheetVersion),
    sameOrg('run_snapshot', self, self.snapshotId, indicatorSnapshot),
    uniqueIndex('run_dedupe_key_key').on(self.dedupeKey),
    // One queued run per project and pack: a later trigger coalesces into it.
    uniqueIndex('run_one_queued_key')
      .on(self.projectId, self.pack)
      .where(sql`${self.status} = 'queued'`),
    // c-run-orchestrator: one run per project and pack walks its steps at a time.
    uniqueIndex('run_one_running_key')
      .on(self.projectId, self.pack)
      .where(sql`${self.status} = 'running'`)
  ]
)

/** One resumable step of a run (snapshot, shadow, draft, validate, persist). */
export const runStep = tenantTable(
  'run_step',
  {
    id: id(),
    runId: uuid('run_id').notNull(),
    step: text('step').notNull(),
    status: text('status').notNull(),
    output: jsonb('output'),
    startedAt: instant('started_at').notNull().defaultNow(),
    finishedAt: instant('finished_at')
  },
  (self) => [
    sameOrg('run_step_run', self, self.runId, run, true),
    uniqueIndex('run_step_run_id_step_key').on(self.runId, self.step)
  ]
)

/** A drafted bundle of calls awaiting approval (TRD bundle state machine). */
export const bundle = tenantTable(
  'bundle',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    runId: uuid('run_id').notNull(),
    pack: pack('pack').notNull(),
    state: bundleState('state').notNull().default('drafted'),
    supersededBy: uuid('superseded_by'),
    reviewHash: text('review_hash').notNull(),
    slaDueAt: instant('sla_due_at'),
    needsReviewAt: instant('needs_review_at'),
    approvedBy: uuid('approved_by'),
    approvedAt: instant('approved_at'),
    escalationLevel: integer('escalation_level').notNull().default(0),
    draftOnly: boolean('draft_only').notNull().default(false),
    // #499: the windows and nights whose engine verdict fired with no call in the draft (#467's `missing` rows), each
    // with its approver's resolution (`MissingCall` in bundles/machine.ts).
    missing: jsonb('missing')
      .notNull()
      .default(sql`'[]'`),
    traceId: text('trace_id'),
    ...timestamps()
  },
  (self) => [
    orgKey('bundle', self),
    sameOrg('bundle_project', self, self.projectId, project, true),
    sameOrg('bundle_run', self, self.runId, run, true),
    sameOrg('bundle_superseded_by', self, self.supersededBy, self),
    index('bundle_project_id_state_idx').on(self.projectId, self.state)
  ]
)

/** One call in a bundle, for a window or a night (CAL-12 delays included). P through `public_call`. */
export const call = tenantTable(
  'call',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    bundleId: uuid('bundle_id').notNull(),
    windowId: uuid('window_id'),
    nightId: uuid('night_id'),
    mode: mode('mode'),
    watch: boolean('watch').notNull().default(false),
    noCall: jsonb('no_call'),
    fired: jsonb('fired')
      .notNull()
      .default(sql`'[]'`),
    recommendations: text('recommendations')
      .array()
      .notNull()
      .default(sql`'{}'`),
    reason: text('reason'),
    // c-bundle-lifecycle: the drafted wording per language and the candidate recipient IDs (TRD agent output).
    notices: jsonb('notices')
      .notNull()
      .default(sql`'[]'`),
    recipients: text('recipients')
      .array()
      .notNull()
      .default(sql`'{}'`),
    shadow: jsonb('shadow').notNull(),
    chosen: text('chosen').notNull(),
    agrees: boolean('agrees').notNull(),
    decision: text('decision'),
    state: callState('state').notNull().default('drafted'),
    supersededByCallId: uuid('superseded_by_call_id'),
    icsUid: text('ics_uid'),
    icsSequence: integer('ics_sequence').notNull().default(0),
    expiresAt: instant('expires_at').notNull(),
    triggeredAt: instant('triggered_at').notNull(),
    draftedAt: instant('drafted_at').notNull().defaultNow(),
    approvedAt: instant('approved_at'),
    sentAt: instant('sent_at'),
    traceId: text('trace_id'),
    ...timestamps()
  },
  (self) => [
    orgKey('call', self),
    sameOrg('call_project', self, self.projectId, project, true),
    sameOrg('call_bundle', self, self.bundleId, bundle, true),
    sameOrg('call_window', self, self.windowId, window),
    sameOrg('call_night', self, self.nightId, night),
    sameOrg('call_superseded_by', self, self.supersededByCallId, self),
    check('call_window_or_night', sql`${self.windowId} IS NULL OR ${self.nightId} IS NULL`)
  ]
)

/** An approver's action (TRD); append-only. Points at a bundle, a listing or an evidence request. */
export const approval = tenantTable(
  'approval',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    bundleId: uuid('bundle_id'),
    listingId: uuid('listing_id'),
    evidenceRequestId: uuid('evidence_request_id'),
    callId: uuid('call_id'),
    actorId: uuid('actor_id').notNull(),
    action: approvalAction('action').notNull(),
    diff: jsonb('diff'),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('approval_project', self, self.projectId, project, true),
    sameOrg('approval_bundle', self, self.bundleId, bundle, true),
    sameOrg('approval_listing', self, self.listingId, listing, true),
    sameOrg('approval_evidence_request', self, self.evidenceRequestId, evidenceRequest, true),
    sameOrg('approval_call', self, self.callId, call, true),
    check('approval_target', sql`num_nonnulls(${self.bundleId}, ${self.listingId}, ${self.evidenceRequestId}) = 1`)
  ]
)
