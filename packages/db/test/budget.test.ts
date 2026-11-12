import { NotBuiltError, type Principal } from '@skyclause/contracts'
import { beforeAll, expect, test } from 'vitest'
import { budgetGate, systemPrincipal, withTenant } from '../src'
import { makeOrganization } from './factories'
import { memberOf } from './harness'

let orgId: string
let commonsId: string

beforeAll(async () => {
  orgId = (await makeOrganization({ slug: 'budget-pilot' })).id
  commonsId = (await makeOrganization({ slug: 'commons' })).id
})

test('a member, an API key and the run worker in an ordinary organisation have no cap to spend', async () => {
  const apiKey = {
    ...memberOf(orgId),
    kind: 'api_key',
    keyId: 'key',
    scopes: ['read', 'draft']
  } as unknown as Principal
  for (const principal of [memberOf(orgId), apiKey, systemPrincipal('runs')]) {
    for (const kind of ['run', 'evidence', 'window'] as const) {
      const result = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
        budgetGate.consume(tx, principal, kind)
      )
      expect(result).toEqual({ ok: true })
    }
  }
})

test('guests, guest tokens and reviewer links still answer not built until their caps exist (#181)', async () => {
  const guest = { ...memberOf(orgId), isGuest: true } as Principal
  const token = {
    kind: 'guest_token',
    client: 'app',
    clientName: null,
    tokenId: 't',
    accountId: 'a',
    orgId,
    scopes: ['read']
  } as Principal
  const link = {
    kind: 'share_link',
    client: 'app',
    clientName: null,
    linkId: 'l',
    orgId,
    projectId: 'p',
    access: 'reviewer'
  } as Principal
  for (const principal of [guest, token, link]) {
    await expect(
      withTenant({ orgId, principal: memberOf(orgId) }, (tx) => budgetGate.consume(tx, principal, 'run'))
    ).rejects.toBeInstanceOf(NotBuiltError)
  }
})

test('a Commons run is refused as not built while the Commons model budget is unbuilt (D35)', async () => {
  await expect(
    withTenant({ orgId: commonsId, principal: memberOf(commonsId) }, (tx) =>
      budgetGate.consume(tx, systemPrincipal('runs'), 'run')
    )
  ).rejects.toBeInstanceOf(NotBuiltError)
})
