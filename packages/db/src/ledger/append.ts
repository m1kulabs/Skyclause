import { LedgerKind, type AppendLedger } from '@skyclause/contracts'
import { and, desc, eq, sql } from 'drizzle-orm'
import { holdsEmail } from '../audit'
import type { Tx } from '../client'
import { ledgerEntry } from '../schema'
import { GENESIS_HASH, entryHash } from './chain'

/**
 * #79 §1 appendLedger, in the caller's `withTenant` transaction: under a per-project advisory lock held to commit, the
 * next `seq` after the project's head, chained to its hash. Bodies hold counts, roles and pseudonymous IDs only (TRD),
 * so any email address in `refs` or `body` is refused. The head is read after the lock, which under read committed
 * (the `with*` default) sees the last committed append.
 */
export const appendLedger: AppendLedger = async (handle, { projectId, kind, refs, body, corrects }) => {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('appendLedger needs a withTenant transaction')
  LedgerKind.parse(kind)
  if (Object.values(refs).some((ref) => typeof ref !== 'string')) throw new Error('appendLedger: refs are strings')
  if (holdsEmail(refs) || holdsEmail(body)) {
    throw new Error('appendLedger: refs or body holds an email address; ledger entries carry no personal data')
  }
  if (corrects !== undefined && kind !== 'correction') throw new Error("appendLedger: corrects needs kind 'correction'")

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`skyclause.ledger:${projectId}`}, 0))`)
  if (corrects !== undefined) {
    const [earlier] = await tx
      .select({ id: ledgerEntry.id })
      .from(ledgerEntry)
      .where(and(eq(ledgerEntry.id, corrects), eq(ledgerEntry.projectId, projectId)))
    if (!earlier) throw new Error(`appendLedger: corrects names no entry of project ${projectId}`)
  }
  const [head] = await tx
    .select({ seq: ledgerEntry.seq, hash: ledgerEntry.hash })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.projectId, projectId))
    .orderBy(desc(ledgerEntry.seq))
    .limit(1)
  const entry = { prevHash: head?.hash ?? GENESIS_HASH, seq: (head?.seq ?? 0) + 1, kind, refs, body, at: new Date() }
  const [row] = await tx
    .insert(ledgerEntry)
    .values({ orgId: tx.orgId, projectId, ...entry, hash: entryHash(entry), corrects })
    .returning({ id: ledgerEntry.id, seq: ledgerEntry.seq, hash: ledgerEntry.hash })
  return row!
}
