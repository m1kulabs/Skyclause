import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { clause, sheetVersion } from '../../src/schema'
import { makeSheetVersion } from './sheet_version'
import { rowOf } from './rows'

/** A clause of `sheetVersionId`, or of a new version. */
export async function makeClause(tx: Tx, overrides: Partial<typeof clause.$inferInsert> = {}) {
  const parent = overrides.sheetVersionId
    ? await rowOf(tx, sheetVersion, overrides.sheetVersionId)
    : await makeSheetVersion(tx)
  const [row] = await tx
    .insert(clause)
    .values({
      orgId: tx.orgId!,
      key: `clause_${randomUUID()}`,
      when: 'true',
      proposes: {},
      ...overrides,
      sheetVersionId: parent.id
    })
    .returning()
  return row!
}
