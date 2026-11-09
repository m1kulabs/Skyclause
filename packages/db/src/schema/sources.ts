import { sql } from 'drizzle-orm'
import { boolean, doublePrecision, foreignKey, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, sameOrg, tenantTable, timestamps } from './columns'
import { freshness, inputState, sourceKind, sourceRole } from './enums'
import { project } from './project'

/**
 * TRD's source plus #79 §3's columns; `b-sources-core` adds the rest. RLS C: a catalogue source (`owner_org_id` null,
 * from `catalogue-sync`, D16) is readable by every role, a device source (camera, Pi) only inside its organisation.
 */
export const source = pgTable(
  'source',
  {
    id: id(),
    kind: sourceKind('kind').notNull(),
    externalId: text('external_id').notNull(),
    ownerOrgId: uuid('owner_org_id'),
    name: text('name').notNull(),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    url: text('url').notNull(),
    cadenceS: integer('cadence_s').notNull(),
    freshness: freshness('freshness').notNull(),
    staleAfterS: integer('stale_after_s').notNull(),
    licenceId: text('licence_id').notNull(),
    licenceLabel: text('licence_label').notNull(),
    probation: boolean('probation').notNull().default(false),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'`),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.ownerOrgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    unique('source_owner_org_id_kind_external_id_key')
      .on(self.ownerOrgId, self.kind, self.externalId)
      .nullsNotDistinct()
  ]
)

/** A source bound to a project in a role (`b-source-binding`). T. */
export const projectSource = tenantTable(
  'project_source',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    role: sourceRole('role').notNull(),
    ...timestamps()
  },
  (self) => [
    sameOrg('project_source_project', self, self.projectId, project, true),
    unique('project_source_project_id_source_id_role_key').on(self.projectId, self.sourceId, self.role)
  ]
)

/** A source's freshness state (`b-evaluator`). C: follows its source. */
export const sourceState = pgTable('source_state', {
  sourceId: uuid('source_id')
    .primaryKey()
    .references(() => source.id, { onDelete: 'cascade' }),
  state: inputState('state').notNull(),
  since: instant('since').notNull(),
  httpStatus: integer('http_status'),
  pendingUntil: instant('pending_until'),
  updatedAt: instant('updated_at').notNull().defaultNow()
})
