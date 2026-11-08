import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, sameOrg, tenantTable, timestamps } from './columns'
import { exportScope, guestSubjectKind, incidentScope, pilotArchiveKind, verificationTarget } from './enums'
import { project } from './project'
import { source } from './sources'

// #79 §3's S and G rows, and TRD's pilot_archive. S: `system` and `retention` only. G: read-only to `app` and
// `public_reader`, written by `system` (staff writes run as system, D30). `idempotency_key` and `rate_limit` are
// `f-api`'s (#93), which migrates them.

/** An account or organisation export (`a-data-rights`); objects sit under `orgs/{org_id}/`. S. */
export const exportJob = pgTable(
  'export_job',
  {
    id: id(),
    scope: exportScope('scope').notNull(),
    orgId: uuid('org_id'),
    accountId: uuid('account_id'),
    status: text('status').notNull().default('queued'),
    objectPath: text('object_path'),
    expiresAt: instant('expires_at'),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    check(
      'export_job_object_path_under_org',
      sql`${self.objectPath} IS NULL OR ${self.orgId} IS NULL OR ${self.objectPath} LIKE 'orgs/' || ${self.orgId} || '/%'`
    )
  ]
)

/** A guest subject's daily counters (GST-8, `d-guest-rules`). S. */
export const guestBudget = pgTable(
  'guest_budget',
  {
    id: id(),
    day: date('day').notNull(),
    subjectKind: guestSubjectKind('subject_kind').notNull(),
    subjectHash: text('subject_hash').notNull(),
    runs: integer('runs').notNull().default(0),
    evidence: integer('evidence').notNull().default(0),
    windows: integer('windows').notNull().default(0),
    modelTokens: integer('model_tokens').notNull().default(0)
  },
  (self) => [unique('guest_budget_day_subject_key').on(self.day, self.subjectKind, self.subjectHash)]
)

/** A blocked guest subject (GST-9, `d-guest-lifecycle`). G. */
export const guestBlock = pgTable(
  'guest_block',
  {
    id: id(),
    subjectKind: guestSubjectKind('subject_kind').notNull(),
    subjectHash: text('subject_hash').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [unique('guest_block_subject_key').on(self.subjectKind, self.subjectHash)]
)

/**
 * A live client check backing "Verified on <date>" (CAI-2, `e-connect-api`). G. Lives in `public`, apart from Better
 * Auth's `auth.verification`, hence the export name.
 */
export const clientVerification = pgTable('verification', {
  id: id(),
  target: verificationTarget('target').notNull(),
  clientVersion: text('client_version').notNull(),
  testedAt: instant('tested_at').notNull(),
  result: text('result').notNull(),
  testedBy: text('tested_by').notNull(),
  notes: text('notes'),
  createdAt: instant('created_at').notNull().defaultNow()
})

/** A status-page incident (`d-public-api`); mutable. G. */
export const incident = pgTable('incident', {
  id: id(),
  scope: incidentScope('scope').notNull(),
  component: text('component').notNull(),
  sourceId: uuid('source_id').references(() => source.id, { onDelete: 'cascade' }),
  ...timestamps()
})

/** An incident's update; append-only. G. */
export const incidentUpdate = pgTable('incident_update', {
  id: id(),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incident.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  body: text('body').notNull(),
  at: instant('at').notNull().defaultNow()
})

/** One status-probe result per component (`d-public-api`), kept 90 days; append-only. G. */
export const componentCheck = pgTable('component_check', {
  id: id(),
  component: text('component').notNull(),
  ok: boolean('ok').notNull(),
  at: instant('at').notNull().defaultNow()
})

/** A read-only pilot file linked from the project (TRD, LED-8); never in `ledger_entry`. T. */
export const pilotArchive = tenantTable(
  'pilot_archive',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    kind: pilotArchiveKind('kind').notNull(),
    objectPath: text('object_path').notNull(),
    sha256: text('sha256').notNull(),
    capturedAt: instant('captured_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('pilot_archive_project', self, self.projectId, project, true),
    check('pilot_archive_object_path_under_org', sql`${self.objectPath} LIKE 'orgs/' || ${self.orgId} || '/%'`)
  ]
)
