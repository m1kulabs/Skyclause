import { SheetInput as RawSheet, Verdict, type Pack, type SheetVersion } from '@skyclause/contracts'
import { and, asc, eq, gt, gte, lte, isNull } from 'drizzle-orm'
import type { Tx } from '../client'
import { InvalidStoredPreviewRun, StoredSnapshotStep, StoredShadowStep, type StoredPreviewRun } from './stored'
import { bundle, call, clause, clauseSheet, run, runStep, sheetVersion, window } from '../schema'

export type SheetRow = typeof clauseSheet.$inferSelect
export type VersionRow = typeof sheetVersion.$inferSelect
type SheetInput = SheetVersion['content']
/** Engine output is structural JSON here; the API supplies authoritative checks and canonical hashes. */
export type SavedValidation = {
  check: {
    ok: boolean
    publishable: boolean
    issues: Array<{ clauseKey: string | null; message: string; offset: number; length: number }>
  } | null
  checked: (SheetInput & { contentHash: string; registryHash: string }) | null
  registryHash: string | null
}

export async function sheetById(tx: Tx, id: string, lock = false): Promise<SheetRow | null> {
  const query = tx.select().from(clauseSheet).where(eq(clauseSheet.id, id))
  const [row] = await (lock ? query.for('update') : query)
  return row ?? null
}

export async function versionByN(tx: Tx, sheetId: string, n: number): Promise<VersionRow | null> {
  const [row] = await tx
    .select()
    .from(sheetVersion)
    .where(and(eq(sheetVersion.sheetId, sheetId), eq(sheetVersion.n, n), eq(sheetVersion.status, 'published')))
  return row ?? null
}

export async function draftById(tx: Tx, sheetId: string, draftId: string, lock = false): Promise<VersionRow | null> {
  const query = tx
    .select()
    .from(sheetVersion)
    .where(and(eq(sheetVersion.sheetId, sheetId), eq(sheetVersion.id, draftId), eq(sheetVersion.status, 'draft')))
  const [row] = await (lock ? query.for('update') : query)
  return row ?? null
}

function validationFields(validation: SavedValidation) {
  return {
    checkResult: validation.check,
    checkedContent: validation.checked,
    validationRegistryHash: validation.registryHash
  }
}

export async function insertDraft(
  tx: Tx,
  input: { sheet: SheetRow; content: SheetInput; contentHash: string; baseN: number; validation: SavedValidation }
): Promise<VersionRow> {
  const [row] = await tx
    .insert(sheetVersion)
    .values({
      orgId: input.sheet.orgId,
      sheetId: input.sheet.id,
      n: null,
      status: 'draft',
      content: input.content,
      contentHash: input.contentHash,
      baseN: input.baseN,
      ...validationFields(input.validation)
    })
    .returning()
  return row!
}

export async function deleteDraft(tx: Tx, sheetId: string, draftId: string): Promise<string | null> {
  const [row] = await tx
    .delete(sheetVersion)
    .where(and(eq(sheetVersion.sheetId, sheetId), eq(sheetVersion.id, draftId), eq(sheetVersion.status, 'draft')))
    .returning({ id: sheetVersion.id })
  return row?.id ?? null
}

/** The caller owns the transaction and locks the parent before selecting the next published number. */
export async function promoteDraft(
  tx: Tx,
  input: {
    sheet: SheetRow
    draft: VersionRow
    n: number
    accountId: string
    publishedAt: Date
    validation: SavedValidation
  }
): Promise<VersionRow> {
  const [row] = await tx
    .update(sheetVersion)
    .set({
      status: 'published',
      n: input.n,
      publishedBy: input.accountId,
      publishedAt: input.publishedAt,
      updatedAt: input.publishedAt,
      ...validationFields(input.validation)
    })
    .where(
      and(
        eq(sheetVersion.sheetId, input.sheet.id),
        eq(sheetVersion.id, input.draft.id),
        eq(sheetVersion.status, 'draft')
      )
    )
    .returning()
  if (!row) throw new Error('Draft does not belong to this sheet or is no longer a draft')
  const content = row.content as SheetInput
  if (content.clauses.length)
    await tx.insert(clause).values(
      content.clauses.map((item) => ({
        orgId: row.orgId,
        sheetVersionId: row.id,
        key: item.key,
        requires: item.requires,
        span: item.span ?? null,
        when: item.when,
        proposes: item.proposes
      }))
    )
  await tx
    .update(clauseSheet)
    .set({ liveVersionId: row.id, updatedAt: input.publishedAt })
    .where(eq(clauseSheet.id, input.sheet.id))
  return row
}

export { InvalidStoredPreviewRun, StoredSnapshot, FrozenWindows } from './stored'
export type { StoredPreviewRun } from './stored'

export async function clauseSheetPage(
  tx: Tx,
  q: { projectId: string; after?: string; limit: number }
): Promise<SheetRow[]> {
  return tx
    .select()
    .from(clauseSheet)
    .where(and(eq(clauseSheet.projectId, q.projectId), q.after ? gt(clauseSheet.id, q.after) : undefined))
    .orderBy(asc(clauseSheet.id))
    .limit(q.limit + 1)
}
export async function sheetVersionPage(
  tx: Tx,
  q: { sheetId: string; status: 'draft' | 'published'; after?: string; limit: number }
): Promise<VersionRow[]> {
  return tx
    .select()
    .from(sheetVersion)
    .where(
      and(
        eq(sheetVersion.sheetId, q.sheetId),
        eq(sheetVersion.status, q.status),
        q.after ? gt(sheetVersion.id, q.after) : undefined
      )
    )
    .orderBy(asc(sheetVersion.id))
    .limit(q.limit + 1)
}
export async function liveSheetVersion(tx: Tx, sheet: SheetRow): Promise<VersionRow | null> {
  if (!sheet.liveVersionId) return null
  const [row] = await tx
    .select()
    .from(sheetVersion)
    .where(
      and(
        eq(sheetVersion.id, sheet.liveVersionId),
        eq(sheetVersion.sheetId, sheet.id),
        eq(sheetVersion.status, 'published')
      )
    )
  return row ?? null
}
export async function saveSheetPreview(tx: Tx, sheetId: string, draftId: string, preview: object): Promise<void> {
  await tx
    .update(sheetVersion)
    .set({ publishPreview: preview })
    .where(and(eq(sheetVersion.sheetId, sheetId), eq(sheetVersion.id, draftId), eq(sheetVersion.status, 'draft')))
}
export async function currentSheetWindows(tx: Tx, projectId: string) {
  const rows = await tx
    .select()
    .from(window)
    .where(and(eq(window.projectId, projectId), isNull(window.cancelledAt)))
    .orderBy(asc(window.id))
  return rows.map((w) => ({
    id: w.id,
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
    kind: w.kind,
    tz: w.tz
  }))
}
/** Every selected run must supply its recorded snapshot and scope. Never join today's windows into a replay. */
export async function storedPreviewRuns(
  tx: Tx,
  q: { projectId: string; pack: Pack; from: Date; to: Date }
): Promise<StoredPreviewRun[]> {
  const rows = await tx
    .select()
    .from(run)
    .where(
      and(
        eq(run.projectId, q.projectId),
        eq(run.pack, q.pack),
        gte(run.triggeredAt, q.from),
        lte(run.triggeredAt, q.to)
      )
    )
    .orderBy(asc(run.id))
  const output: StoredPreviewRun[] = []
  for (const row of rows) {
    const fail = (reason: string) => new InvalidStoredPreviewRun(row.id, reason)
    const steps = await tx.select().from(runStep).where(eq(runStep.runId, row.id))
    const snapshot = StoredSnapshotStep.safeParse(
      steps.find((s) => s.step === 'snapshot' && s.status === 'done')?.output
    )
    const shadow = StoredShadowStep.safeParse(steps.find((s) => s.step === 'shadow' && s.status === 'done')?.output)
    if (!snapshot.success || !shadow.success)
      throw fail('missing or invalid frozen snapshot, windows, or shadow metadata')
    const ss = snapshot.data,
      sh = shadow.data
    const [pin] = row.sheetVersionId
      ? await tx
          .select({ version: sheetVersion, sheet: clauseSheet })
          .from(sheetVersion)
          .innerJoin(clauseSheet, eq(sheetVersion.sheetId, clauseSheet.id))
          .where(eq(sheetVersion.id, row.sheetVersionId))
      : []
    if (
      !pin ||
      pin.sheet.projectId !== q.projectId ||
      pin.sheet.pack !== q.pack ||
      pin.version.status !== 'published' ||
      pin.version.n !== sh.n ||
      sh.versionId !== row.sheetVersionId ||
      ss.snapshot.projectId !== q.projectId ||
      ss.snapshot.pack !== q.pack ||
      ss.snapshotId !== row.snapshotId ||
      sh.verdictHash !== row.verdictHash ||
      sh.verdicts.hash !== sh.verdictHash
    )
      throw fail('inconsistent project, pack, snapshot, or version pins')
    if (!pin || pin.version.n === null) throw fail('missing pinned publication')
    const content = RawSheet.safeParse(pin.version.content)
    if (!content.success) throw fail('invalid pinned sheet content')
    if (
      row.windowIds.some((id) => !ss.windows.some((w) => w.id === id)) ||
      row.nightIds.some((id) => !ss.snapshot.nights.some((n) => n.id === id))
    )
      throw fail('missing frozen run scopes')
    const calls = await tx
      .select({ call, bundle })
      .from(call)
      .innerJoin(bundle, eq(call.bundleId, bundle.id))
      .where(eq(bundle.runId, row.id))
      .orderBy(asc(call.id))
    const parsedCalls = calls.map(({ call: c, bundle: b }) => {
      const v = Verdict.safeParse(c.shadow)
      if (!v.success || c.projectId !== q.projectId || b.projectId !== q.projectId || b.pack !== q.pack)
        throw fail(`invalid shadow or project for call ${c.id}`)
      const kind = c.windowId ? 'window' : c.nightId ? 'night' : 'site'
      const id = c.windowId ?? c.nightId
      if (
        v.data.pack !== q.pack ||
        v.data.scope.kind !== kind ||
        v.data.scope.id !== id ||
        (c.windowId && !ss.windows.some((w) => w.id === c.windowId)) ||
        (c.nightId && !ss.snapshot.nights.some((n) => n.id === c.nightId))
      )
        throw fail(`missing frozen scope for call ${c.id}`)
      const original = [...sh.verdicts.site, ...sh.verdicts.windows, ...sh.verdicts.nights].find(
        (v) => v.scope.kind === kind && v.scope.id === id
      )
      if (!original || original.mode !== v.data.mode || (original.noCall === null) !== (v.data.no_call === null))
        throw fail(`shadow does not match original engine verdict for call ${c.id}`)
      return { id: c.id, windowId: c.windowId, nightId: c.nightId, shadow: v.data }
    })
    output.push({
      id: row.id,
      versionId: sh.versionId,
      triggeredAt: row.triggeredAt.toISOString(),
      status: row.status,
      windowIds: [...row.windowIds].sort(),
      nightIds: [...row.nightIds].sort(),
      snapshotId: ss.snapshotId,
      snapshot: ss.snapshot,
      windows: ss.windows,
      verdicts: sh.verdicts,
      sheet: sh.sheet,
      version: { n: pin.version.n, content: content.data, contentHash: pin.version.contentHash },
      calls: parsedCalls
    })
  }
  return output
}

/** Resolve only a publication of this parent, for recognizing an already-promoted preview. */
export async function publishedSheetVersionById(
  tx: Tx,
  sheetId: string,
  versionId: string
): Promise<VersionRow | null> {
  const [row] = await tx
    .select()
    .from(sheetVersion)
    .where(and(eq(sheetVersion.sheetId, sheetId), eq(sheetVersion.id, versionId), eq(sheetVersion.status, 'published')))
  return row ?? null
}
