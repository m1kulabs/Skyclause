import { boolean, foreignKey, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, timestamps } from './columns'

/**
 * Feature flags (#79 §6, G): a row with `org_id` null is global, else it sets the flag for one organisation. Read-only to
 * `app` and `public_reader`; `system` writes them (#92's audited `flag:set`).
 */
export const featureFlag = pgTable(
  'feature_flag',
  {
    id: id(),
    key: text('key').notNull(),
    orgId: uuid('org_id'),
    enabled: boolean('enabled').notNull(),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    unique('feature_flag_key_org_id_key').on(self.key, self.orgId).nullsNotDistinct()
  ]
)
