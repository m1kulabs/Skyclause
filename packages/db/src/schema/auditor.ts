import { sql } from 'drizzle-orm'
import { check, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, sameOrg } from './columns'
import { project } from './project'

/** Auditor conditions, readable only by system and retention (S). */
export const auditFinding = pgTable(
  'audit_finding',
  {
    id: id(),
    check: text('check').notNull(),
    key: text('key').notNull(),
    orgId: uuid('org_id').references(() => organization.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    refType: text('ref_type').notNull(),
    refId: text('ref_id').notNull(),
    accountIds: uuid('account_ids').array().notNull(),
    openedAt: instant('opened_at').notNull(),
    recoveredAt: instant('recovered_at')
  },
  (self) => [
    sameOrg('audit_finding_project', self, self.projectId, project, true),
    check('audit_finding_platform_project_null', sql`${self.orgId} IS NOT NULL OR ${self.projectId} IS NULL`),
    // Drizzle cannot express NULLS NOT DISTINCT on partial indexes; the migration adds it.
    uniqueIndex('audit_finding_open_identity')
      .on(self.check, self.orgId, self.projectId, self.key)
      .where(sql`${self.recoveredAt} IS NULL`)
  ]
)
