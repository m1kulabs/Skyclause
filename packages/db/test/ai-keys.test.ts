// e-byok-api: the chain's database rows, on the #79 §7 test database.
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { asLogin } from './harness'
import {
  getAiKey,
  insertAiKey,
  listAiKeys,
  loadAiKeyRows,
  setOrgAiFlags,
  systemPrincipal,
  updateAiKey,
  wipeAiKey,
  withTenant,
  type Tx
} from '../src'
import { makeOrganization } from './factories'

let orgId: string
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const accountId = randomUUID()

beforeAll(async () => {
  ;({ id: orgId } = await makeOrganization())
})

beforeEach(async () => {
  await asLogin('retention', async (client) => {
    for (const table of ['ai_key_test', 'ai_usage', 'ai_key']) await client.query(`DELETE FROM ${table}`)
  })
  await inOrg((tx) => setOrgAiFlags(tx, { allowMemberAiKeys: false, aiFallbackEnabled: false }))
})

async function key(over: Record<string, unknown> = {}) {
  return inOrg((tx) =>
    insertAiKey(tx, {
      orgId,
      ownerType: 'organisation',
      provider: 'openai',
      model: 'gpt-5',
      last4: '1234',
      fingerprint: randomUUID(),
      ciphertext: 'sealed',
      wrappedDek: 'wrapped',
      kekVersion: '1',
      declaredTier: 'paid',
      priority: 1,
      enabled: true,
      lastTestOk: true,
      ...over
    } as never)
  )
}

describe('loadAiKeyRows', () => {
  test('returns the organisation’s enabled keys by priority, then the account’s when admitted', async () => {
    const first = await key({ priority: 2 })
    const top = await key({ priority: 1 })
    await key({ priority: 0, enabled: false })
    const mine = await key({ ownerType: 'account', accountId, priority: 0 })
    // Member keys off: only the organisation’s passing keys, by priority.
    expect(await inOrg((tx) => loadAiKeyRows(tx, { orgId, accountId }))).toEqual({
      orgKeys: [
        { provider: 'openai', model: 'gpt-5', keyId: top.id, declaredTier: 'paid' },
        { provider: 'openai', model: 'gpt-5', keyId: first.id, declaredTier: 'paid' }
      ],
      accountKeys: [{ provider: 'openai', model: 'gpt-5', keyId: mine.id, declaredTier: 'paid' }],
      allowMemberKeys: false,
      fallbackEnabled: false
    })
    await inOrg((tx) => setOrgAiFlags(tx, { allowMemberAiKeys: true }))
    const admitted = await inOrg((tx) => loadAiKeyRows(tx, { orgId, accountId }))
    expect(admitted.allowMemberKeys).toBe(true)
    expect(admitted.accountKeys.map((e) => e.keyId)).toEqual([mine.id])
    // Another account’s keys never leak in.
    const stranger = await inOrg((tx) => loadAiKeyRows(tx, { orgId, accountId: randomUUID() }))
    expect(stranger.accountKeys).toEqual([])
  })

  test('deleted keys leave the chain but keep their row', async () => {
    const row = await key()
    await inOrg((tx) => wipeAiKey(tx, row.id, new Date()))
    expect(await inOrg((tx) => loadAiKeyRows(tx, { orgId, accountId: null }))).toMatchObject({
      orgKeys: [],
      accountKeys: []
    })
    expect(await inOrg((tx) => listAiKeys(tx, { owner: 'organisation' }))).toEqual([])
    const kept = await inOrg((tx) => getAiKey(tx, row.id))
    expect(kept!.ciphertext).toBe('')
  })

  test('disabling a key drops it from the chain', async () => {
    const row = await key()
    await inOrg((tx) => updateAiKey(tx, row.id, { enabled: false }))
    expect(await inOrg((tx) => loadAiKeyRows(tx, { orgId, accountId: null }))).toMatchObject({ orgKeys: [] })
  })

  test('enabled keys with failed or missing tests cannot enter either chain', async () => {
    await key({ lastTestOk: false })
    await key({ lastTestOk: null })
    await key({ ownerType: 'account', accountId, lastTestOk: false })
    await key({ ownerType: 'account', accountId, lastTestOk: null })
    expect(await inOrg((tx) => loadAiKeyRows(tx, { orgId, accountId }))).toMatchObject({
      orgKeys: [],
      accountKeys: []
    })
  })
})
