// `@skyclause/auth/testing` (#79 §7): real credentials in the test database, for resolvePrincipal's tests, the API's
// and Playwright's signInAs. Accounts, organisations and sessions made here exist only in tests (NFR-15). Callers set
// the web env first (Vitest's setupFiles, or playwright.config.ts) and point DATABASE_URL_* at a test database.
import { randomUUID } from 'node:crypto'
import type { Role, Scope } from '@skyclause/contracts'
import { tokenHash, withTenant, type Tx } from '@skyclause/db'
import {
  makeGuestToken,
  makeMember,
  makeOauthGrant,
  makeOrganization,
  makeProject,
  makeShareLink,
  makeUser
} from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { signJWT, testUtils, type TestCookie, type TestHelpers } from 'better-auth/plugins'
import { authSettings, createAuth, resources } from '../../src/instance'

export { TEST_AUTH_ENV } from './env'

let instance: ReturnType<typeof createAuth> | undefined

/** The app's configuration plus Better Auth's test-utils plugin, on the same database and secret. */
const harness = () => (instance ??= createAuth(authSettings(), { plugins: [testUtils()] }))
const helpers = async () => ((await harness().$context) as unknown as { test: TestHelpers }).test

export interface TestAccount {
  id: string
  email: string
}

/** A verified account, anonymous (a guest) or deleted when asked. */
export async function makeAccount(
  o: { email?: string; anonymous?: boolean; emailVerified?: boolean; deletedAt?: Date } = {}
): Promise<TestAccount> {
  const row = await makeUser({
    ...(o.email ? { email: o.email } : {}),
    isAnonymous: o.anonymous ?? false,
    emailVerified: o.emailVerified ?? true,
    deletedAt: o.deletedAt ?? null
  })
  return { id: row.id, email: row.email }
}

/** An organisation with `slug`, or a new one. */
export async function makeOrg(o: { slug?: string } = {}): Promise<{ id: string; slug: string }> {
  const row = await makeOrganization(o.slug ? { slug: o.slug, name: o.slug } : {})
  return { id: row.id, slug: row.slug }
}

export async function addMember(orgId: string, accountId: string, role: Role): Promise<void> {
  await makeMember({ organizationId: orgId, userId: accountId, role })
}

export interface TestSession {
  sessionId: string
  /** The raw session token: `Authorization: Bearer <token>` (the CLI's session bearer). */
  token: string
  /** The signed session cookie as a `Cookie` header value. */
  cookie: string
  /** The same cookie for a browser context. */
  cookies: TestCookie[]
}

/** A session row for `accountId`, minted in the database, with its signed cookie (Better Auth's test-utils). */
export async function signIn(accountId: string): Promise<TestSession> {
  const { session, headers, cookies, token } = await (await helpers()).login({ userId: accountId })
  return { sessionId: session.id, token, cookie: headers.get('cookie')!, cookies }
}

/** Revokes a session as signing out does: its row is deleted. */
export async function revokeSession(token: string): Promise<void> {
  await (await harness().$context).internalAdapter.deleteSession(token)
}

/** An organisation API key, stored as #106 and #128 store theirs; the creator must be a member who may create keys. */
export async function makeApiKey(o: {
  orgId: string
  accountId: string
  scopes: Scope[]
  sourceId?: string
}): Promise<{ id: string; key: string }> {
  const created = await harness().api.createApiKey({
    body: {
      organizationId: o.orgId,
      userId: o.accountId,
      name: 'Test API key',
      permissions: { scopes: o.scopes },
      metadata: { account_id: o.accountId, ...(o.sourceId ? { source_id: o.sourceId } : {}) }
    }
  })
  return { id: created.id, key: created.key }
}

/** Runs `fn` in `orgId` as one of its owners, for #92's factories. */
export const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: memberOf(orgId) }, fn)

/** A `skg_` guest token row for `accountId` in `orgId`, with its plaintext. */
export async function makeGuestTokenFor(o: {
  orgId: string
  accountId: string
  scopes: Array<'read' | 'draft'>
  expiresAt?: Date
}): Promise<{ id: string; token: string }> {
  const token = `skg_${randomUUID().replaceAll('-', '')}`
  const row = await inOrg(o.orgId, (tx) =>
    makeGuestToken(tx, {
      accountId: o.accountId,
      scopes: o.scopes,
      tokenHash: tokenHash(token),
      ...(o.expiresAt ? { expiresAt: o.expiresAt } : {})
    })
  )
  return { id: row.id, token }
}

/** A share link to a new project in `orgId`, with the token its `sc_share` cookie carries. */
export async function makeShareLinkFor(o: {
  orgId: string
  access: 'view' | 'reviewer'
  revokedAt?: Date
}): Promise<{ id: string; projectId: string; token: string }> {
  const token = randomUUID()
  const row = await inOrg(o.orgId, (tx) =>
    makeShareLink(tx, {
      access: o.access,
      tokenHash: tokenHash(token),
      ...(o.revokedAt ? { revokedAt: o.revokedAt } : {})
    })
  )
  return { id: row.id, projectId: row.projectId, token }
}

/** An OAuth grant row (#198 writes these at consent). */
export async function makeGrant(o: {
  orgId: string
  accountId: string
  clientId?: string
  resource?: 'api' | 'mcp'
  scopes: Array<'read' | 'draft'>
  projectIds?: string[]
  shareLinkId?: string
  revokedAt?: Date
}): Promise<{ id: string; clientId: string }> {
  const clientId = o.clientId ?? `client-${randomUUID()}`
  const row = await inOrg(o.orgId, (tx) =>
    makeOauthGrant(tx, {
      accountId: o.accountId,
      clientId,
      resource: o.resource ?? 'mcp',
      scopes: o.scopes,
      projectIds: o.projectIds ?? null,
      shareLinkId: o.shareLinkId ?? null,
      revokedAt: o.revokedAt ?? null
    })
  )
  return { id: row.id, clientId }
}

/** A project in `orgId`. */
export async function makeProjectIn(orgId: string): Promise<{ id: string }> {
  const row = await inOrg(orgId, (tx) => makeProject(tx))
  return { id: row.id }
}

/**
 * An access token as @better-auth/mcp's OAuth provider signs one (header `typ: at+jwt`, the JWT plugin's key and
 * issuer), for `resource` (`api` is `{API_ORIGIN}/v1`, `mcp` `{MCP_ORIGIN}/mcp`) and carrying `grant_id` (#198).
 */
export async function mintAccessToken(o: {
  accountId: string
  clientId: string
  resource: 'api' | 'mcp'
  scope: string
  grantId?: string
  issuer?: string
}): Promise<string> {
  const auth = harness()
  const settings = authSettings()
  const jwtPlugin = (
    auth.options.plugins as Array<{ id: string; options: Parameters<typeof signJWT>[1]['options'] }>
  ).find((plugin) => plugin.id === 'jwt')
  if (!jwtPlugin) throw new Error('The JWT plugin is not registered in the auth test harness')
  const jwtOptions = jwtPlugin.options
  const iat = Math.floor(Date.now() / 1000)
  return signJWT({ context: await auth.$context } as never, {
    options: jwtOptions,
    header: { typ: 'at+jwt' },
    payload: {
      sub: o.accountId,
      aud: resources(settings)[o.resource],
      client_id: o.clientId,
      azp: o.clientId,
      scope: o.scope,
      iss: o.issuer ?? settings.appOrigin,
      iat,
      exp: iat + 3600,
      jti: randomUUID(),
      ...(o.grantId ? { grant_id: o.grantId } : {})
    }
  })
}
