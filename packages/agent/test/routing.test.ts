import { expect, test } from 'vitest'
import { PLATFORM_DEFAULT } from '../src/providers'
import { createChainResolver, selectChain, type ChainRows } from '../src/routing'

// Spec §1 `ModelResolver.chain` cases (ticket decision): the pure selection, then the resolver over a row loader.

const org = (over: Partial<ChainRows['orgKeys'][number]> = {}) => ({
  provider: 'openai',
  model: 'gpt-5',
  keyId: '019a4300-5a80-7000-8000-0000000000a1',
  declaredTier: 'paid',
  ...over
})
const mine = (over: Partial<ChainRows['accountKeys'][number]> = {}) => ({
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  keyId: '019a4300-5a80-7000-8000-0000000000b2',
  declaredTier: 'paid',
  ...over
})
const rows = (over: Partial<ChainRows> = {}): ChainRows => ({
  orgKeys: [org()],
  accountKeys: [mine()],
  allowMemberKeys: true,
  fallbackEnabled: true,
  ...over
})

test('an attended call returns the account keys first, then the organisation’s', () => {
  expect(selectChain(rows(), { accountId: 'me', unattended: false }).map((e) => e.keyId)).toEqual([
    mine().keyId,
    org().keyId
  ])
})

test('an unattended call never returns account keys', () => {
  expect(selectChain(rows(), { accountId: 'me', unattended: true }).map((e) => e.keyId)).toEqual([org().keyId])
})

test('a null account or a closed member-keys flag returns only the organisation’s keys', () => {
  expect(selectChain(rows(), { accountId: null, unattended: false })).toEqual(rows().orgKeys)
  expect(selectChain(rows({ allowMemberKeys: false }), { accountId: 'me', unattended: false })).toEqual(rows().orgKeys)
})

test('an empty list returns the platform default, naming Gemini through Vertex AI', () => {
  expect(selectChain(rows({ orgKeys: [], accountKeys: [] }), { accountId: 'me', unattended: false })).toEqual([
    { ...PLATFORM_DEFAULT }
  ])
  const entry = selectChain(rows({ orgKeys: [], accountKeys: [] }), { accountId: null, unattended: true })[0]!
  expect(entry).toMatchObject({ provider: 'vertex', model: 'gemini-3.8-flash', keyId: null })
  expect(entry.declaredTier).toBe('paid')
})

test('with fallback off, only the first entry runs', () => {
  const chain = selectChain(rows({ fallbackEnabled: false }), { accountId: 'me', unattended: false })
  expect(chain.map((e) => e.keyId)).toEqual([mine().keyId])
  expect(
    selectChain(rows({ orgKeys: [], accountKeys: [], fallbackEnabled: false }), { accountId: null, unattended: true })
  ).toHaveLength(1)
})

test('the resolver loads one organisation’s rows and selects from them', async () => {
  const seen: Array<{ orgId: string; accountId: string | null; unattended: boolean }> = []
  const chain = createChainResolver(async (_tx, q) => {
    seen.push(q)
    return rows({ orgKeys: [] })
  })
  const entries = await chain.chain({} as never, { orgId: 'org-1', accountId: 'me', unattended: false })
  expect(seen).toEqual([{ orgId: 'org-1', accountId: 'me', unattended: false }])
  expect(entries.map((e) => e.keyId)).toEqual([mine().keyId])
})
