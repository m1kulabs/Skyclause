import { asc, eq, sql } from 'drizzle-orm'
import type { TxHandle } from '@skyclause/contracts'
import type { Tx } from '../client'
import { ledgerEntry } from '../schema'
import { GENESIS_HASH, entryHash } from './chain'

export type LedgerBreak = 'seq_gap' | 'prev_hash' | 'hash'

/** #146 ticket decision; on a break, `count` and `head_hash` describe the good entries before it. */
export type LedgerVerdict =
  | { ok: true; count: number; head_hash: string }
  | { ok: false; count: number; head_hash: string; first_bad: { id: string; seq: number; reason: LedgerBreak } }

/**
 * #79 §1 verifyLedger (LED-2): walks the project's chain by `seq` from 1 and names the first bad entry. Where `seq`
 * skips, the entry chained to the last good one has had its `seq` changed and is named; with none, the next entry by
 * `seq` follows a removed one. Then `prev_hash` must be the last good hash, and the stored fields must hash to `hash`.
 */
export async function verifyLedger(handle: TxHandle, projectId: string): Promise<LedgerVerdict> {
  const tx = handle as Tx
  // Without an organisation set, RLS shows no ledger rows, so an empty walk would read as a verified chain.
  if (!tx.orgId) throw new Error('verifyLedger needs a withTenant transaction')
  const rows = await tx
    .select({
      id: ledgerEntry.id,
      seq: ledgerEntry.seq,
      kind: ledgerEntry.kind,
      refs: ledgerEntry.refs,
      body: ledgerEntry.body,
      at: ledgerEntry.at,
      // `at` is stamped in milliseconds, which is all a JS Date holds; a finer change is caught here instead.
      subMs: sql<boolean>`${ledgerEntry.at} <> date_trunc('milliseconds', ${ledgerEntry.at})`,
      prevHash: ledgerEntry.prevHash,
      hash: ledgerEntry.hash
    })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.projectId, projectId))
    .orderBy(asc(ledgerEntry.seq))
  const bySeq = new Map(rows.map((row) => [row.seq, row]))
  let headHash = GENESIS_HASH
  for (let count = 0; count < rows.length; count++) {
    const fail = (row: (typeof rows)[number], reason: LedgerBreak): LedgerVerdict => ({
      ok: false,
      count,
      head_hash: headHash,
      first_bad: { id: row.id, seq: row.seq, reason }
    })
    const row = bySeq.get(count + 1)
    if (!row) {
      const moved = rows.find((other) => other.prevHash === headHash && (other.seq < 1 || other.seq > count + 1))
      return fail(moved ?? rows.find((other) => other.seq > count + 1)!, 'seq_gap')
    }
    if (row.prevHash !== headHash) return fail(row, 'prev_hash')
    if (row.subMs || entryHash(row) !== row.hash) return fail(row, 'hash')
    headHash = row.hash
  }
  return { ok: true, count: rows.length, head_hash: headHash }
}
