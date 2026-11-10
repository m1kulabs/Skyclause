import type { ChainRows } from '@skyclause/contracts'
import { and, asc, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import type { Tx } from './client'
import { aiKey, aiKeyTest, aiUsage, organization } from './schema'

// e-byok-api: the SQL behind sealed keys, key tests and usage (only packages/db writes SQL). Responses never carry
// key material: these helpers return rows, and the API service projects them to the contract's `AiKey` shape.

const live = (self: typeof aiKey) => and(isNull(self.deletedAt))

export type AiKeyRow = typeof aiKey.$inferSelect

function entryOf(row: AiKeyRow): ChainRows['orgKeys'][number] {
  return { provider: row.provider, model: row.model, keyId: row.id, declaredTier: row.declaredTier }
}

/** The flags and enabled, passing, live keys behind `ModelResolver.chain`. */
export async function loadAiKeyRows(tx: Tx, o: { orgId: string; accountId: string | null }): Promise<ChainRows> {
  const [org] = await tx
    .select({ allowMemberAiKeys: organization.allowMemberAiKeys, aiFallbackEnabled: organization.aiFallbackEnabled })
    .from(organization)
    .where(eq(organization.id, o.orgId))
    .limit(1)
  const orgRows = await tx
    .select()
    .from(aiKey)
    .where(
      and(
        eq(aiKey.orgId, o.orgId),
        eq(aiKey.ownerType, 'organisation'),
        eq(aiKey.enabled, true),
        eq(aiKey.lastTestOk, true),
        live(aiKey)
      )
    )
    .orderBy(asc(aiKey.priority), asc(aiKey.createdAt))
  const accountRows =
    o.accountId === null
      ? []
      : await tx
          .select()
          .from(aiKey)
          .where(
            and(
              eq(aiKey.orgId, o.orgId),
              eq(aiKey.ownerType, 'account'),
              eq(aiKey.accountId, o.accountId),
              eq(aiKey.enabled, true),
              eq(aiKey.lastTestOk, true),
              live(aiKey)
            )
          )
          .orderBy(asc(aiKey.priority), asc(aiKey.createdAt))
  return {
    orgKeys: orgRows.map(entryOf),
    accountKeys: accountRows.map(entryOf),
    allowMemberKeys: org?.allowMemberAiKeys ?? false,
    fallbackEnabled: org?.aiFallbackEnabled ?? false
  }
}

/** Live keys for the settings and list reads, organisations by priority and accounts by recency. */
export async function listAiKeys(
  tx: Tx,
  o: { owner: 'organisation' | 'account'; accountId?: string }
): Promise<AiKeyRow[]> {
  const owner =
    o.owner === 'account' && o.accountId
      ? and(eq(aiKey.ownerType, 'account'), eq(aiKey.accountId, o.accountId))
      : eq(aiKey.ownerType, 'organisation')
  return tx
    .select()
    .from(aiKey)
    .where(and(eq(aiKey.orgId, tx.orgId!), owner, live(aiKey)))
    .orderBy(asc(aiKey.priority), desc(aiKey.createdAt))
}

/** One key in this organisation, whatever its state; RLS keeps another organisation's row invisible. */
export async function getAiKey(tx: Tx, id: string): Promise<AiKeyRow | undefined> {
  const [row] = await tx
    .select()
    .from(aiKey)
    .where(and(eq(aiKey.orgId, tx.orgId!), eq(aiKey.id, id)))
    .limit(1)
  return row
}

export async function insertAiKey(tx: Tx, values: typeof aiKey.$inferInsert): Promise<AiKeyRow> {
  const [row] = await tx.insert(aiKey).values(values).returning()
  if (!row) throw new Error('insertAiKey inserted no row')
  return row
}

export async function updateAiKey(
  tx: Tx,
  id: string,
  patch: Partial<
    Pick<AiKeyRow, 'enabled' | 'priority' | 'declaredTier' | 'lastTestOk' | 'lastTestAt' | 'lastTestDetail'>
  >
): Promise<AiKeyRow | undefined> {
  const [row] = await tx
    .update(aiKey)
    .set(patch)
    .where(and(eq(aiKey.orgId, tx.orgId!), eq(aiKey.id, id)))
    .returning()
  return row
}

/** Deleting wipes the ciphertext and wrapped DEK and keeps the row for `ai_usage` history (ticket decision). */
export async function wipeAiKey(tx: Tx, id: string, now: Date): Promise<AiKeyRow | undefined> {
  const [row] = await tx
    .update(aiKey)
    .set({ ciphertext: '', wrappedDek: '', enabled: false, deletedAt: now })
    .where(and(eq(aiKey.orgId, tx.orgId!), eq(aiKey.id, id), isNull(aiKey.deletedAt)))
    .returning()
  return row
}

/** Records one minimal-call attempt and, for a saved key, its last test result. Append-only. */
export async function recordAiKeyTest(
  tx: Tx,
  o: { aiKeyId: string | null; fingerprint: string; ok: boolean; detail: string | null; at: Date }
): Promise<void> {
  await tx.insert(aiKeyTest).values({
    orgId: tx.orgId!,
    aiKeyId: o.aiKeyId,
    fingerprint: o.fingerprint,
    ok: o.ok,
    testedAt: o.at
  })
  if (o.aiKeyId !== null) {
    await tx
      .update(aiKey)
      .set({ lastTestOk: o.ok, lastTestAt: o.at, lastTestDetail: o.detail })
      .where(and(eq(aiKey.orgId, tx.orgId!), eq(aiKey.id, o.aiKeyId)))
  }
}

/** Attempts against one fingerprint since `since`, for the 10-an-hour test limit (ticket decision). */
export async function countAiKeyTestsSince(tx: Tx, o: { fingerprint: string; since: Date }): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(aiKeyTest)
    .where(
      and(eq(aiKeyTest.orgId, tx.orgId!), eq(aiKeyTest.fingerprint, o.fingerprint), gte(aiKeyTest.testedAt, o.since))
    )
    .limit(1)
  return row?.n ?? 0
}

/** Usage rows in `[from, to)`, newest first, after the cursor's `(created_at, id)` when given. */
export async function usageInRange(
  tx: Tx,
  o: { from: Date; to: Date; keyId?: string | null; limit: number; cursor?: { at: string; id: string } }
): Promise<Array<typeof aiUsage.$inferSelect>> {
  const key =
    o.keyId === undefined ? undefined : o.keyId === null ? isNull(aiUsage.aiKeyId) : eq(aiUsage.aiKeyId, o.keyId)
  const after = o.cursor
    ? sql`(${aiUsage.createdAt} < ${new Date(o.cursor.at)} OR (${aiUsage.createdAt} = ${new Date(o.cursor.at)} AND ${aiUsage.id} < ${o.cursor.id}))`
    : undefined
  return tx
    .select()
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.orgId, tx.orgId!),
        gte(aiUsage.createdAt, o.from),
        lte(aiUsage.createdAt, o.to),
        ...(key ? [key] : []),
        ...(after ? [after] : [])
      )
    )
    .orderBy(desc(aiUsage.createdAt), desc(aiUsage.id))
    .limit(o.limit + 1)
}

/** Organisations with a live sealed key, for the `kms:rewrap` sweep (needs `withSystem`; see migration). */
export async function listRewrapOrgs(tx: Tx): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ orgId: aiKey.orgId })
    .from(aiKey)
    .where(isNull(aiKey.deletedAt))
    .orderBy(aiKey.orgId)
  return rows.map((row) => row.orgId)
}

/** Live sealed rows in this organisation, for the `kms:rewrap` sweep. */
export async function listRewrappableKeys(tx: Tx): Promise<Pick<AiKeyRow, 'id' | 'kekVersion' | 'wrappedDek'>[]> {
  return tx
    .select({ id: aiKey.id, kekVersion: aiKey.kekVersion, wrappedDek: aiKey.wrappedDek })
    .from(aiKey)
    .where(and(eq(aiKey.orgId, tx.orgId!), live(aiKey)))
    .orderBy(asc(aiKey.createdAt))
}

/** Points one row at its rewrapped DEK on the primary KEK version. */
export async function updateWrappedDek(tx: Tx, id: string, wrappedDek: string, kekVersion: string): Promise<void> {
  await tx
    .update(aiKey)
    .set({ wrappedDek, kekVersion })
    .where(and(eq(aiKey.orgId, tx.orgId!), eq(aiKey.id, id)))
}
/** One live key in this organisation by fingerprint, so a resubmitted key answers 409 instead of a 500. */
export async function findAiKeyByFingerprint(tx: Tx, fingerprint: string): Promise<AiKeyRow | undefined> {
  const [row] = await tx
    .select()
    .from(aiKey)
    .where(and(eq(aiKey.orgId, tx.orgId!), eq(aiKey.fingerprint, fingerprint), isNull(aiKey.deletedAt)))
    .limit(1)
  return row
}

/** One key's organisation, for the worker's `modelFor` (needs `withSystem`; see migration). */
export async function findAiKeyOrg(tx: Tx, id: string): Promise<{ orgId: string } | undefined> {
  const [row] = await tx.select({ orgId: aiKey.orgId }).from(aiKey).where(eq(aiKey.id, id)).limit(1)
  return row
}

/** The organisation's AI flags behind settings and the chain. */
export async function orgAiFlags(tx: Tx): Promise<{ allowMemberAiKeys: boolean; aiFallbackEnabled: boolean }> {
  const [org] = await tx
    .select({ allowMemberAiKeys: organization.allowMemberAiKeys, aiFallbackEnabled: organization.aiFallbackEnabled })
    .from(organization)
    .where(eq(organization.id, tx.orgId!))
    .limit(1)
  return { allowMemberAiKeys: org?.allowMemberAiKeys ?? false, aiFallbackEnabled: org?.aiFallbackEnabled ?? false }
}

export async function setOrgAiFlags(
  tx: Tx,
  patch: { allowMemberAiKeys?: boolean; aiFallbackEnabled?: boolean }
): Promise<void> {
  await tx.update(organization).set(patch).where(eq(organization.id, tx.orgId!))
}

// TRD cost model: AI Studio list prices stand in for Vertex (`gemini-3.8-flash` $0.75 in / $3.75 out per 1M tokens),
// applied to every model as a rough estimate — BYOK usage is shown, never billed. USD→MYR at a fixed 4.70.
const USD_PER_M_IN = 0.75
const USD_PER_M_OUT = 3.75
const MYR_PER_USD = 4.7

/** Estimated MYR for one `ai_usage` row's tokens. */
export function estimateCostMyr(tokensIn: number, tokensOut: number): number {
  return ((tokensIn * USD_PER_M_IN + tokensOut * USD_PER_M_OUT) / 1_000_000) * MYR_PER_USD
}
