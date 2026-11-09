import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgView,
  text,
  time,
  unique,
  uuid
} from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { clauseSheet } from './clauses'
import { id, instant, sameOrg, tenantTable, timestamps } from './columns'

/** `Pack` (#79 §1). */
export const pack = pgEnum('pack', ['sky', 'crowd'])

/** TRD entities' project plus #79 §3's listed columns; `b-projects-api` adds the rest. RLS T and P. */
export const project = tenantTable(
  'project',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    timeZone: text('time_zone').notNull(),
    public: boolean('public').notNull().default(false),
    semesterEndsOn: date('semester_ends_on'),
    siteName: text('site_name'),
    siteLat: doublePrecision('site_lat'),
    siteLon: doublePrecision('site_lon'),
    archivedAt: instant('archived_at'),
    cameraDayStart: time('camera_day_start'),
    cameraDayEnd: time('camera_day_end'),
    warningAreaTerms: text('warning_area_terms')
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }),
    unique('project_org_id_slug_key').on(self.orgId, self.slug),
    // Target of the composite (org_id, project_id) foreign keys (TRD tenancy).
    unique('project_org_id_id_key').on(self.orgId, self.id)
  ]
)

/** TRD's project_pack plus #79 §3's `sla_s`; `b-source-binding` adds the rest. RLS T and P. */
export const projectPack = tenantTable(
  'project_pack',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    sheetId: uuid('sheet_id'),
    schedule: jsonb('schedule'),
    slaS: integer('sla_s'),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId, self.projectId], foreignColumns: [project.orgId, project.id] }).onDelete(
      'cascade'
    ),
    sameOrg('project_pack_sheet', self, self.sheetId, clauseSheet),
    unique('project_pack_project_id_pack_key').on(self.projectId, self.pack)
  ]
)

/** What `public_reader` sees of a project with `public = true` (P). Created in migration 0002. */
export const publicProject = pgView('public_project', {
  id: uuid('id').notNull(),
  orgId: uuid('org_id').notNull(),
  orgSlug: text('org_slug').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  timeZone: text('time_zone').notNull(),
  siteName: text('site_name'),
  siteLat: doublePrecision('site_lat'),
  siteLon: doublePrecision('site_lon'),
  archivedAt: instant('archived_at')
}).existing()

/** The packs of public projects (P). Created in migration 0002. */
export const publicProjectPack = pgView('public_project_pack', {
  projectId: uuid('project_id').notNull(),
  pack: pack('pack').notNull(),
  enabled: boolean('enabled').notNull()
}).existing()
