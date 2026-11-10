import type { SheetVersion } from '@skyclause/contracts'
import { and, eq } from 'drizzle-orm'
import type { Tx } from '../client'
import { clause, clauseSheet, sheetVersion } from '../schema'

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
