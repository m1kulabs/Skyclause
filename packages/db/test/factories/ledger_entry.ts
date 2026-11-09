import type { AppendLedger } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { appendLedger } from '../../src/ledger'
import { ledgerEntry, project } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** The next entry of `projectId`'s chain (or the first of a new project), appended as writers do (#146). */
export async function makeLedgerEntry(
  tx: Tx,
  overrides: Partial<Omit<Parameters<AppendLedger>[1], 'projectId'>> & { projectId?: string } = {}
) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const { id } = await appendLedger(tx, {
    kind: 'clause_version',
    refs: {},
    body: {},
    ...overrides,
    projectId: parent.id
  })
  return rowOf(tx, ledgerEntry, id)
}
