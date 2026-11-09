import { sql } from 'drizzle-orm'
import { bigint, boolean, check, doublePrecision, integer, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core'
import { sheetVersion } from './clauses'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { subscriber } from './delivery'
import { evidenceRequesterKind, evidenceVia, gradeOutcome, mode, replyChannel } from './enums'
import { pack, project } from './project'
import { call } from './runs'
import { night, window } from './windows'

// TRD entities and #79 §3 rows for `c-grades`, `c-evidence`, `c-analysis-api` and `c-ledger-chain`. All T.

/** A live call's or night's grade (`c-grades`); append-only. P through `public_grade`. */
export const grade = tenantTable(
  'grade',
  {
    id: id(),
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
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    orgKey('grade', self),
    sameOrg('grade_project', self, self.projectId, project, true),
    sameOrg('grade_call', self, self.callId, call, true),
    sameOrg('grade_night', self, self.nightId, night, true),
    sameOrg('grade_window', self, self.windowId, window, true),
    sameOrg('grade_sheet_version', self, self.sheetVersionId, sheetVersion),
    check('grade_call_or_night', sql`num_nonnulls(${self.callId}, ${self.nightId}) = 1`)
  ]
)

/** A grade that needs a person's explanation (D26); unlike its grade, the explanation stays editable. */
export const reviewItem = tenantTable(
  'review_item',
  {
    id: id(),
    gradeId: uuid('grade_id').notNull().unique(),
    state: text('state').notNull().default('open'),
    explanation: text('explanation'),
    ...timestamps()
  },
  (self) => [sameOrg('review_item_grade', self, self.gradeId, grade, true)]
)

/**
 * An evidence request (LED-6); `span` is its time range. `c-evidence` (#159) adds who asked (`requester_kind` with
 * `account_id` or `subscriber_id`; `requester` holds that ID, or the share link's), the SES `message_id` of an emailed
 * request (at most one request per message), and the pack assembled at drafting with its `canonicalHash`.
 */
export const evidenceRequest = tenantTable(
  'evidence_request',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    spanFrom: instant('span_from').notNull(),
    spanTo: instant('span_to').notNull(),
    requester: text('requester').notNull(),
    requesterKind: evidenceRequesterKind('requester_kind').notNull(),
    accountId: uuid('account_id'),
    subscriberId: uuid('subscriber_id'),
    messageId: text('message_id').unique(),
    callId: uuid('call_id'),
    via: evidenceVia('via').notNull(),
    leavesOrg: boolean('leaves_org').notNull().default(false),
    replyChannel: replyChannel('reply_channel'),
    status: text('status').notNull().default('received'),
    pack: jsonb('pack'),
    packHash: text('pack_hash'),
    receivedAt: instant('received_at').notNull().defaultNow(),
    draftedAt: instant('drafted_at'),
    approvedAt: instant('approved_at'),
    repliedAt: instant('replied_at'),
    ...timestamps()
  },
  (self) => [
    orgKey('evidence_request', self),
    sameOrg('evidence_request_project', self, self.projectId, project, true),
    sameOrg('evidence_request_call', self, self.callId, call),
    sameOrg('evidence_request_subscriber', self, self.subscriberId, subscriber, true),
    check(
      'evidence_request_subscriber_kind',
      sql`(${self.requesterKind} = 'subscriber') = (${self.subscriberId} IS NOT NULL)`
    ),
    // LED-6: received ≤ drafted ≤ approved ≤ replied, pairwise, so a step that hasn't happened or doesn't apply (null)
    // is skipped; approval and reply need a draft.
    check(
      'evidence_request_times',
      sql`${self.draftedAt} >= ${self.receivedAt} AND ${self.approvedAt} >= ${self.draftedAt} AND ${self.repliedAt} >= ${self.receivedAt} AND ${self.repliedAt} >= ${self.draftedAt} AND ${self.repliedAt} >= ${self.approvedAt} AND (${self.approvedAt} IS NULL OR ${self.draftedAt} IS NOT NULL) AND (${self.repliedAt} IS NULL OR ${self.draftedAt} IS NOT NULL)`
    )
  ]
)

/** A computed analysis figure with its Wilson interval (`c-analysis-api`). */
export const analysisMetric = tenantTable(
  'analysis_metric',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    metric: text('metric').notNull(),
    x: integer('x').notNull(),
    n: integer('n').notNull(),
    low: doublePrecision('low').notNull(),
    high: doublePrecision('high').notNull(),
    computedAt: instant('computed_at').notNull().defaultNow()
  },
  (self) => [sameOrg('analysis_metric_project', self, self.projectId, project, true)]
)

/** The per-project hash chain (TRD, D11); append-only, `seq` gapless per project. P through `public_ledger_entry`. */
export const ledgerEntry = tenantTable(
  'ledger_entry',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    kind: text('kind').notNull(),
    refs: jsonb('refs').notNull(),
    body: jsonb('body').notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
    at: instant('at').notNull().defaultNow(),
    corrects: uuid('corrects')
  },
  (self) => [
    orgKey('ledger_entry', self),
    sameOrg('ledger_entry_project', self, self.projectId, project, true),
    sameOrg('ledger_entry_corrects', self, self.corrects, self),
    unique('ledger_entry_project_id_seq_key').on(self.projectId, self.seq)
  ]
)
