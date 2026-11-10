import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { withRetention, type Tx } from '../client'
import { clauseSheet, organization, source, sourceState } from '../schema'
import { poll, reading } from '../schema/partitioned'
import { OrganisationDeletionExpiredError, OrganisationNotFoundError } from './errors'

interface OrgColumnTable {
  schemaName: string
  tableName: string
  columns: string[]
}

interface ForeignKeyEdge {
  childSchema: string
  childTable: string
  parentSchema: string
  parentTable: string
}

const keyOf = (schemaName: string, tableName: string) => `${schemaName}.${tableName}`

async function organisationColumnTables(tx: Tx) {
  const result = await tx.execute(sql`
    SELECT table_schema AS "schemaName", table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns c
    JOIN pg_namespace ns ON ns.nspname = c.table_schema
    JOIN pg_class rel ON rel.relnamespace = ns.oid AND rel.relname = c.table_name
    WHERE c.table_schema IN ('public', 'auth')
      AND c.column_name IN ('org_id', 'owner_org_id', 'organization_id', 'organizationId')
      AND rel.relkind IN ('r', 'p') AND NOT rel.relispartition
    ORDER BY c.table_schema, c.table_name
  `)
  const grouped = new Map<string, OrgColumnTable>()
  for (const row of (
    result as unknown as { rows: Array<{ schemaName: string; tableName: string; columnName: string }> }
  ).rows) {
    const key = keyOf(row.schemaName, row.tableName)
    const table = grouped.get(key) ?? { schemaName: row.schemaName, tableName: row.tableName, columns: [] }
    table.columns.push(row.columnName)
    grouped.set(key, table)
  }
  return [...grouped.values()]
}

async function childFirstOrder(tx: Tx, tables: OrgColumnTable[]) {
  const result = await tx.execute(sql`
    SELECT child_ns.nspname AS "childSchema", child.relname AS "childTable",
      parent_ns.nspname AS "parentSchema", parent.relname AS "parentTable"
    FROM pg_constraint fk
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = fk.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE fk.contype = 'f' AND child_ns.nspname IN ('public', 'auth')
  `)
  const tableKeys = new Set(tables.map(({ schemaName, tableName }) => keyOf(schemaName, tableName)))
  const children = new Map<string, string[]>()
  for (const edge of (result as unknown as { rows: ForeignKeyEdge[] }).rows) {
    const child = keyOf(edge.childSchema, edge.childTable)
    const parent = keyOf(edge.parentSchema, edge.parentTable)
    if (!tableKeys.has(child) || !tableKeys.has(parent)) continue
    const values = children.get(parent) ?? []
    values.push(child)
    children.set(parent, values)
  }
  const byKey = new Map(tables.map((table) => [keyOf(table.schemaName, table.tableName), table]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const ordered: OrgColumnTable[] = []
  const visit = (key: string) => {
    if (visited.has(key) || visiting.has(key)) return
    visiting.add(key)
    for (const child of children.get(key) ?? []) visit(child)
    visiting.delete(key)
    visited.add(key)
    const table = byKey.get(key)
    if (table) ordered.push(table)
  }
  for (const table of tables) visit(keyOf(table.schemaName, table.tableName))
  return ordered
}

/** All organisations whose 30-day grace has ended, for `org:purge`. */
export async function listDueOrganisations(now: Date) {
  return withRetention('retention:org-purge-list', (tx) =>
    tx
      .select({ id: organization.id, slug: organization.slug, purgeAfter: organization.purgeAfter })
      .from(organization)
      .where(
        and(
          isNotNull(organization.deletionRequestedAt),
          isNotNull(organization.purgeAfter),
          lte(organization.purgeAfter, now)
        )
      )
  )
}

/** Removes every row keyed by this organisation ID plus source observations, then removes the Better Auth org row. */
export async function purgeOrganization(orgId: string, now = new Date()) {
  return withRetention('retention:org-purge', async (tx) => {
    const [org] = await tx.select().from(organization).where(eq(organization.id, orgId)).for('update').limit(1)
    if (!org) throw new OrganisationNotFoundError()
    if (!org.deletionRequestedAt || !org.purgeAfter || org.purgeAfter > now)
      throw new OrganisationDeletionExpiredError()

    const counts: Record<string, number> = {}
    const ownedSources = await tx.select({ id: source.id }).from(source).where(eq(source.ownerOrgId, orgId))
    const sourceIds = ownedSources.map(({ id }) => id)
    if (sourceIds.length) {
      const pollRows = await tx.delete(poll).where(inArray(poll.sourceId, sourceIds)).returning({ id: poll.id })
      const readingRows = await tx
        .delete(reading)
        .where(inArray(reading.sourceId, sourceIds))
        .returning({ id: reading.id })
      const stateRows = await tx
        .delete(sourceState)
        .where(inArray(sourceState.sourceId, sourceIds))
        .returning({ id: sourceState.sourceId })
      counts.poll = pollRows.length
      counts.reading = readingRows.length
      counts.source_state = stateRows.length
    }

    // Published sheets point back to their versions, which already belong to the sheet.
    await tx.update(clauseSheet).set({ liveVersionId: null }).where(eq(clauseSheet.orgId, orgId))
    const tables = await childFirstOrder(tx, await organisationColumnTables(tx))
    for (const table of tables) {
      const predicate = sql.join(
        table.columns.map((column) => sql`${sql.identifier(column)} = ${orgId}`),
        sql` OR `
      )
      const result = await tx.execute(
        sql`DELETE FROM ${sql.identifier(table.schemaName)}.${sql.identifier(table.tableName)} WHERE ${predicate} RETURNING 1 AS deleted`
      )
      const rowCount = (result as unknown as { rows: unknown[] }).rows.length
      counts[keyOf(table.schemaName, table.tableName)] = rowCount
    }
    const deleted = await tx.delete(organization).where(eq(organization.id, orgId)).returning({ id: organization.id })
    counts['auth.organization'] = deleted.length
    return { organisation: orgId, counts }
  })
}
