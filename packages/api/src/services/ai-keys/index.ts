import { KEY_PROVIDERS, testKey } from '@skyclause/agent'
import { fingerprintKey, sealAad, sealSecret } from '@skyclause/config/crypto'
import type { Operations } from '@skyclause/contracts'
import {
  countAiKeyTestsSince,
  estimateCostMyr,
  findAiKeyByFingerprint,
  getAiKey,
  insertAiKey,
  listAiKeys,
  orgAiFlags,
  recordAudit,
  recordAiKeyTest,
  setOrgAiFlags,
  updateAiKey,
  usageInRange,
  wipeAiKey,
  type AiKeyRow
} from '@skyclause/db'
import type { z } from '@hono/zod-openapi'
import { decodeCursor, encodeCursor } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { TEST_LIMIT, TEST_WINDOW_MS, aiKeyPorts } from './ports'

// e-byok-api (#79 §4): organisation and personal AI keys, settings and usage. Saved secrets stay write-only (SET-5):
// no view below carries a key, ciphertext or wrapped DEK, and the plaintext lives only in the creating request.

type Json<Id extends keyof Operations, Status extends keyof Operations[Id]['responses']> = Extract<
  Operations[Id]['responses'][Status],
  { content: { 'application/json': { schema: unknown } } }
>['content']['application/json']['schema']
type OrgList = z.infer<Json<'listOrganisationAiKeys', 200>>
type OrgKeyView = OrgList['data'][number]
type MyList = z.infer<Json<'listMyAiKeys', 200>>
type MyKeyView = MyList['data'][number]
type OrgUsagePage = z.infer<Json<'getOrganisationAiKeyUsage', 200>>
type SettingsView = z.infer<Json<'getOrganisationAiSettings', 200>>
type V1UsageView = z.infer<Json<'getUsage', 200>>
type OrgCreatedView = z.infer<Json<'createOrganisationAiKey', 201>>
type MyCreatedView = z.infer<Json<'createMyAiKey', 201>>
type OrgTestView = z.infer<Json<'testOrganisationAiKey', 200>>
type MyTestView = z.infer<Json<'testMyAiKey', 200>>
type MyUsageView = z.infer<Json<'getMyAiKeyUsage', 200>>

/** A UUIDv7 (RFC 9562) for rows whose ID the seal's AAD must name before the insert (#79 conventions). */
function uuidv7(now: Date = new Date()): string {
  const bytes = new Uint8Array(16)
  const ms = now.getTime()
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff
  bytes[5] = ms & 0xff
  crypto.getRandomValues(bytes.subarray(6))
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b!.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const PROVIDERS = new Set<string>(KEY_PROVIDERS)
const TIERS = new Set(['paid', 'free', 'unknown'])
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const MYT_OFFSET_MS = 8 * 60 * 60_000

const notFound = (what: string) => new ApiError(404, 'not-found', `No such AI key${what}.`)
const failedTest = (detail: string | null) =>
  new ApiError(422, 'key-test-failed', detail ?? 'The provider rejected the key.', {
    errors: [{ in: 'body', pointer: '/key', detail: detail ?? 'The provider rejected the key.' }]
  })
const rateLimited = () =>
  new ApiError(
    429,
    'rate-limited',
    'This key was tested too many times in the last hour.',
    {},
    { 'Retry-After': '360' }
  )

const checkProvider = (provider: string) => {
  if (!PROVIDERS.has(provider)) {
    throw new ApiError(422, 'validation-failed', `Unknown provider ${provider}.`, {
      errors: [{ in: 'body', pointer: '/provider', detail: `Unknown provider ${provider}.` }]
    })
  }
}

const checkTier = (tier: string) => {
  if (!TIERS.has(tier)) {
    throw new ApiError(422, 'validation-failed', `Unknown tier ${tier}.`, {
      errors: [{ in: 'body', pointer: '/declared_tier', detail: `Unknown tier ${tier}.` }]
    })
  }
}

/** This MYT month as `YYYY-MM`. */
export const currentMytMonth = (now: Date): string => new Date(now.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 7)

/** `[from, to)` in UTC covering a MYT `YYYY-MM` month. */
export function mytMonthRange(month: string): { from: Date; to: Date } {
  const match = MONTH.exec(month)
  if (!match) {
    throw new ApiError(422, 'validation-failed', `month must be YYYY-MM, got ${month}.`, {
      errors: [{ in: 'query', pointer: '/month', detail: 'Use YYYY-MM.' }]
    })
  }
  const year = Number(match[0]!.slice(0, 4))
  const start = Number(match[0]!.slice(5, 7))
  const from = new Date(Date.UTC(year, start - 1, 1) - MYT_OFFSET_MS)
  const to = new Date(Date.UTC(year, start, 1) - MYT_OFFSET_MS)
  return { from, to }
}

const baseView = (row: AiKeyRow) => ({
  id: row.id,
  provider: row.provider,
  owner_type: row.ownerType,
  last4: row.last4,
  fingerprint: row.fingerprint,
  model: row.model,
  enabled: row.enabled,
  declared_tier: row.declaredTier,
  priority: row.priority
})

const lastTestOf = (row: AiKeyRow) =>
  row.lastTestAt === null
    ? null
    : { ok: row.lastTestOk ?? false, tested_at: instant(row.lastTestAt), detail: row.lastTestDetail }

const orgView = (row: AiKeyRow): OrgKeyView => ({ ...baseView(row), last_test: lastTestOf(row) })

const myView = (row: AiKeyRow): MyKeyView => ({
  ...baseView(row),
  last_test_result: row.lastTestAt === null ? null : row.lastTestOk === true ? 'passed' : 'failed'
})

const afterCreate = (row: AiKeyRow) => ({
  provider: row.provider,
  model: row.model,
  last4: row.last4,
  fingerprint: row.fingerprint,
  declared_tier: row.declaredTier,
  enabled: row.enabled,
  priority: row.priority,
  owner_type: row.ownerType
})

const audited = async (ctx: ServiceContext, action: 'ai_key.created' | 'ai_key.revoked', row: AiKeyRow) =>
  recordAudit(ctx.tx, { action, target: { type: 'ai_key', id: row.id }, after: afterCreate(row) })

/** Newest-first rows sliced to the page, with the cursor after the last of them while more remain. */
function pageByTime<Row extends { createdAt: Date; id: string }, View>(
  rows: Row[],
  limit: number,
  view: (row: Row) => View
): { data: View[]; next_cursor: string | null } {
  const kept = rows.slice(0, limit)
  const last = kept.at(-1)
  return {
    data: kept.map(view),
    next_cursor:
      rows.length > limit && last !== undefined ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null
  }
}

/** Key lists are short; the cursor is the last id seen. */
function pageById<View extends { id: string }>(rows: View[], limit: number, cursor?: string) {
  const start = cursor ? rows.findIndex((row) => row.id === (decodeCursor(cursor) as { id: string }).id) + 1 : 0
  const kept = rows.slice(start, start + limit)
  const last = kept.at(-1)
  return {
    data: kept,
    next_cursor: start + limit < rows.length && last !== undefined ? encodeCursor({ id: last.id }) : null
  }
}

const vertexDefault = () => ({
  provider: 'vertex',
  model: 'gemini-3.8-flash',
  key_id: null,
  declared_tier: 'paid'
})

function settingsOf(flags: { allowMemberAiKeys: boolean; aiFallbackEnabled: boolean }, rows: AiKeyRow[]): SettingsView {
  return {
    ai_fallback_enabled: flags.aiFallbackEnabled,
    allow_member_ai_keys: flags.allowMemberAiKeys,
    model_chain: rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      key_id: row.id,
      declared_tier: row.declaredTier
    })),
    default_model: vertexDefault()
  }
}

/** The 10-an-hour gate, counted on the fingerprint so a create-time key counts too. */
async function checkTestBudget(ctx: ServiceContext, fingerprint: string, now: Date): Promise<void> {
  const since = new Date(now.getTime() - TEST_WINDOW_MS)
  if ((await countAiKeyTestsSince(ctx.tx, { fingerprint, since })) >= TEST_LIMIT) throw rateLimited()
}

async function testBeforeSeal(
  ctx: ServiceContext,
  o: { provider: string; model: string; key: string; keyId: string | null; ownerId: string; now: Date }
): Promise<{ fingerprint: string; last4: string }> {
  const fingerprint = fingerprintKey(o.key)
  await checkTestBudget(ctx, fingerprint, o.now)
  const { generate } = aiKeyPorts()
  const vertex =
    o.provider === 'vertex_ai' && process.env.GCP_PROJECT && process.env.VERTEX_LOCATION
      ? { project: process.env.GCP_PROJECT, location: process.env.VERTEX_LOCATION }
      : undefined
  const result = await testKey({ provider: o.provider, model: o.model, apiKey: o.key, vertex }, generate)
  await recordAiKeyTest(ctx.tx, {
    aiKeyId: o.keyId,
    fingerprint,
    ok: result.ok,
    detail: result.ok ? null : result.detail,
    at: o.now
  })
  if (!result.ok) throw failedTest(result.detail)
  return { fingerprint, last4: o.key.slice(-4) }
}

async function sealFor(o: {
  ownerId: string
  provider: string
  keyId: string
  plaintext: string
}): Promise<{ ciphertext: string; wrappedDek: string; kekVersion: string }> {
  return sealSecret('ai_key', o.plaintext, sealAad(o.ownerId, o.provider, o.keyId))
}

async function settingsView(ctx: ServiceContext): Promise<SettingsView> {
  const flags = await orgAiFlags(ctx.tx)
  return settingsOf(flags, await listAiKeys(ctx.tx, { owner: 'organisation' }))
}

// Organisation keys (`ai_keys.manage`; the route's gate already checked it).

export async function listOrganisationAiKeys(
  ctx: ServiceContext,
  q: { limit: number; cursor?: string }
): Promise<OrgList> {
  return pageById((await listAiKeys(ctx.tx, { owner: 'organisation' })).map(orgView), q.limit, q.cursor)
}

export async function createOrganisationAiKey(
  ctx: ServiceContext,
  body: { provider: string; model: string; enabled: boolean; declared_tier: string; priority: number; key: string }
): Promise<OrgCreatedView> {
  checkProvider(body.provider)
  checkTier(body.declared_tier)
  const now = new Date()
  const { fingerprint, last4 } = await testBeforeSeal(ctx, {
    provider: body.provider,
    model: body.model,
    key: body.key,
    keyId: null,
    ownerId: ctx.tx.orgId!,
    now
  })
  if (await findAiKeyByFingerprint(ctx.tx, fingerprint)) {
    throw new ApiError(409, 'conflict', 'This key is already saved for this organisation.')
  }
  // The AAD names the key ID, so the ID is minted before sealing and the row is written once, sealed.
  const id = uuidv7(now)
  const sealed = await sealFor({ ownerId: ctx.tx.orgId!, provider: body.provider, keyId: id, plaintext: body.key })
  const row = await insertAiKey(ctx.tx, {
    id,
    orgId: ctx.tx.orgId!,
    ownerType: 'organisation',
    provider: body.provider,
    model: body.model,
    last4,
    fingerprint,
    ...sealed,
    declaredTier: body.declared_tier,
    priority: body.priority,
    enabled: body.enabled,
    lastTestOk: true,
    lastTestAt: now,
    lastTestDetail: null
  })
  await audited(ctx, 'ai_key.created', row)
  return orgView(row)
}

export async function updateOrganisationAiKey(
  ctx: ServiceContext,
  o: { id: string; enabled?: boolean; priority?: number; declared_tier?: string }
): Promise<OrgKeyView> {
  const row = await getAiKey(ctx.tx, o.id)
  if (!row || row.ownerType !== 'organisation' || row.deletedAt !== null) throw notFound('')
  if (o.declared_tier !== undefined) checkTier(o.declared_tier)
  if (o.enabled === true && row.lastTestOk !== true) {
    throw new ApiError(422, 'key-test-failed', 'A key whose last test failed cannot be enabled.', {
      errors: [{ in: 'body', pointer: '/enabled', detail: 'Test the key first.' }]
    })
  }
  const done = await updateAiKey(ctx.tx, o.id, {
    ...(o.enabled !== undefined ? { enabled: o.enabled } : {}),
    ...(o.priority !== undefined ? { priority: o.priority } : {}),
    ...(o.declared_tier !== undefined ? { declaredTier: o.declared_tier } : {})
  })
  if (!done) throw notFound('')
  return orgView(done)
}

export async function deleteOrganisationAiKey(ctx: ServiceContext, id: string): Promise<void> {
  const row = await getAiKey(ctx.tx, id)
  if (!row || row.ownerType !== 'organisation' || row.deletedAt !== null) throw notFound('')
  const done = await wipeAiKey(ctx.tx, id, new Date())
  if (!done) throw notFound('')
  await audited(ctx, 'ai_key.revoked', done)
}

export async function testOrganisationAiKey(ctx: ServiceContext, id: string): Promise<OrgTestView> {
  const row = await getAiKey(ctx.tx, id)
  if (!row || row.ownerType !== 'organisation' || row.deletedAt !== null) throw notFound('')
  await checkTestBudget(ctx, row.fingerprint, new Date())
  const { testInWorker } = aiKeyPorts()
  const result = await testInWorker({ orgId: ctx.tx.orgId!, keyId: id })
  if (!result.ok) throw failedTest(result.detail)
  return { ok: true, tested_at: result.testedAt, detail: result.detail }
}

export async function getOrganisationAiKeyUsage(
  ctx: ServiceContext,
  q: { limit: number; cursor?: string; month?: string; key_id?: string }
): Promise<OrgUsagePage> {
  const now = new Date()
  const { from, to } = mytMonthRange(q.month ?? currentMytMonth(now))
  const cursor = q.cursor ? (decodeCursor(q.cursor) as { at: string; id: string }) : undefined
  const rows = await usageInRange(ctx.tx, { from, to, keyId: q.key_id, limit: q.limit, cursor })
  return pageByTime(rows, q.limit, (row) => ({
    run_id: row.runId,
    ai_key_id: row.aiKeyId,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    estimated_cost: estimateCostMyr(row.tokensIn, row.tokensOut)
  }))
}

export async function getOrganisationAiSettings(ctx: ServiceContext): Promise<SettingsView> {
  return settingsView(ctx)
}

export async function updateOrganisationAiSettings(
  ctx: ServiceContext,
  body: {
    ai_fallback_enabled?: boolean
    allow_member_ai_keys?: boolean
    model_chain?: Array<{ key_id: string | null }>
  }
): Promise<SettingsView> {
  await setOrgAiFlags(ctx.tx, {
    ...(body.ai_fallback_enabled !== undefined ? { aiFallbackEnabled: body.ai_fallback_enabled } : {}),
    ...(body.allow_member_ai_keys !== undefined ? { allowMemberAiKeys: body.allow_member_ai_keys } : {})
  })
  if (body.model_chain !== undefined) {
    const ids = body.model_chain.map((entry) => entry.key_id).filter((id): id is string => id !== null)
    const rows = await listAiKeys(ctx.tx, { owner: 'organisation' })
    const known = new Set(rows.map((row) => row.id))
    for (const id of ids) {
      if (!known.has(id)) {
        throw new ApiError(422, 'validation-failed', `No such AI key ${id}.`, {
          errors: [{ in: 'body', pointer: '/model_chain', detail: `No such AI key ${id}.` }]
        })
      }
    }
    // The chain order first, then whatever it didn't name, so priorities stay a total order.
    const rest = rows.map((row) => row.id).filter((id) => !ids.includes(id))
    let priority = 0
    for (const id of [...ids, ...rest]) await updateAiKey(ctx.tx, id, { priority: (priority += 1) })
  }
  return settingsView(ctx)
}

// Personal keys: non-guest members only, and only while the organisation admits member keys.

function memberOrg(ctx: ServiceContext, flags: { allowMemberAiKeys: boolean }): { orgId: string; accountId: string } {
  const principal = ctx.principal
  if (principal.kind !== 'session' || principal.isGuest || principal.role === 'guest' || !flags.allowMemberAiKeys) {
    throw new ApiError(403, 'insufficient-scope', 'Personal AI keys are not enabled for this account or organisation.')
  }
  if (!ctx.tx.orgId) throw new ApiError(400, 'organization-required', 'Send Skyclause-Organization.')
  return { orgId: ctx.tx.orgId, accountId: principal.accountId }
}

export async function listMyAiKeys(ctx: ServiceContext, q: { limit: number; cursor?: string }): Promise<MyList> {
  const flags = await orgAiFlags(ctx.tx)
  const me = memberOrg(ctx, flags)
  return pageById(
    (await listAiKeys(ctx.tx, { owner: 'account', accountId: me.accountId })).map(myView),
    q.limit,
    q.cursor
  )
}

export async function createMyAiKey(
  ctx: ServiceContext,
  body: { provider: string; key: string; model: string; enabled: boolean; declared_tier: string }
): Promise<MyCreatedView> {
  checkProvider(body.provider)
  checkTier(body.declared_tier)
  const flags = await orgAiFlags(ctx.tx)
  const me = memberOrg(ctx, flags)
  const now = new Date()
  const { fingerprint, last4 } = await testBeforeSeal(ctx, {
    provider: body.provider,
    model: body.model,
    key: body.key,
    keyId: null,
    ownerId: me.accountId,
    now
  })
  if (await findAiKeyByFingerprint(ctx.tx, fingerprint)) {
    throw new ApiError(409, 'conflict', 'This key is already saved.')
  }
  const id = uuidv7(now)
  const sealed = await sealFor({ ownerId: me.accountId, provider: body.provider, keyId: id, plaintext: body.key })
  const row = await insertAiKey(ctx.tx, {
    id,
    orgId: me.orgId,
    ownerType: 'account',
    accountId: me.accountId,
    provider: body.provider,
    model: body.model,
    last4,
    fingerprint,
    ...sealed,
    declaredTier: body.declared_tier,
    priority: 0,
    enabled: body.enabled,
    lastTestOk: true,
    lastTestAt: now,
    lastTestDetail: null
  })
  await audited(ctx, 'ai_key.created', row)
  return myView(row)
}

export async function deleteMyAiKey(ctx: ServiceContext, id: string): Promise<void> {
  const flags = await orgAiFlags(ctx.tx)
  const me = memberOrg(ctx, flags)
  const row = await getAiKey(ctx.tx, id)
  if (!row || row.ownerType !== 'account' || row.accountId !== me.accountId || row.deletedAt !== null) {
    throw new ApiError(404, 'not-found', 'The AI key does not exist for this account.')
  }
  const done = await wipeAiKey(ctx.tx, id, new Date())
  if (!done) throw new ApiError(404, 'not-found', 'The AI key does not exist for this account.')
  await audited(ctx, 'ai_key.revoked', done)
}

export async function testMyAiKey(ctx: ServiceContext, id: string): Promise<MyTestView> {
  const flags = await orgAiFlags(ctx.tx)
  const me = memberOrg(ctx, flags)
  const row = await getAiKey(ctx.tx, id)
  if (!row || row.ownerType !== 'account' || row.accountId !== me.accountId || row.deletedAt !== null) {
    throw new ApiError(404, 'not-found', 'The AI key does not exist for this account.')
  }
  await checkTestBudget(ctx, row.fingerprint, new Date())
  const { testInWorker } = aiKeyPorts()
  const result = await testInWorker({ orgId: me.orgId, keyId: id })
  if (!result.ok) {
    throw new ApiError(422, 'key-test-failed', result.detail ?? 'The provider rejected the saved key.', {
      errors: [{ in: 'body', pointer: '', detail: result.detail ?? 'The provider rejected the saved key.' }]
    })
  }
  return { key_id: id, model: row.model, tested_at: result.testedAt }
}

export async function getMyAiKeyUsage(ctx: ServiceContext): Promise<MyUsageView> {
  const now = new Date()
  const flags = await orgAiFlags(ctx.tx)
  const me = memberOrg(ctx, flags)
  const { from, to } = mytMonthRange(currentMytMonth(now))
  const rows = await listAiKeys(ctx.tx, { owner: 'account', accountId: me.accountId })
  const ids = new Set(rows.map((row) => row.id))
  const usage = await usageInRange(ctx.tx, { from, to, limit: 10_000 })
  let tokensIn = 0
  let tokensOut = 0
  for (const row of usage) {
    if (row.aiKeyId !== null && ids.has(row.aiKeyId)) {
      tokensIn += row.tokensIn
      tokensOut += row.tokensOut
    }
  }
  return {
    month: currentMytMonth(now),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_myr: estimateCostMyr(tokensIn, tokensOut)
  }
}

// `GET /v1/usage`: the organisation's month-to-date hosted-model runs.

export async function getUsage(ctx: ServiceContext, q: { limit: number; cursor?: string }): Promise<V1UsageView> {
  const now = new Date()
  const { from } = mytMonthRange(currentMytMonth(now))
  const cursor = q.cursor ? (decodeCursor(q.cursor) as { at: string; id: string }) : undefined
  // Totals cover the whole month to date; the page slices the same newest-first rows.
  const all = await usageInRange(ctx.tx, { from, to: now, keyId: null, limit: 10_000 })
  const totals = all.reduce(
    (sum, row) => ({
      runs: sum.runs + 1,
      tokens_in: sum.tokens_in + row.tokensIn,
      tokens_out: sum.tokens_out + row.tokensOut,
      estimated_cost_myr: (sum.estimated_cost_myr ?? 0) + estimateCostMyr(row.tokensIn, row.tokensOut)
    }),
    { runs: 0, tokens_in: 0, tokens_out: 0, estimated_cost_myr: 0 as number | null }
  )
  const start = cursor ? all.findIndex((row) => row.id === cursor.id) + 1 : 0
  const sliced = start > 0 ? all.slice(start) : all
  const items = pageByTime(sliced, q.limit, (row) => ({
    run_id: row.runId,
    ai_key_id: row.aiKeyId,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    estimated_cost_myr: estimateCostMyr(row.tokensIn, row.tokensOut)
  }))
  return {
    period_start: instant(from),
    period_end: instant(now),
    totals,
    data: items.data,
    next_cursor: items.next_cursor
  }
}
