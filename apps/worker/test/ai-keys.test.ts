import { randomUUID } from 'node:crypto'
// e-byok-api on the worker: the one-call model factory, the on-demand key test, the rewrap job and the KEK rotation
// check, on the #79 §7 test database, with KMS and provider doubles (NFR-15), never live services.
import { openSecret, resetKmsPort, sealAad, sealSecret, setKmsPort, type KmsPort } from '@skyclause/config/crypto'
import type { ModelEntry } from '@skyclause/contracts'
import { aiKey, getAiKey, recordAiKeyTest, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createKekRotationCheck, kekRotation } from '../src/ai-keys/audit'
import { createAiKeysPart } from '../src/ai-keys/index'
import { modelFor } from '../src/ai-keys/model-for'
import { rewrapKeys } from '../src/ai-keys/rewrap'
import { runKeyTest } from '../src/ai-keys/test'

const orgId = randomUUID()
const ORG = `w-ai-${randomUUID().slice(0, 8)}`

const kms = (version = '7'): KmsPort => {
  const pad = Buffer.alloc(32, 0x5a)
  return {
    async wrapDek(_keyId: string, dek: Buffer) {
      return { wrapped: Buffer.from(dek.map((byte, i) => byte ^ pad[i]!)), version }
    },
    async unwrapDek(_keyId: string, wrapped: Buffer) {
      return Buffer.from(wrapped.map((byte, i) => byte ^ pad[i]!))
    }
  }
}

const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)

beforeAll(async () => {
  process.env.KMS_AI_KEYS_KEY = 'test-only-kms-ai-keys-key'
  await makeOrganization({ id: orgId, slug: ORG })
})

beforeEach(() => {
  setKmsPort(kms())
})

afterEach(() => {
  resetKmsPort()
})

async function sealedKey(over: { provider?: string; model?: string; accountId?: string | null } = {}) {
  const provider = over.provider ?? 'openai'
  const model = over.model ?? 'gpt-5'
  const id = randomUUID()
  const ownerId = over.accountId ?? orgId
  const plaintext = `sk-worker-${randomUUID()}`
  const sealed = await sealSecret('ai_key', plaintext, sealAad(ownerId, provider, id))
  const [row] = await inOrg((tx) =>
    tx
      .insert(aiKey)
      .values({
        id,
        orgId,
        ownerType: over.accountId === undefined ? 'organisation' : 'account',
        accountId: over.accountId ?? null,
        provider,
        model,
        last4: plaintext.slice(-4),
        fingerprint: `fp${randomUUID().slice(0, 10).replaceAll('-', '')}`,
        ...sealed,
        declaredTier: 'paid',
        priority: 1,
        enabled: true
      })
      .returning()
  )
  return { row: row!, plaintext }
}

const entry = (keyId: string, over: Partial<ModelEntry> = {}): ModelEntry => ({
  provider: 'openai',
  model: 'gpt-5',
  keyId,
  declaredTier: 'paid',
  ...over
})

const generate = (async () => ({ text: 'ok', totalUsage: {} })) as never

describe('modelFor', () => {
  test('opens the key and builds the one-call model from the opened secret', async () => {
    const { row, plaintext } = await sealedKey()
    const seen: Array<{ provider: string; apiKey: string; model: string }> = []
    const model = await modelFor(entry(row.id), {
      build: ((provider: string, o: { apiKey: string; model: string }) => {
        seen.push({ provider, ...o })
        return { mocked: true }
      }) as never
    })
    expect(model).toEqual({ mocked: true })
    // The factory received the secret `openSecret` returned, not the sealed row.
    expect(seen).toEqual([{ provider: 'openai', apiKey: plaintext, model: 'gpt-5' }])
  })

  test('an unknown key and a null keyId fail without a provider call', async () => {
    await expect(modelFor(entry(randomUUID()))).rejects.toThrow(/no such key/)
    await expect(modelFor(entry(randomUUID(), { keyId: null }))).rejects.toThrow(/platform Vertex/)
  })

  test('a wiped key cannot draft', async () => {
    const { row } = await sealedKey()
    const { eq } = await import('drizzle-orm')
    await inOrg((tx) =>
      tx
        .update(aiKey)
        .set({ ciphertext: '', wrappedDek: '', enabled: false, deletedAt: new Date() })
        .where(eq(aiKey.id, row.id))
    )
    await expect(modelFor(entry(row.id))).rejects.toThrow(/no live key/)
  })
})

describe('runKeyTest', () => {
  test('a passing key records its last test and answers ok, without key material', async () => {
    const { row } = await sealedKey()
    const result = await runKeyTest({ generate, now: () => new Date() }, { orgId, keyId: row.id })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, detail: null })
    const reread = await inOrg((tx) => getAiKey(tx, row.id))
    expect(reread!.lastTestOk).toBe(true)
    expect(reread!.lastTestAt).not.toBeNull()
    expect(JSON.stringify(result.body)).not.toContain('sk-worker-')
  })

  test('a rejected key records the failure and answers not-ok', async () => {
    const { row } = await sealedKey()
    const failing = (async () => {
      throw new Error('401 invalid API key (test)')
    }) as never
    const result = await runKeyTest({ generate: failing, now: () => new Date() }, { orgId, keyId: row.id })
    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(false)
    expect(result.body.detail).toContain('401')
    const reread = await inOrg((tx) => getAiKey(tx, row.id))
    expect(reread!.lastTestOk).toBe(false)
  })

  test('an unknown key answers 404 and the eleventh test in an hour answers 429', async () => {
    const missing = await runKeyTest({ generate, now: () => new Date() }, { orgId, keyId: randomUUID() })
    expect(missing.status).toBe(404)
    const { row } = await sealedKey()
    for (let i = 0; i < 10; i++) {
      await inOrg((tx) =>
        recordAiKeyTest(tx, { aiKeyId: row.id, fingerprint: row.fingerprint, ok: true, detail: null, at: new Date() })
      )
    }
    const limited = await runKeyTest({ generate, now: () => new Date() }, { orgId, keyId: row.id })
    expect(limited.status).toBe(429)
  })
})

describe('kms:rewrap', () => {
  test('moves rows sealed under an old KEK version onto the primary', async () => {
    setKmsPort(kms('old'))
    const stale = await sealedKey()
    setKmsPort(kms('new'))
    const result = await rewrapKeys('test-only-kms-ai-keys-key', { kms: kms('new'), now: () => new Date() })
    expect(result.rewrapped).toBeGreaterThanOrEqual(1)
    const reread = await inOrg((tx) => getAiKey(tx, stale.row.id))
    expect(reread!.kekVersion).toBe('new')
    // The DEK still opens the same provider key after the rewrap.
    setKmsPort(kms('new'))
    await expect(openSecret('ai_key', { ...reread! }, sealAad(orgId, reread!.provider, reread!.id))).resolves.toBe(
      stale.plaintext
    )
  })
})

describe('kek_rotation', () => {
  test('a platform check flagging KEK versions older than 90 days', async () => {
    const day = 24 * 60 * 60_000
    const now = new Date('2026-11-10T00:00:00Z')
    const check = createKekRotationCheck(async () => [
      { version: '3', createdAt: new Date(now.getTime() - 91 * day), enabled: true },
      { version: '4', createdAt: new Date(now.getTime() - 10 * day), enabled: true },
      { version: '2', createdAt: new Date(now.getTime() - 200 * day), enabled: false }
    ])
    expect(check).toMatchObject({ name: 'kek_rotation', scope: 'platform' })
    expect(await check.run({} as never, now.toISOString())).toEqual([
      { key: 'kek_version:3', projectId: null, accountIds: [], ref: { type: 'kek_version', id: '3' } }
    ])
    const quiet = createKekRotationCheck(async () => [
      { version: '4', createdAt: new Date(now.getTime() - 10 * day), enabled: true }
    ])
    expect(await quiet.run({} as never, now.toISOString())).toEqual([])
    expect(kekRotation).toMatchObject({ name: 'kek_rotation', scope: 'platform' })
  })
})

describe('worker part', () => {
  test('registers the internal test route and the rewrap job', async () => {
    const part = createAiKeysPart({
      generate,
      now: () => new Date(),
      kmsKeyId: () => 'test-only-kms-ai-keys-key'
    })
    expect(part.owner).toBe('e-byok-api')
    expect(Object.keys(part.internal ?? {})).toEqual(['/ai-keys/:id/test'])
    expect(Object.keys(part.jobs ?? {})).toEqual(['kms:rewrap'])
    const { row } = await sealedKey()
    const response = await part.internal!['/ai-keys/:id/test']!(
      new Request('https://worker/internal', { method: 'POST', body: JSON.stringify({ org_id: orgId }) }),
      { id: row.id }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { ok: boolean }
    expect(body).toMatchObject({ ok: true })
  })
})
