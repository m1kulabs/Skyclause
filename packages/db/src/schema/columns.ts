import { sql, type BuildExtraConfigColumns } from 'drizzle-orm'
import {
  index,
  pgTable,
  timestamp,
  uuid,
  type PgColumnBuilderBase,
  type PgTableExtraConfigValue
} from 'drizzle-orm/pg-core'

/** A UUIDv7 primary key (#79 conventions): `id uuid PRIMARY KEY DEFAULT uuidv7()`. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

/** An instant (#79 conventions: RFC 3339 UTC), stored as timestamptz. */
export const instant = (name: string) => timestamp(name, { withTimezone: true })

export const timestamps = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow()
})

const orgId = () => uuid('org_id').notNull()
type WithOrg<T> = T & { orgId: ReturnType<typeof orgId> }

/**
 * A tenant (T) table: `pgTable` plus `org_id uuid NOT NULL` and its index `<name>_org_id_idx`.
 *
 * drizzle-kit can't emit FORCE ROW LEVEL SECURITY or grants, so the migration that creates the table must also run
 * `SELECT tenant_table('<name>')` (defined in migration 0002), which enables and forces RLS, adds the policy
 * `org_id = current_org_id()` and grants `app`, `system` and `retention`. The RLS meta-test fails on any table with `org_id`
 * that skipped it, and the cross-organisation test on any T table without a factory.
 */
export function tenantTable<TName extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
  name: TName,
  columns: TColumns,
  extra?: (self: BuildExtraConfigColumns<TName, WithOrg<TColumns>, 'pg'>) => PgTableExtraConfigValue[]
) {
  return pgTable(name, { ...columns, orgId: orgId() } as WithOrg<TColumns>, (self) => [
    index(`${name}_org_id_idx`).on(self.orgId),
    ...(extra?.(self) ?? [])
  ])
}
