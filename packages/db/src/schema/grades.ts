import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  integer,
  jsonb,
  text,
  unique,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { sheetVersion } from './clauses'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { subscriber } from './delivery'
import { evidenceRequesterKind, evidenceVia, gradeOutcome, mode, replyChannel } from './enums'
import { pack, project } from './project'
import { call } from './runs'
import { night, window } from './windows'

// TRD entities and #79 §3 rows for `c-grades`, `c-evidence`, `c-analysis-api` and `c-ledger-chain`. All T.

/**
 * A live call's, window's or night's grade (`c-grades`); append-only. P through `public_grade`. A Sky grade names its
 * call, or only its window when the shadow verdict fired and no call was drafted (ANL-2); a Crowd grade names its
 * night. One grade per call, per callless window and per night: the partial unique indexes make re-runs no-ops.
 */
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
    // The window's start or the night's date, in the project's time zone.
    localDate: date('local_date').notNull(),
    // Crowd: the night's actual exits and the forecast graded against, as it stood before the night. `forecast` has
    // no `(org_id, id)` key to point a composite foreign key at; RLS keeps the read in the organisation.
    actual: doublePrecision('actual'),
    forecastId: uuid('forecast_id'),
    bandLow: doublePrecision('band_low'),
    bandHigh: doublePrecision('band_high'),
    // What the grade read: the observation's readings, or the exits and baseline readings. Partitioned `reading`
    // can't be a foreign key target by `id` alone.
    readingIds: uuid('reading_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    orgKey('grade', self),
    sameOrg('grade_project', self, self.projectId, project, true),
    sameOrg('grade_call', self, self.callId, call, true),
    sameOrg('grade_night', self, self.nightId, night, true),
    sameOrg('grade_window', self, self.windowId, window, true),
    sameOrg('grade_sheet_version', self, self.sheetVersionId, sheetVersion),
    check(
      'grade_call_or_night',
      sql`num_nonnulls(${self.callId}, ${self.nightId}) = 1 OR (${self.callId} IS NULL AND ${self.nightId} IS NULL AND ${self.windowId} IS NOT NULL)`
    ),
    uniqueIndex('grade_call_id_key')
      .on(self.callId)
      .where(sql`${self.callId} IS NOT NULL`),
    uniqueIndex('grade_night_id_key')
      .on(self.nightId)
      .where(sql`${self.nightId} IS NOT NULL`),
    uniqueIndex('grade_window_id_key')
      .on(self.windowId)
      .where(sql`${self.callId} IS NULL AND ${self.nightId} IS NULL`)
  ]
)

/** Why a grade needs a person (ANL-2, ANL-4, TRD grading). */
export const REVIEW_REASONS = [
  'miss',
  'false_alarm',
  'expired_above_normal',
  'out_of_band',
  'unlisted_surge',
  'no_call'
] as const
export type ReviewReason = (typeof REVIEW_REASONS)[number]

/**
 * A grade that needs a person's explanation (D26), one per grade. Unlike its grade, the explanation stays editable,
 * and only it: migration `c-grades-review-guard` grants `app` and `system` UPDATE on the explanation columns alone.
 */
export const reviewItem = tenantTable(
  'review_item',
  {
    id: id(),
    gradeId: uuid('grade_id').notNull().unique(),
    state: text('state').notNull().default('open'),
    explanation: text('explanation'),
    reasons: text('reasons')
      .array()
      .notNull()
      .default(sql`'{}'`),
    explainedBy: uuid('explained_by'),
    explainedAt: instant('explained_at'),
    ...timestamps()
  },
  (self) => [
    sameOrg('review_item_grade', self, self.gradeId, grade, true),
    check(
      'review_item_reasons',
      sql`${self.reasons} <@ ARRAY[${sql.raw(REVIEW_REASONS.map((r) => `'${r}'`).join(', '))}]::text[]`
    )
  ]
)

/**
 * An evidence request (LED-6); `span` is its time range. `c-evidence` (#159) adds who asked (`requester_kind` with
 * `account_id` or `subscriber_id`; `requester` holds that ID, or the share link's), the SES `message_id` of an emailed
 * request (deduped by `handleOnce`), and the pack assembled at drafting with its `canonicalHash`.
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
    messageId: text('message_id'),
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
