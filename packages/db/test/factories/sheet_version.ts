import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { clauseSheet, sheetVersion } from '../../src/schema'
import { makeClauseSheet } from './clause_sheet'
import { rowOf } from './rows'

/** Version 1, a draft, of `sheetId`, or of a new sheet. */
export async function makeSheetVersion(tx: Tx, overrides: Partial<typeof sheetVersion.$inferInsert> = {}) {
  const parent = overrides.sheetId ? await rowOf(tx, clauseSheet, overrides.sheetId) : await makeClauseSheet(tx)
  const [row] = await tx
    .insert(sheetVersion)
    .values({ orgId: tx.orgId!, n: 1, content: {}, contentHash: randomUUID(), ...overrides, sheetId: parent.id })
    .returning()
  return row!
}
