import { and, eq, sql } from 'drizzle-orm'
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'
import type { Tx } from '../../src/client'
import { clauseSheet } from '../../src/schema'
import { makeClauseSheet } from './clause_sheet'
import { makeSheetVersion } from './sheet_version'

/** The row a factory's override points at, so a child takes its parent's project. */
export async function rowOf<T extends AnyPgTable & { id: AnyPgColumn }>(
  tx: Tx,
  table: T,
  id: string
): Promise<T['$inferSelect']> {
  const [row] = await tx
    .select()
    .from(table as AnyPgTable)
    .where(eq(table.id, id))
  if (!row) throw new Error(`no row ${id} visible in this transaction`)
  return row as T['$inferSelect']
}

/** The next per-project `seq` of a sequenced table. */
export async function nextSeq(tx: Tx, table: 'domain_event' | 'ledger_entry', projectId: string) {
  const { rows } = await tx.execute<{ seq: number }>(
    sql`SELECT coalesce(max(seq), 0)::int + 1 AS seq FROM ${sql.identifier(table)} WHERE project_id = ${projectId}`
  )
  return rows[0]!.seq
}

/** A new version of `projectId`'s Sky sheet, made first if the project has none. */
export async function sheetVersionIn(tx: Tx, projectId: string) {
  const [found] = await tx
    .select({ id: clauseSheet.id })
    .from(clauseSheet)
    .where(and(eq(clauseSheet.projectId, projectId), eq(clauseSheet.pack, 'sky')))
  const sheetId = found?.id ?? (await makeClauseSheet(tx, { projectId })).id
  const { rows } = await tx.execute<{ n: number }>(
    sql`SELECT coalesce(max(n), 0)::int + 1 AS n FROM sheet_version WHERE sheet_id = ${sheetId}`
  )
  return (await makeSheetVersion(tx, { sheetId, n: rows[0]!.n })).id
}
