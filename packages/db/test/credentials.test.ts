// #94 ticket decision: a token held in a T table maps to its live row's organisation and ID, before any organisation
// is known, and only through auth.credential_owner().
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { credentialOwner } from '../src/auth'
import { tokenHash, withTenant, type Tx } from '../src'
import { makeGuestToken, makeOauthGrant, makeOrganization, makeShareLink } from './factories'
import { asLogin, databaseNow, memberOf, refusal } from './harness'

let orgId: string
const asMember = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

afterEach(() => {
  vi.useRealTimers()
})

test('tokenHash is the SHA-256 hex of the token', () => {
  // `printf %s skg_example | shasum -a 256`
  expect(tokenHash('skg_example')).toBe('45ab62d92ed823cb50c20820b50bf8494478a8e1893d05caf4cbe78bfc17be12')
})

test('a live guest token, share link or grant maps to its organisation and ID', async () => {
  const [token, link, grant] = await asMember(async (tx) => [
    await makeGuestToken(tx, { tokenHash: tokenHash('skg_live') }),
    await makeShareLink(tx, { tokenHash: tokenHash('share-live') }),
    await makeOauthGrant(tx)
  ])
  expect(await credentialOwner('guest_token', tokenHash('skg_live'))).toEqual({ orgId, id: token.id })
  expect(await credentialOwner('share_link', tokenHash('share-live'))).toEqual({ orgId, id: link.id })
  expect(await credentialOwner('oauth_grant', grant.id)).toEqual({ orgId, id: grant.id })
})

test('an expired or revoked row, an unknown hash or a malformed grant ID maps to null', async () => {
  // Only the application clock leads; credential expiry is checked against database time.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 60_000)
  const past = new Date((await databaseNow()).getTime() - 1000)
  const grant = await asMember(async (tx) => {
    await makeGuestToken(tx, { tokenHash: tokenHash('skg_expired'), expiresAt: past })
    await makeShareLink(tx, { tokenHash: tokenHash('share-expired'), expiresAt: past })
    await makeShareLink(tx, { tokenHash: tokenHash('share-revoked'), revokedAt: past })
    return makeOauthGrant(tx, { revokedAt: past })
  })
  expect(await credentialOwner('guest_token', tokenHash('skg_expired'))).toBeNull()
  expect(await credentialOwner('share_link', tokenHash('share-expired'))).toBeNull()
  expect(await credentialOwner('share_link', tokenHash('share-revoked'))).toBeNull()
  expect(await credentialOwner('oauth_grant', grant.id)).toBeNull()
  expect(await credentialOwner('guest_token', tokenHash('skg_unknown'))).toBeNull()
  expect(await credentialOwner('oauth_grant', 'not-a-uuid')).toBeNull()
})

test('only auth_app may call credential_owner', async () => {
  for (const login of ['app', 'system', 'retention'] as const) {
    const message = await refusal(
      asLogin(login, (client) => client.query("SELECT * FROM auth.credential_owner('guest_token', 'x')"))
    )
    expect(message, login).toMatch(/permission denied/)
  }
})
