import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { ledgerEntry, project } from '../../src/schema'
import { makeProject } from './project'
import { nextSeq, rowOf } from './rows'

/** The next ledger entry of `projectId`, or the first of a new project. */
export async function makeLedgerEntry(tx: Tx, overrides: Partial<typeof ledgerEntry.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(ledgerEntry)
    .values({
      orgId: tx.orgId!,
      seq: overrides.seq ?? (await nextSeq(tx, 'ledger_entry', parent.id)),
      kind: 'clause_version',
      refs: {},
      body: {},
      prevHash: '0'.repeat(64),
      hash: randomUUID(),
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
