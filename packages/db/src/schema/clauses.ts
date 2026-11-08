import { sql } from 'drizzle-orm'
import { integer, jsonb, text, unique, uuid, type PgTableExtraConfigValue } from 'drizzle-orm/pg-core'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { scopeKind, sheetStatus } from './enums'
import { pack, project } from './project'
import { source } from './sources'

// TRD entities and #79 §3 rows for `b-clause-sheets-api`, `b-replay`, `b-evaluator` and `b-device-ingest`. All T.

/** A project's clause sheet per pack; `live_version_id` is the published version in force. */
export const clauseSheet = tenantTable(
  'clause_sheet',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    liveVersionId: uuid('live_version_id'),
    ...timestamps()
  },
  (self): PgTableExtraConfigValue[] => [
    orgKey('clause_sheet', self),
    sameOrg('clause_sheet_project', self, self.projectId, project, true),
    sameOrg('clause_sheet_live_version', self, self.liveVersionId, sheetVersion),
    unique('clause_sheet_project_id_pack_key').on(self.projectId, self.pack)
  ]
)

/** A numbered version of a sheet; published versions are immutable (CLS-7). `published_by` null is the system (D18). */
export const sheetVersion = tenantTable(
  'sheet_version',
  {
    id: id(),
    sheetId: uuid('sheet_id').notNull(),
    n: integer('n').notNull(),
    status: sheetStatus('status').notNull().default('draft'),
    content: jsonb('content').notNull(),
    contentHash: text('content_hash').notNull(),
    publishedBy: uuid('published_by'),
    publishedAt: instant('published_at'),
    ...timestamps()
  },
  (self): PgTableExtraConfigValue[] => [
    orgKey('sheet_version', self),
    sameOrg('sheet_version_sheet', self, self.sheetId, clauseSheet, true),
    unique('sheet_version_sheet_id_n_key').on(self.sheetId, self.n)
  ]
)

/** One clause of a version (TRD clause shape). */
export const clause = tenantTable(
  'clause',
  {
    id: id(),
    sheetVersionId: uuid('sheet_version_id').notNull(),
    key: text('key').notNull(),
    requires: text('requires')
      .array()
      .notNull()
      .default(sql`'{}'`),
    span: jsonb('span'),
    when: text('when').notNull(),
    proposes: jsonb('proposes').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('clause_sheet_version', self, self.sheetVersionId, sheetVersion, true),
    unique('clause_sheet_version_id_key_key').on(self.sheetVersionId, self.key)
  ]
)

/** A stored replay (`b-replay`); `label` is always "replay" on display (D9). */
export const replayResult = tenantTable(
  'replay_result',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    sheetVersionId: uuid('sheet_version_id'),
    label: text('label').notNull().default('replay'),
    rangeFrom: instant('range_from').notNull(),
    rangeTo: instant('range_to').notNull(),
    summary: jsonb('summary').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('replay_result_project', self, self.projectId, project, true),
    sameOrg('replay_result_sheet_version', self, self.sheetVersionId, sheetVersion)
  ]
)

/** The inputs one evaluation saw (TRD); append-only, and runs, verdicts and approvals point at it. */
export const indicatorSnapshot = tenantTable(
  'indicator_snapshot',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    tEval: instant('t_eval').notNull(),
    inputs: jsonb('inputs').notNull(),
    site: jsonb('site').notNull(),
    series: jsonb('series').notNull(),
    nights: jsonb('nights').notNull(),
    hash: text('hash').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    orgKey('indicator_snapshot', self),
    sameOrg('indicator_snapshot_project', self, self.projectId, project, true)
  ]
)

/** The engine's current verdict per scope (mutable). `scope_id` is the window or night, null for the site. */
export const shadowState = tenantTable(
  'shadow_state',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    scopeKind: scopeKind('scope_kind').notNull(),
    scopeId: uuid('scope_id'),
    verdict: jsonb('verdict').notNull(),
    verdictHash: text('verdict_hash').notNull(),
    sheetVersionId: uuid('sheet_version_id').notNull(),
    since: instant('since').notNull(),
    ...timestamps()
  },
  (self) => [
    sameOrg('shadow_state_project', self, self.projectId, project, true),
    sameOrg('shadow_state_sheet_version', self, self.sheetVersionId, sheetVersion),
    unique('shadow_state_scope_key').on(self.projectId, self.pack, self.scopeKind, self.scopeId).nullsNotDistinct()
  ]
)

/** A changed verdict (TRD); append-only. `from` and `to` are the verdicts' modes, null for No call. */
export const crossing = tenantTable(
  'crossing',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    scopeKind: scopeKind('scope_kind').notNull(),
    scopeId: uuid('scope_id'),
    from: text('from'),
    to: text('to'),
    at: instant('at').notNull(),
    snapshotId: uuid('snapshot_id').notNull(),
    verdictHash: text('verdict_hash').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    orgKey('crossing', self),
    sameOrg('crossing_project', self, self.projectId, project, true),
    sameOrg('crossing_snapshot', self, self.snapshotId, indicatorSnapshot, true)
  ]
)

/** A person's label on a device frame during probation (`b-device-ingest`); append-only. */
export const probationLabel = tenantTable(
  'probation_label',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    // A reading's ID: a partitioned `reading` can't be a foreign key target by `id` alone.
    frameReadingId: uuid('frame_reading_id').notNull(),
    labellerId: uuid('labeller_id').notNull(),
    label: text('label').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [sameOrg('probation_label_project', self, self.projectId, project, true)]
)

/** The end of a device source's probation (`b-device-ingest`); append-only. */
export const probationResolution = tenantTable(
  'probation_resolution',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    resolvedBy: uuid('resolved_by'),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [sameOrg('probation_resolution_project', self, self.projectId, project, true)]
)
