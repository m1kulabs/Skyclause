// #79 §1 resolvePrincipal: every principal kind from a real credential in the test database, in §1's order.
import type { Principal } from '@skyclause/contracts'
import { apikey, member, oauthGrant, shareLink } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { can } from '../src/can'
import { resolvePrincipal } from '../src/principal'
import {
  addMember,
  inOrg,
  makeAccount,
  makeApiKey,
  makeGrant,
  makeGuestTokenFor,
  makeOrg,
  makeProjectIn,
  makeShareLinkFor,
  mintAccessToken,
  revokeSession,
  signIn
} from './harness'

type Surface = 'v1' | 'api' | 'mcp'
const resolve = (headers: Record<string, string>, surface: Surface = 'v1') =>
  resolvePrincipal(new Request('https://api.skyclause.m1ku.tech/v1/me', { headers }), { surface })
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
const past = new Date(Date.now() - 1000)

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrg()).id
})
afterEach(() => vi.unstubAllEnvs())

async function memberAccount(role: Parameters<typeof addMember>[2] = 'editor') {
  const account = await makeAccount()
  await addMember(orgId, account.id, role)
  return account
}
const setRole = (accountId: string, role: string) =>
  authDatabase()
    .update(member)
    .set({ role })
    .where(and(eq(member.userId, accountId), eq(member.organizationId, orgId)))

describe('sessions', () => {
  test('a session cookie is an app session; the same session as a bearer is the CLI’s', async () => {
    const account = await memberAccount()
    const session = await signIn(account.id)
    const expected = {
      kind: 'session',
      accountId: account.id,
      sessionId: session.sessionId,
      isGuest: false,
      staff: false,
      orgId: null,
      role: null,
      clientName: null,
      authenticatedAt: expect.any(Date)
    }
    expect(await resolve({ Cookie: session.cookie }, 'api')).toEqual({ ...expected, via: 'cookie', client: 'app' })
    expect(await resolve(bearer(session.token))).toEqual({ ...expected, via: 'bearer', client: 'cli' })
  })

  test('a revoked session resolves to null on its next request, by cookie and by bearer', async () => {
    const session = await signIn((await memberAccount()).id)
    expect(await resolve({ Cookie: session.cookie })).not.toBeNull()
    await revokeSession(session.token)
    expect(await resolve({ Cookie: session.cookie })).toBeNull()
    expect(await resolve(bearer(session.token))).toBeNull()
  })

  test('an anonymous account’s session is a guest; a deleted account’s resolves to null', async () => {
    const guest = await signIn((await makeAccount({ anonymous: true })).id)
    expect(await resolve({ Cookie: guest.cookie })).toMatchObject({ kind: 'session', isGuest: true })
    const deleted = await signIn((await makeAccount({ deletedAt: past })).id)
    expect(await resolve({ Cookie: deleted.cookie })).toBeNull()
  })

  test('staff only for a verified, signed-up address listed in SKYCLAUSE_STAFF_EMAILS (D30)', async () => {
    const listed = await makeAccount()
    const anonymous = await makeAccount({ anonymous: true })
    const unverified = await makeAccount({ emailVerified: false })
    const unlisted = await makeAccount()
    vi.stubEnv(
      'SKYCLAUSE_STAFF_EMAILS',
      ` other@example.org, ${listed.email.toUpperCase()} ,${anonymous.email},${unverified.email}`
    )
    const staff = async (accountId: string) => {
      const principal = await resolve({ Cookie: (await signIn(accountId)).cookie })
      return principal?.kind === 'session' && principal.staff
    }
    expect(await staff(listed.id)).toBe(true)
    expect(await staff(anonymous.id)).toBe(false)
    expect(await staff(unverified.id)).toBe(false)
    expect(await staff(unlisted.id)).toBe(false)
    vi.stubEnv('SKYCLAUSE_STAFF_EMAILS', '')
    expect(await staff(listed.id)).toBe(false)
  })

  test('Skyclause-Client names the client, a label that never changes the kind or client', async () => {
    const session = await signIn((await memberAccount()).id)
    const principal = await resolve({
      ...bearer(session.token),
      'Skyclause-Client': 'mcp; name="claude-code"; tool="list_projects"'
    })
    expect(principal).toMatchObject({ kind: 'session', client: 'cli', clientName: 'claude-code' })
  })
})

describe('API keys and devices', () => {
  test('a skc_ key carries its scopes and its creator’s current role, which caps it at once', async () => {
    const account = await memberAccount('editor')
    const key = await makeApiKey({ orgId, accountId: account.id, scopes: ['read', 'draft'] })
    expect(key.key).toMatch(/^skc_/)
    const principal = await resolve(bearer(key.key))
    expect(principal).toEqual({
      kind: 'api_key',
      client: 'api',
      clientName: null,
      keyId: key.id,
      accountId: account.id,
      orgId,
      role: 'editor',
      scopes: ['read', 'draft']
    })
    expect(can(principal!, 'window.declare')).toBe(true)
    await setRole(account.id, 'viewer')
    const lowered = await resolve(bearer(key.key))
    expect(lowered).toMatchObject({ role: 'viewer' })
    expect(can(lowered!, 'window.declare')).toBe(false)
  })

  test('a key resolves to null once its creator leaves, is deleted, or the key is disabled or unknown', async () => {
    const leaver = await memberAccount()
    const left = await makeApiKey({ orgId, accountId: leaver.id, scopes: ['read'] })
    await authDatabase().delete(member).where(eq(member.userId, leaver.id))
    expect(await resolve(bearer(left.key))).toBeNull()

    const disabled = await makeApiKey({ orgId, accountId: (await memberAccount()).id, scopes: ['read'] })
    await authDatabase().update(apikey).set({ enabled: false }).where(eq(apikey.id, disabled.id))
    expect(await resolve(bearer(disabled.key))).toBeNull()
    expect(await resolve(bearer(`skc_${'x'.repeat(64)}`))).toBeNull()
  })

  test('an ingest-only key with metadata.source_id is a device; without one, or with other scopes, null', async () => {
    const admin = await memberAccount('admin')
    const device = await makeApiKey({ orgId, accountId: admin.id, scopes: ['ingest'], sourceId: 'source-1' })
    expect(await resolve(bearer(device.key))).toEqual({
      kind: 'device',
      client: 'api',
      clientName: null,
      keyId: device.id,
      orgId,
      sourceId: 'source-1'
    })
    // A camera keeps working after the admin who made its key leaves.
    await authDatabase().delete(member).where(eq(member.userId, admin.id))
    expect(await resolve(bearer(device.key))).toMatchObject({ kind: 'device' })

    const creator = await memberAccount('admin')
    const sourceless = await makeApiKey({ orgId, accountId: creator.id, scopes: ['ingest'] })
    const mixed = await makeApiKey({ orgId, accountId: creator.id, scopes: ['ingest', 'read'], sourceId: 'source-1' })
    expect(await resolve(bearer(sourceless.key))).toBeNull()
    expect(await resolve(bearer(mixed.key))).toBeNull()
  })

  test('a skc_ key wins over a session cookie on the same request', async () => {
    const account = await memberAccount()
    const key = await makeApiKey({ orgId, accountId: account.id, scopes: ['read'] })
    const session = await signIn(account.id)
    expect(await resolve({ ...bearer(key.key), Cookie: session.cookie })).toMatchObject({ kind: 'api_key' })
    // An invalid bearer is refused outright rather than falling back to the cookie.
    expect(await resolve({ ...bearer(`skc_${'x'.repeat(64)}`), Cookie: session.cookie })).toBeNull()
  })

  test('the plugin’s own per-key limit is off: #93’s rateLimit limits each credential', async () => {
    const key = await makeApiKey({ orgId, accountId: (await memberAccount()).id, scopes: ['read'] })
    for (let i = 0; i < 12; i++) expect(await resolve(bearer(key.key)), `request ${i + 1}`).not.toBeNull()
  })
})

describe('guest tokens', () => {
  test('a live skg_ token resolves through guest_token; an expired one to null', async () => {
    const account = await makeAccount({ anonymous: true })
    const token = await makeGuestTokenFor({ orgId, accountId: account.id, scopes: ['read', 'draft'] })
    expect(await resolve(bearer(token.token))).toEqual({
      kind: 'guest_token',
      client: 'playground',
      clientName: null,
      tokenId: token.id,
      accountId: account.id,
      orgId,
      scopes: ['read', 'draft']
    })
    const expired = await makeGuestTokenFor({ orgId, accountId: account.id, scopes: ['read'], expiresAt: past })
    expect(await resolve(bearer(expired.token))).toBeNull()
    expect(await resolve(bearer('skg_unknown'))).toBeNull()
  })
})

describe('OAuth access tokens (D37)', () => {
  async function grantFor(o: Partial<Parameters<typeof makeGrant>[0]> = {}) {
    const account = o.accountId ? { id: o.accountId } : await memberAccount('editor')
    const grant = await makeGrant({ orgId, accountId: account.id, scopes: ['read', 'draft'], ...o })
    return { account, grant }
  }

  test('a /v1 token is refused on /mcp and an /mcp token on /v1; /api resolves either for its 403', async () => {
    const { account, grant } = await grantFor({ resource: 'api' })
    const mcpGrant = await makeGrant({
      orgId,
      accountId: account.id,
      clientId: grant.clientId,
      resource: 'mcp',
      scopes: ['read', 'draft']
    })
    const token = (resource: 'api' | 'mcp') =>
      mintAccessToken({
        accountId: account.id,
        clientId: grant.clientId,
        resource,
        scope: 'read draft',
        grantId: resource === 'api' ? grant.id : mcpGrant.id
      })
    const expected: Principal = {
      kind: 'oauth',
      client: 'api',
      clientName: null,
      grantId: grant.id,
      clientId: grant.clientId,
      accountId: account.id,
      orgId,
      role: 'editor',
      resource: 'api',
      projectIds: 'all',
      scopes: ['read', 'draft'],
      shareLinkId: null
    }
    const api = await token('api')
    expect(await resolve(bearer(api), 'v1')).toEqual(expected)
    expect(await resolve(bearer(api), 'mcp')).toBeNull()
    const mcp = await token('mcp')
    expect(await resolve(bearer(mcp), 'mcp')).toEqual({
      ...expected,
      grantId: mcpGrant.id,
      client: 'mcp',
      resource: 'mcp'
    })
    expect(await resolve(bearer(mcp), 'v1')).toBeNull()
    expect(await resolve(bearer(api), 'api')).toMatchObject({ kind: 'oauth', resource: 'api' })
    expect(await resolve(bearer(mcp), 'api')).toMatchObject({ kind: 'oauth', resource: 'mcp' })
  })

  test('scopes are the token’s within the grant’s, and projectIds refuse another project’s t.projectId', async () => {
    const [p1, p2] = [await makeProjectIn(orgId), await makeProjectIn(orgId)]
    const { account, grant } = await grantFor({ scopes: ['read'], projectIds: [p1.id] })
    const token = await mintAccessToken({
      accountId: account.id,
      clientId: grant.clientId,
      resource: 'mcp',
      scope: 'openid read draft',
      grantId: grant.id
    })
    const principal = (await resolve(bearer(token), 'mcp'))!
    expect(principal).toMatchObject({ scopes: ['read'], projectIds: [p1.id] })
    expect(can(principal, 'project.view', { projectId: p1.id })).toBe(true)
    expect(can(principal, 'project.view', { projectId: p2.id })).toBe(false)
  })

  test('a revoked grant, another account’s or client’s token, a foreign issuer or no grant_id resolve to null', async () => {
    const { account, grant } = await grantFor({ resource: 'api' })
    const mint = (o: Partial<Parameters<typeof mintAccessToken>[0]>) =>
      mintAccessToken({
        accountId: account.id,
        clientId: grant.clientId,
        resource: 'api',
        scope: 'read',
        grantId: grant.id,
        ...o
      })
    const other = await memberAccount()
    for (const token of [
      await mint({ accountId: other.id }),
      await mint({ clientId: 'another-client' }),
      await mint({ issuer: 'https://evil.example' }),
      await mint({ grantId: undefined })
    ]) {
      expect(await resolve(bearer(token))).toBeNull()
    }
    const live = await mint({})
    expect(await resolve(bearer(live))).not.toBeNull()
    const [header, payload] = live.split('.')
    expect(await resolve(bearer(`${header}.${payload}.forged`))).toBeNull()
    await inOrg(orgId, (tx) => tx.update(oauthGrant).set({ revokedAt: past }).where(eq(oauthGrant.id, grant.id)))
    expect(await resolve(bearer(live))).toBeNull()
  })

  test('a grant whose account left is null; a link-bound grant takes the live link’s project and no role', async () => {
    const leaver = await memberAccount()
    const { grant: left } = await grantFor({ accountId: leaver.id })
    await authDatabase().delete(member).where(eq(member.userId, leaver.id))
    const leftToken = await mintAccessToken({
      accountId: leaver.id,
      clientId: left.clientId,
      resource: 'mcp',
      scope: 'read',
      grantId: left.id
    })
    expect(await resolve(bearer(leftToken), 'mcp')).toBeNull()

    const reviewer = await makeAccount()
    const link = await makeShareLinkFor({ orgId, access: 'reviewer' })
    const { grant } = await grantFor({ accountId: reviewer.id, shareLinkId: link.id })
    const token = await mintAccessToken({
      accountId: reviewer.id,
      clientId: grant.clientId,
      resource: 'mcp',
      scope: 'read draft',
      grantId: grant.id
    })
    const principal = (await resolve(bearer(token), 'mcp'))!
    expect(principal).toMatchObject({ kind: 'oauth', role: null, projectIds: [link.projectId], shareLinkId: link.id })
    expect(can(principal, 'window.declare', { projectId: link.projectId })).toBe(true)
    expect(can(principal, 'clause_draft.edit', { projectId: link.projectId })).toBe(false)
    await inOrg(orgId, (tx) => tx.update(shareLink).set({ revokedAt: past }).where(eq(shareLink.id, link.id)))
    expect(await resolve(bearer(token), 'mcp')).toBeNull()
  })
})

describe('share links', () => {
  test('an sc_share cookie resolves through share_link; a revoked link to null; /mcp reads no cookie', async () => {
    const link = await makeShareLinkFor({ orgId, access: 'reviewer' })
    expect(await resolve({ Cookie: `theme=dark; sc_share=${link.token}` }, 'api')).toEqual({
      kind: 'share_link',
      client: 'app',
      clientName: null,
      linkId: link.id,
      orgId,
      projectId: link.projectId,
      access: 'reviewer'
    })
    expect(await resolve({ Cookie: `sc_share=${link.token}` }, 'mcp')).toBeNull()
    const revoked = await makeShareLinkFor({ orgId, access: 'view', revokedAt: past })
    expect(await resolve({ Cookie: `sc_share=${revoked.token}` })).toBeNull()
  })

  test('a session cookie comes before sc_share', async () => {
    const session = await signIn((await memberAccount()).id)
    const link = await makeShareLinkFor({ orgId, access: 'view' })
    expect(await resolve({ Cookie: `${session.cookie}; sc_share=${link.token}` })).toMatchObject({ kind: 'session' })
  })
})

test('/mcp resolves OAuth access tokens only (#79 §4): a key, a guest token and a session bearer are null there', async () => {
  const account = await memberAccount()
  const guest = await makeAccount({ anonymous: true })
  const others = [
    (await makeApiKey({ orgId, accountId: account.id, scopes: ['read'] })).key,
    (await makeGuestTokenFor({ orgId, accountId: guest.id, scopes: ['read'] })).token,
    (await signIn(account.id)).token
  ]
  for (const token of others) {
    expect(await resolve(bearer(token), 'v1')).not.toBeNull()
    expect(await resolve(bearer(token), 'mcp')).toBeNull()
  }
})
