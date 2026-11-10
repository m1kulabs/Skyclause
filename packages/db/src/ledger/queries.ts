import type { TxHandle } from '@skyclause/contracts'
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  getViewSelectedFields,
  gt,
  inArray,
  isNotNull,
  lt,
  lte,
  sql,
  type SQL
} from 'drizzle-orm'
import type { Tx } from '../client'
import { call, grade, ledgerEntry, project, publicCall, window } from '../schema'

// #146 ticket decision, reads: `from` and `to` are local dates on `at` in the project's zone; `pack` and `mode` match
// `body.pack` and `body.mode`; `state` matches `kind` (`call_<state>`, so a state with no ledger kind matches none).

export interface LedgerFilters {
  from?: string
  to?: string
  pack?: string
  mode?: string
  state?: string
  kind?: string
}

/**
 * Who reads: a `member` sees a call whole; anyone else sees what `public_call` shows, which is approved calls without
 * `notices`, `recipients`, `recommendations` or `reason`. `recipients` are subscriber IDs and never leave this module.
 */
export type LedgerAudience = 'member' | 'public'

const { recipients: _recipients, ...memberCallColumns } = getTableColumns(call)
// Named by `public_call`'s own columns, so a column added to `call` stays private until the view lists it.
const publicCallColumns = Object.fromEntries(
  Object.keys(getViewSelectedFields(publicCall)).map((key) => [key, call[key as keyof typeof call.$inferSelect]])
) as Omit<typeof memberCallColumns, 'notices' | 'recommendations' | 'reason'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The project's time zone, or null when the transaction can't see it. */
export async function ledgerProject(handle: TxHandle, projectId: string) {
  const tx = handle as Tx
  if (!UUID.test(projectId)) return null
  const [row] = await tx.select({ timeZone: project.timeZone }).from(project).where(eq(project.id, projectId))
  return row ?? null
}

function matching(projectId: string, timeZone: string, f: LedgerFilters): SQL {
  const localDate = sql`(${ledgerEntry.at} AT TIME ZONE ${timeZone})::date`
  return and(
    eq(ledgerEntry.projectId, projectId),
    f.from ? sql`${localDate} >= ${f.from}::date` : undefined,
    f.to ? sql`${localDate} <= ${f.to}::date` : undefined,
    f.pack ? sql`${ledgerEntry.body}->>'pack' = ${f.pack}` : undefined,
    f.mode ? sql`${ledgerEntry.body}->>'mode' = ${f.mode}` : undefined,
    f.state ? eq(ledgerEntry.kind, `call_${f.state}`) : undefined,
    f.kind ? eq(ledgerEntry.kind, f.kind) : undefined
  )!
}

const entryColumns = {
  id: ledgerEntry.id,
  projectId: ledgerEntry.projectId,
  seq: ledgerEntry.seq,
  kind: ledgerEntry.kind,
  refs: ledgerEntry.refs,
  body: ledgerEntry.body,
  prevHash: ledgerEntry.prevHash,
  hash: ledgerEntry.hash,
  at: ledgerEntry.at,
  corrects: ledgerEntry.corrects
}

/**
 * Newest first, `limit + 1` rows below `beforeSeq`, each with the window, grade and call its refs name (the call as
 * `audience` may see it); and the total.
 */
export async function listLedger(
  handle: TxHandle,
  q: {
    projectId: string
    timeZone: string
    filters: LedgerFilters
    limit: number
    beforeSeq?: number
    audience: LedgerAudience
  }
) {
  const tx = handle as Tx
  const where = matching(q.projectId, q.timeZone, q.filters)
  const entries = await tx
    .select(entryColumns)
    .from(ledgerEntry)
    .where(and(where, q.beforeSeq === undefined ? undefined : lt(ledgerEntry.seq, q.beforeSeq)))
    .orderBy(desc(ledgerEntry.seq))
    .limit(q.limit + 1)
  const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(ledgerEntry).where(where)
  const named = (key: string) =>
    entries.flatMap(({ refs }) => {
      const id = (refs as Record<string, unknown>)[key]
      return typeof id === 'string' && UUID.test(id) ? [id] : []
    })
  const windowIds = named('window_id')
  const gradeIds = named('grade_id')
  const callIds = named('call_id')
  const windows = windowIds.length
    ? await tx
        .select({
          id: window.id,
          projectId: window.projectId,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          title: window.title,
          kind: window.kind,
          tz: window.tz,
          declaredBy: window.declaredBy,
          guest: window.guest,
          via: window.via,
          expiresAt: window.expiresAt,
          seriesId: window.seriesId,
          icsFeedId: window.icsFeedId,
          cancelledAt: window.cancelledAt,
          shareLinkId: window.shareLinkId,
          moderation: window.moderation
        })
        .from(window)
        .where(inArray(window.id, windowIds))
    : []
  const grades = gradeIds.length
    ? await tx
        .select({
          id: grade.id,
          callId: grade.callId,
          nightId: grade.nightId,
          outcome: grade.outcome,
          sheetVersionId: grade.sheetVersionId,
          pack: grade.pack,
          windowId: grade.windowId,
          proposedMode: grade.proposedMode,
          observedMode: grade.observedMode,
          modeDiff: grade.modeDiff,
          noCall: grade.noCall,
          agrees: grade.agrees,
          staleInputs: grade.staleInputs
        })
        .from(grade)
        .where(inArray(grade.id, gradeIds))
    : []
  const calls = callIds.length
    ? q.audience === 'public'
      ? await tx
          .select(publicCallColumns)
          .from(call)
          .where(and(inArray(call.id, callIds), eq(call.projectId, q.projectId), isNotNull(call.approvedAt)))
      : await tx
          .select(memberCallColumns)
          .from(call)
          .where(and(inArray(call.id, callIds), eq(call.projectId, q.projectId)))
    : []
  const windowById = new Map(windows.map((row) => [row.id, row]))
  const gradeById = new Map(grades.map((row) => [row.id, row]))
  const callById = new Map<string, (typeof calls)[number]>(calls.map((row) => [row.id, row]))
  const rows = entries.map((entry) => {
    const refs = entry.refs as Record<string, string>
    return {
      ...entry,
      refs,
      window: windowById.get(refs.window_id ?? '') ?? null,
      grade: gradeById.get(refs.grade_id ?? '') ?? null,
      call: callById.get(refs.call_id ?? '') ?? null
    }
  })
  return { rows, total }
}

/** Oldest first, up to `limit` entries after `afterSeq` and at most `uptoSeq`, for the CSV export. */
export async function ledgerCsvPage(
  handle: TxHandle,
  q: { projectId: string; timeZone: string; filters: LedgerFilters; afterSeq: number; uptoSeq: number; limit: number }
) {
  const tx = handle as Tx
  return tx
    .select(entryColumns)
    .from(ledgerEntry)
    .where(
      and(
        matching(q.projectId, q.timeZone, q.filters),
        gt(ledgerEntry.seq, q.afterSeq),
        lte(ledgerEntry.seq, q.uptoSeq)
      )
    )
    .orderBy(asc(ledgerEntry.seq))
    .limit(q.limit)
}

/** The project's head `seq`, 0 for an empty ledger. */
export async function ledgerHeadSeq(handle: TxHandle, projectId: string) {
  const tx = handle as Tx
  const [row] = await tx
    .select({ seq: ledgerEntry.seq })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.projectId, projectId))
    .orderBy(desc(ledgerEntry.seq))
    .limit(1)
  return row?.seq ?? 0
}
