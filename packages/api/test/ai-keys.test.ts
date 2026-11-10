import { randomUUID } from 'node:crypto'
// e-byok-api at the operation seam: every ai-key operation's acceptance, on the #79 §7 test database, with the
// provider call and the worker test call as doubles and KMS as a double (NFR-15), never live.
import { testKey, type GenerateText } from '@skyclause/agent'
import { resetKmsPort, setKmsPort, type KmsPort } from '@skyclause/config/crypto'
import { Problem, type Principal } from '@skyclause/contracts'
import {
  aiKey,
  aiUsage,
  auditEvent,
  recordAiKeyTest,
  recordAudit,
  setOrgAiFlags,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { setAiKeyPorts } from '../src/services/ai-keys/ports'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

const acme = testOrg(`acme-${randomUUID().slice(0, 8)}`)
const other = testOrg(`other-${randomUUID().slice(0, 8)}`)
const owner = () => asSession({ org: acme.slug, role: 'owner' })
const admin = () => asSession({ org: acme.slug, role: 'admin' })
const viewer = () => asSession({ org: acme.slug, role: 'viewer' })
const guest = () => asSession({ org: acme.slug, role: 'viewer', guest: true })
const stale = () => asSession({ org: acme.slug, role: 'owner', authenticatedAt: new Date(0) })
const otherOwner = () => asSession({ org: other.slug, role: 'owner' })

const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

// The KMS double (NFR-15): XOR under a pad, versioned.
const kms = (version = '3'): KmsPort => {
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

const provider = { pass: true }
const workerTest = { pass: true }
const generate: GenerateText = (async () => {
  if (!provider.pass) throw new Error('401 invalid API key (test)')
  return { text: 'ok', totalUsage: { inputTokens: 1, outputTokens: 1 } }
}) as never

beforeAll(async () => {
  process.env.KMS_AI_KEYS_KEY = 'test-only-kms-ai-keys-key'
  await makeOrganization({ id: acme.id, slug: acme.slug })
  await makeOrganization({ id: other.id, slug: other.slug })
  setKmsPort(kms())
  setAiKeyPorts({
    generate,
    testInWorker: async () =>
      workerTest.pass
        ? { ok: true, detail: null, testedAt: new Date().toISOString() }
        : { ok: false, detail: '401 invalid API key (test)', testedAt: new Date().toISOString() }
  })
})

beforeEach(async () => {
  provider.pass = true
  workerTest.pass = true
  for (const orgId of [acme.id, other.id]) {
    await inOrg(orgId, (tx) => setOrgAiFlags(tx, { allowMemberAiKeys: false, aiFallbackEnabled: false }))
  }
  // Each test starts empty: the retention role may delete append-only rows too.
  await asLogin('retention', async (client) => {
    for (const table of ['ai_key_test', 'ai_usage', 'audit_event', 'ai_key']) await client.query(`DELETE FROM ${table}`)
  })
})

afterEach(() => {
  resetKmsPort()
  setKmsPort(kms())
  delete process.env.GCP_PROJECT
  delete process.env.VERTEX_LOCATION
})

function setup() {
  const deps = testDeps({ withTenant, recordAudit })
  return { ...createTestApi({ deps }), deps }
}

const createBody = (key: string, over: Record<string, unknown> = {}) => ({
  provider: 'openai',
  model: 'gpt-5',
  enabled: true,
  declared_tier: 'paid',
  priority: 1,
  key,
  ...over
})
const create = (app: ReturnType<typeof setup>['api'], as: Principal, body: Record<string, unknown>, org = acme.slug) =>
  apiRequest(app, {
    as,
    org,
    method: 'POST',
    path: `/api/orgs/${org}/ai-keys`,
    idempotencyKey: randomUUID(),
    body
  })

const list = (app: ReturnType<typeof setup>['api'], as: Principal, org = acme.slug) =>
  apiRequest(app, { as, org, method: 'GET', path: `/api/orgs/${org}/ai-keys` })

const audits = (action: string) =>
  inOrg(acme.id, (tx) =>
    tx
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.orgId, acme.id), eq(auditEvent.action, action)))
      .orderBy(auditEvent.at)
  )

const keyRows = () => inOrg(acme.id, (tx) => tx.select().from(aiKey).orderBy(asc(aiKey.createdAt)))

describe('organisation keys', () => {
  test('create seals the key, returns no secret, and audits once', async () => {
    const { api } = setup()
    const plaintext = `sk-canary-create-${randomUUID()}`
    const response = await create(api, owner(), createBody(plaintext))
    expect(response.status).toBe(201)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({ provider: 'openai', model: 'gpt-5', last4: plaintext.slice(-4), enabled: true })
    expect(body.fingerprint).toMatch(/^[0-9a-f]{12}$/)
    // SET-5: no key material on the wire.
    expect(JSON.stringify(body)).not.toContain(plaintext)
    expect(body).not.toHaveProperty('key')
    expect(body).not.toHaveProperty('ciphertext')
    expect(body).not.toHaveProperty('wrappedDek')

    const rows = await keyRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ciphertext).not.toBe(plaintext)
    expect(rows[0]!.ciphertext).not.toBe('')
    expect(rows[0]!.wrappedDek).not.toBe('')
    expect(rows[0]!.kekVersion).toBe('3')
    expect(rows[0]!.lastTestOk).toBe(true)

    const created = await audits('ai_key.created')
    expect(created).toHaveLength(1)
    expect(JSON.stringify(created[0])).not.toContain(plaintext)
    expect(created[0]!.targetId).toBe(rows[0]!.id)
  })

  test('a failed test stores nothing and answers 422 key-test-failed', async () => {
    const { api } = setup()
    provider.pass = false
    const plaintext = `sk-canary-fail-${randomUUID()}`
    const response = await create(api, owner(), createBody(plaintext))
    expect(response.status).toBe(422)
    const body = (await response.json()) as { type: string; detail: string }
    expect(body.type).toBe('https://docs.skyclause.m1ku.tech/problems/key-test-failed')
    // SET-5: the problem body carries no key.
    expect(JSON.stringify(body)).not.toContain(plaintext)
    expect(await keyRows()).toHaveLength(0)
    expect(await audits('ai_key.created')).toHaveLength(0)
  })

  test('failed creates retain their test budget across rolled-back responses', async () => {
    const { api } = setup()
    provider.pass = false
    const plaintext = `sk-canary-budget-${randomUUID()}`
    for (let i = 0; i < 10; i++) {
      expect((await create(api, owner(), createBody(plaintext))).status).toBe(422)
    }
    expect((await create(api, owner(), createBody(plaintext))).status).toBe(429)
    expect(await keyRows()).toHaveLength(0)
    expect(await audits('ai_key.created')).toHaveLength(0)
    await asLogin('postgres', async (client) => {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM ai_key_test')
      expect(rows[0].n).toBe(10)
    })
  })

  test('concurrent failed creates cannot exceed ten provider attempts', async () => {
    const { api } = setup()
    let calls = 0
    setAiKeyPorts({
      generate: (async () => {
        calls++
        throw new Error('Invalid canary key')
      }) as never
    })
    try {
      const plaintext = `sk-canary-concurrent-${randomUUID()}`
      const responses = await Promise.all(Array.from({ length: 12 }, () => create(api, owner(), createBody(plaintext))))
      expect(responses.filter((r) => r.status === 422)).toHaveLength(10)
      expect(responses.filter((r) => r.status === 429)).toHaveLength(2)
      expect(calls).toBe(10)
      expect(await keyRows()).toHaveLength(0)
    } finally {
      setAiKeyPorts({ generate })
    }
  })

  test('an unknown provider or tier is a 422, storing nothing', async () => {
    const { api } = setup()
    for (const body of [
      createBody(`sk-x-${randomUUID()}`, { provider: 'azure' }),
      createBody(`sk-x-${randomUUID()}`, { declared_tier: 'enterprise' })
    ]) {
      const response = await create(api, owner(), body)
      expect(response.status).toBe(422)
    }
    expect(await keyRows()).toHaveLength(0)
  })

  test('create needs a fresh sign-in: a stale session answers 401 reauth-required', async () => {
    const { api } = setup()
    const response = await create(api, stale(), createBody(`sk-x-${randomUUID()}`))
    expect(response.status).toBe(401)
    expect(((await response.json()) as { type: string }).type).toBe(
      'https://docs.skyclause.m1ku.tech/problems/reauth-required'
    )
    expect(await keyRows()).toHaveLength(0)
  })

  test('below ai_keys.manage the routes answer 403', async () => {
    const { api } = setup()
    const key = await create(api, owner(), createBody(`sk-x-${randomUUID()}`))
    expect(key.status).toBe(201)
    const id = ((await key.json()) as { id: string }).id
    const paths: Array<{ method: string; path: string; body?: unknown; idempotencyKey?: string }> = [
      { method: 'GET', path: `/api/orgs/${acme.slug}/ai-keys` },
      {
        method: 'POST',
        path: `/api/orgs/${acme.slug}/ai-keys`,
        body: createBody(`sk-y-${randomUUID()}`),
        idempotencyKey: randomUUID()
      },
      { method: 'PATCH', path: `/api/orgs/${acme.slug}/ai-keys/${id}`, body: { enabled: false } },
      { method: 'DELETE', path: `/api/orgs/${acme.slug}/ai-keys/${id}` },
      { method: 'POST', path: `/api/orgs/${acme.slug}/ai-keys/${id}/test` },
      { method: 'GET', path: `/api/orgs/${acme.slug}/ai-keys/usage` },
      { method: 'GET', path: `/api/orgs/${acme.slug}/settings/ai` },
      { method: 'PATCH', path: `/api/orgs/${acme.slug}/settings/ai`, body: { ai_fallback_enabled: true } }
    ]
    for (const target of paths) {
      for (const as of [viewer(), asApiKey({ org: acme.slug, role: 'owner', scopes: ['read'] })]) {
        const response = await apiRequest(api, { as, org: acme.slug, ...target })
        expect(response.status, `${target.method} ${target.path}`).toBe(403)
      }
    }
  })

  test('another organisation’s rows answer 404', async () => {
    const { api } = setup()
    const key = await create(api, otherOwner(), createBody(`sk-x-${randomUUID()}`), other.slug)
    expect(key.status).toBe(201)
    const id = ((await key.json()) as { id: string }).id
    for (const target of [
      { method: 'PATCH', path: `/api/orgs/${acme.slug}/ai-keys/${id}`, body: { enabled: false } },
      { method: 'DELETE', path: `/api/orgs/${acme.slug}/ai-keys/${id}` },
      { method: 'POST', path: `/api/orgs/${acme.slug}/ai-keys/${id}/test` }
    ] as const) {
      const response = await apiRequest(api, { as: owner(), org: acme.slug, ...target })
      expect(response.status, `${target.method} ${target.path}`).toBe(404)
    }
  })

  test(
    crossOrgCase('listOrganisationAiKeys', {
      app: setup().api,
      as: owner(),
      params: { org: other.slug }
    }).name,
    () =>
      crossOrgCase('listOrganisationAiKeys', {
        app: setup().api,
        as: owner(),
        params: { org: other.slug }
      }).run()
  )

  // #115's meta-test: every organisation key, settings and usage operation answers 404 for another organisation.
  test('another organisation’s keys, settings and usage answer 404 through crossOrgCase', async () => {
    const { api, v1 } = setup()
    const key = await create(api, otherOwner(), createBody(`sk-o-${randomUUID()}`), other.slug)
    expect(key.status).toBe(201)
    const id = ((await key.json()) as { id: string }).id
    const cases = [
      crossOrgCase('createOrganisationAiKey', {
        app: api,
        as: owner(),
        params: { org: other.slug },
        body: createBody(`sk-c-${randomUUID()}`)
      }),
      crossOrgCase('updateOrganisationAiKey', {
        app: api,
        as: owner(),
        params: { org: other.slug, id },
        body: { enabled: false }
      }),
      crossOrgCase('testOrganisationAiKey', { app: api, as: owner(), params: { org: other.slug, id } }),
      crossOrgCase('deleteOrganisationAiKey', { app: api, as: owner(), params: { org: other.slug, id } }),
      crossOrgCase('getOrganisationAiKeyUsage', { app: api, as: owner(), params: { org: other.slug } }),
      crossOrgCase('getOrganisationAiSettings', { app: api, as: owner(), params: { org: other.slug } }),
      crossOrgCase('updateOrganisationAiSettings', {
        app: api,
        as: owner(),
        params: { org: other.slug },
        body: { ai_fallback_enabled: true }
      }),
      crossOrgCase('getUsage', { app: v1, as: owner(), org: other.slug, params: {} })
    ]
    for (const crossOrg of cases) await crossOrg.run()
    const kept = await inOrg(other.id, (tx) => tx.select().from(aiKey).where(eq(aiKey.id, id)))
    expect(kept[0]).toMatchObject({ enabled: true })
  })
})

describe('organisation key updates, tests and deletes', () => {
  test('update reorders and disables; enabling a failed key is refused', async () => {
    const { api } = setup()
    const first = (await (await create(api, owner(), createBody(`sk-a-${randomUUID()}`, { priority: 1 }))).json()) as {
      id: string
    }
    // A disabled key whose test failed: create disabled with a passing test, then fail the worker test.
    const second = (await (
      await create(api, owner(), createBody(`sk-b-${randomUUID()}`, { priority: 2, enabled: false }))
    ).json()) as { id: string }
    workerTest.pass = false
    const failed = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'POST',
      path: `/api/orgs/${acme.slug}/ai-keys/${second.id}/test`
    })
    expect(failed.status).toBe(422)
    workerTest.pass = true
    // The worker records each on-demand result; the test double cannot, so the failed test is recorded as it would be.
    await inOrg(acme.id, (tx) =>
      recordAiKeyTest(tx, {
        aiKeyId: second.id,
        fingerprint: 'test-only-fingerprint',
        ok: false,
        detail: '401 invalid API key (test)',
        at: new Date()
      })
    )

    const enable = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'PATCH',
      path: `/api/orgs/${acme.slug}/ai-keys/${second.id}`,
      body: { enabled: true }
    })
    expect(enable.status).toBe(422)
    expect(((await enable.json()) as { type: string }).type).toBe(
      'https://docs.skyclause.m1ku.tech/problems/key-test-failed'
    )

    const disable = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'PATCH',
      path: `/api/orgs/${acme.slug}/ai-keys/${first.id}`,
      body: { enabled: false, priority: 5, declared_tier: 'free' }
    })
    expect(disable.status).toBe(200)
    expect(await disable.json()).toMatchObject({ id: first.id, enabled: false, priority: 5, declared_tier: 'free' })

    const missing = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'PATCH',
      path: `/api/orgs/${acme.slug}/ai-keys/019a4300-5a80-7000-8000-0000000000ff`,
      body: { enabled: false }
    })
    expect(missing.status).toBe(404)
  })

  test('on-demand test answers the worker result and updates nothing locally', async () => {
    const { api } = setup()
    const created = (await (await create(api, owner(), createBody(`sk-t-${randomUUID()}`))).json()) as { id: string }
    const response = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'POST',
      path: `/api/orgs/${acme.slug}/ai-keys/${created.id}/test`
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, detail: null })
  })

  test('the eleventh test in an hour answers 429', async () => {
    const { api } = setup()
    const created = (await (await create(api, owner(), createBody(`sk-r-${randomUUID()}`))).json()) as {
      id: string
      fingerprint: string
    }
    // The create-time test is the first attempt; nine on-demand results stand for earlier tests.
    for (let i = 0; i < 9; i++) {
      await inOrg(acme.id, (tx) =>
        recordAiKeyTest(tx, {
          aiKeyId: created.id,
          fingerprint: created.fingerprint,
          ok: true,
          detail: null,
          at: new Date()
        })
      )
    }
    const limited = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'POST',
      path: `/api/orgs/${acme.slug}/ai-keys/${created.id}/test`
    })
    expect(limited.status).toBe(429)
  })

  test('delete wipes the secrets, keeps the row for usage history, and audits once', async () => {
    const { api } = setup()
    const created = (await (await create(api, owner(), createBody(`sk-d-${randomUUID()}`))).json()) as { id: string }
    const response = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'DELETE',
      path: `/api/orgs/${acme.slug}/ai-keys/${created.id}`
    })
    expect(response.status).toBe(204)
    const rows = await keyRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ciphertext).toBe('')
    expect(rows[0]!.wrappedDek).toBe('')
    expect(rows[0]!.enabled).toBe(false)
    const revoked = await audits('ai_key.revoked')
    expect(revoked).toHaveLength(1)
    expect(revoked[0]!.targetId).toBe(created.id)
    // The wiped row leaves the lists and the chain.
    expect(((await (await list(api, owner())).json()) as { data: unknown[] }).data).toHaveLength(0)
    const again = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'DELETE',
      path: `/api/orgs/${acme.slug}/ai-keys/${created.id}`
    })
    expect(again.status).toBe(404)
  })

  test('a resubmitted key answers 409', async () => {
    const { api } = setup()
    const plaintext = `sk-dup-${randomUUID()}`
    expect((await create(api, owner(), createBody(plaintext))).status).toBe(201)
    expect((await create(api, owner(), createBody(plaintext))).status).toBe(409)
  })
})

describe('settings and usage', () => {
  test('settings name the platform default and reorder the chain', async () => {
    const { api } = setup()
    const get = () =>
      apiRequest(api, { as: owner(), org: acme.slug, method: 'GET', path: `/api/orgs/${acme.slug}/settings/ai` })
    expect(await (await get()).json()).toMatchObject({
      ai_fallback_enabled: false,
      allow_member_ai_keys: false,
      model_chain: [],
      default_model: { provider: 'vertex', model: 'gemini-3.8-flash', key_id: null, declared_tier: 'paid' }
    })
    const a = (await (await create(api, owner(), createBody(`sk-s1-${randomUUID()}`, { priority: 1 }))).json()) as {
      id: string
    }
    const b = (await (await create(api, owner(), createBody(`sk-s2-${randomUUID()}`, { priority: 2 }))).json()) as {
      id: string
    }
    const patch = await apiRequest(api, {
      as: owner(),
      org: acme.slug,
      method: 'PATCH',
      path: `/api/orgs/${acme.slug}/settings/ai`,
      body: {
        ai_fallback_enabled: true,
        allow_member_ai_keys: true,
        model_chain: [
          { provider: 'openai', model: 'gpt-5', key_id: b.id, declared_tier: 'paid' },
          { provider: 'openai', model: 'gpt-5', key_id: a.id, declared_tier: 'paid' }
        ]
      }
    })
    expect(patch.status).toBe(200)
    const settings = (await patch.json()) as { model_chain: Array<{ key_id: string }>; ai_fallback_enabled: boolean }
    expect(settings.model_chain.map((e) => e.key_id)).toEqual([b.id, a.id])
    expect(settings.ai_fallback_enabled).toBe(true)
  })

  test('usage reads ai_usage by MYT month, per key and for the platform', async () => {
    const { api } = setup()
    const key = (await (await create(api, owner(), createBody(`sk-u-${randomUUID()}`))).json()) as { id: string }
    const now = new Date()
    await inOrg(acme.id, (tx) =>
      tx.insert(aiUsage).values([
        { orgId: acme.id, runId: null, aiKeyId: key.id, model: 'gpt-5', tokensIn: 1200, tokensOut: 300 },
        { orgId: acme.id, runId: null, aiKeyId: null, model: 'gemini-3.8-flash', tokensIn: 100, tokensOut: 10 },
        {
          orgId: acme.id,
          runId: null,
          aiKeyId: key.id,
          model: 'gpt-5',
          tokensIn: 10,
          tokensOut: 10,
          createdAt: new Date(now.getTime() - 40 * 24 * 3_600_000)
        }
      ])
    )
    const month = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 7)
    const all = (await (
      await apiRequest(api, {
        as: owner(),
        org: acme.slug,
        method: 'GET',
        path: `/api/orgs/${acme.slug}/ai-keys/usage`,
        query: { month }
      })
    ).json()) as { data: Array<{ ai_key_id: string | null; tokens_in: number; estimated_cost: number }> }
    expect(all.data).toHaveLength(2)
    // SET-5: usage carries totals, never secrets.
    expect(JSON.stringify(all)).not.toContain('sk-u-')
    const keyed = (await (
      await apiRequest(api, {
        as: owner(),
        org: acme.slug,
        method: 'GET',
        path: `/api/orgs/${acme.slug}/ai-keys/usage`,
        query: { month, key_id: key.id }
      })
    ).json()) as { data: Array<{ run_id: string; estimated_cost: number }> }
    expect(keyed.data).toHaveLength(1)
    expect(keyed.data[0]).toMatchObject({ ai_key_id: key.id, model: 'gpt-5', tokens_in: 1200 })
    expect(keyed.data[0]!.estimated_cost).toBeGreaterThan(0)
  })
})

describe('personal keys', () => {
  const mePath = '/api/me/ai-keys'
  const meList = (app: ReturnType<typeof setup>['api'], as: Principal) =>
    apiRequest(app, { as, org: acme.slug, method: 'GET', path: mePath })
  const meCreate = (app: ReturnType<typeof setup>['api'], as: Principal, key: string) =>
    apiRequest(app, {
      as,
      org: acme.slug,
      method: 'POST',
      path: mePath,
      idempotencyKey: randomUUID(),
      body: { provider: 'anthropic', key, model: 'claude-opus-5-5', enabled: true, declared_tier: 'paid' }
    })

  async function allowMembers(app: ReturnType<typeof setup>['api']) {
    const response = await apiRequest(app, {
      as: owner(),
      org: acme.slug,
      method: 'PATCH',
      path: `/api/orgs/${acme.slug}/settings/ai`,
      body: { allow_member_ai_keys: true }
    })
    expect(response.status).toBe(200)
  }

  test('closed until the organisation admits member keys, and to guests', async () => {
    const { api } = setup()
    const me = admin()
    expect((await meList(api, me)).status).toBe(403)
    expect((await meCreate(api, me, `sk-m-${randomUUID()}`)).status).toBe(403)
    await allowMembers(api)
    expect((await meList(api, me)).status).toBe(200)
    expect((await meList(api, guest())).status).toBe(403)
  })

  test('a member saves, tests and deletes their own key, and no one else’s', async () => {
    const { api } = setup()
    await allowMembers(api)
    const me = admin()
    const plaintext = `sk-mine-${randomUUID()}`
    const created = await meCreate(api, me, plaintext)
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { id: string; last_test_result: string }
    expect(createdBody.last_test_result).toBe('passed')
    expect(JSON.stringify(createdBody)).not.toContain(plaintext)

    const otherMember = asSession({ org: acme.slug, role: 'editor' })
    const theirs = await meCreate(api, otherMember, `sk-theirs-${randomUUID()}`)
    expect(theirs.status).toBe(201)
    const theirId = ((await theirs.json()) as { id: string }).id
    // An account sees only its own keys and cannot delete another’s.
    const mine = (await (await meList(api, me)).json()) as { data: Array<{ id: string }> }
    expect(mine.data.map((k) => k.id)).toEqual([createdBody.id])
    expect(
      (await apiRequest(api, { as: me, org: acme.slug, method: 'DELETE', path: `${mePath}/${theirId}` })).status
    ).toBe(404)
    const tested = await apiRequest(api, {
      as: me,
      org: acme.slug,
      method: 'POST',
      path: `${mePath}/${createdBody.id}/test`
    })
    expect(tested.status).toBe(200)
    expect(await tested.json()).toMatchObject({ key_id: createdBody.id })
    const deleted = await apiRequest(api, {
      as: me,
      org: acme.slug,
      method: 'DELETE',
      path: `${mePath}/${createdBody.id}`
    })
    expect(deleted.status).toBe(204)
    expect(((await (await meList(api, me)).json()) as { data: unknown[] }).data).toHaveLength(0)
  })

  test('a stale session creating a personal key answers 401 reauth-required', async () => {
    const { api } = setup()
    await allowMembers(api)
    expect((await meCreate(api, stale(), `sk-m-${randomUUID()}`)).status).toBe(401)
  })

  test('personal usage totals the account’s keys for the current month', async () => {
    const { api } = setup()
    await allowMembers(api)
    const me = admin()
    const key = (await (await meCreate(api, me, `sk-mu-${randomUUID()}`)).json()) as { id: string }
    await inOrg(acme.id, (tx) =>
      tx
        .insert(aiUsage)
        .values({ orgId: acme.id, runId: null, aiKeyId: key.id, model: 'x', tokensIn: 500, tokensOut: 50 })
    )
    const usage = (await (
      await apiRequest(api, { as: me, org: acme.slug, method: 'GET', path: `${mePath}/usage` })
    ).json()) as { tokens_in: number; tokens_out: number; estimated_cost_myr: number }
    expect(usage).toMatchObject({ tokens_in: 500, tokens_out: 50 })
    expect(usage.estimated_cost_myr).toBeGreaterThan(0)
  })
})

describe('v1 usage', () => {
  test('returns the organisation’s month-to-date hosted-model runs', async () => {
    const { api, v1 } = setup()
    const key = (await (await create(api, owner(), createBody(`sk-v-${randomUUID()}`))).json()) as { id: string }
    await inOrg(acme.id, (tx) =>
      tx.insert(aiUsage).values([
        { orgId: acme.id, runId: null, aiKeyId: null, model: 'gemini-3.8-flash', tokensIn: 1200, tokensOut: 300 },
        { orgId: acme.id, runId: null, aiKeyId: key.id, model: 'gpt-5', tokensIn: 5, tokensOut: 5 }
      ])
    )
    const response = await apiRequest(v1, { as: owner(), org: acme.slug, method: 'GET', path: '/v1/usage' })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      totals: { runs: number; tokens_in: number }
      data: Array<{ ai_key_id: string | null; run_id: string; estimated_cost_myr: number | null }>
      next_cursor: null
    }
    expect(body.totals).toMatchObject({ runs: 1, tokens_in: 1200 })
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ ai_key_id: null, model: 'gemini-3.8-flash' })
    expect(body.data[0]!.estimated_cost_myr).toBeGreaterThan(0)
    expect(body.next_cursor).toBeNull()
    expect(
      Problem.safeParse(
        await (await apiRequest(v1, { as: owner(), org: other.slug, method: 'GET', path: '/v1/usage' })).json()
      ).success
    ).toBe(true)
  })
})

test('testKey is the same factory the chain drafts through', async () => {
  // The unit contract: the minimal call resolves ok on a passing provider without storing anything.
  await expect(
    testKey({ provider: 'openai', model: 'gpt-5', apiKey: `sk-x-${randomUUID()}` }, generate)
  ).resolves.toEqual({
    ok: true
  })
})
