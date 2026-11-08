import { ROLES, type Principal, type ResolvePrincipal, type Role } from '@skyclause/contracts'
import {
  guestToken,
  member,
  oauthGrant,
  shareLink,
  systemPrincipal,
  tokenHash,
  user,
  withTenant,
  type Tx
} from '@skyclause/db'
import { authDatabase, credentialOwner } from '@skyclause/db/auth'
import { and, eq, isNull } from 'drizzle-orm'
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { getAuth, resources } from './instance'

type Surface = Parameters<ResolvePrincipal>[1]['surface']
type ClientName = string | null

const SHARE_COOKIE = 'sc_share'
/** The platform reading a credential's own row, in its organisation (#94 ticket decision). */
const reader = systemPrincipal('auth:credential')

/** `Skyclause-Client: mcp; name="…"`: a label, never a grant (#79 §1). #93 reads `tool="…"` for its audit. */
const clientNameOf = (header: string | null) => (header && /(?:^|;)\s*name="([^"]*)"/.exec(header)?.[1]) ?? null

const isRole = (role: string): role is Role => (ROLES as readonly string[]).includes(role)
const only = <S extends string>(allowed: readonly S[], values: readonly string[]) =>
  allowed.filter((scope) => values.includes(scope))

/** D30: a verified, signed-up address in SKYCLAUSE_STAFF_EMAILS (comma-separated, any case). */
function isStaff(u: { email: string; emailVerified: boolean; isAnonymous?: boolean | null }) {
  const listed = (process.env.SKYCLAUSE_STAFF_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase())
  return !u.isAnonymous && u.emailVerified && listed.includes(u.email.toLowerCase())
}

/** The account's current role in `orgId`, or null when it isn't a member or the account is deleted. */
export async function currentRole(accountId: string, orgId: string): Promise<Role | null> {
  const [row] = await authDatabase()
    .select({ role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.userId, accountId), eq(member.organizationId, orgId), isNull(user.deletedAt)))
    .limit(1)
  return row && isRole(row.role) ? row.role : null
}

async function liveAccount(accountId: string) {
  const [row] = await authDatabase()
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, accountId), isNull(user.deletedAt)))
  return !!row
}

/** A credential's row through `credential_owner()` and then `withTenant`, or null when it isn't live. */
async function credentialRow<T>(
  kind: Parameters<typeof credentialOwner>[0],
  key: string,
  read: (tx: Tx, id: string) => Promise<T | undefined>
) {
  const owner = await credentialOwner(kind, key)
  if (!owner) return null
  return (await withTenant({ orgId: owner.orgId, principal: reader }, (tx) => read(tx, owner.id))) ?? null
}

/** getSession's result with the columns #79 §3 and the anonymous plugin add, which its inference drops. */
interface FoundSession {
  session: { id: string; createdAt: Date; reauthenticatedAt?: Date | null }
  user: { id: string; email: string; emailVerified: boolean; isAnonymous?: boolean | null; deletedAt?: Date | null }
}

async function sessionPrincipal(headers: Headers, via: 'cookie' | 'bearer', clientName: ClientName) {
  // No refresh: a resolver can't set the renewed cookie; the client's own /api/auth/get-session does.
  const found: FoundSession | null = await getAuth().auth.api.getSession({ headers, query: { disableRefresh: true } })
  if (!found || found.user.deletedAt) return null
  const { session, user: account } = found
  return {
    kind: 'session',
    via,
    client: via === 'cookie' ? 'app' : 'cli',
    clientName,
    accountId: account.id,
    sessionId: session.id,
    isGuest: !!account.isAnonymous,
    staff: isStaff(account),
    orgId: null,
    role: null,
    authenticatedAt: session.reauthenticatedAt ?? session.createdAt
  } satisfies Principal
}

/** A `skc_` key: an `ingest`-only key bound to a source is a device, else the creator's key at their current role. */
async function apiKeyPrincipal(key: string, clientName: ClientName): Promise<Principal | null> {
  const { valid, key: found } = await getAuth().auth.api.verifyApiKey({ body: { key } })
  if (!valid || !found) return null
  const scopes = found.permissions?.scopes ?? []
  const metadata = (found.metadata ?? {}) as { account_id?: unknown; source_id?: unknown }
  const orgId = found.referenceId
  if (scopes.includes('ingest')) {
    if (scopes.length !== 1 || typeof metadata.source_id !== 'string') return null
    return { kind: 'device', client: 'api', clientName, keyId: found.id, orgId, sourceId: metadata.source_id }
  }
  if (typeof metadata.account_id !== 'string') return null
  const role = await currentRole(metadata.account_id, orgId)
  if (!role) return null
  const keyScopes = only(['read', 'draft', 'admin'] as const, scopes)
  return {
    kind: 'api_key',
    client: 'api',
    clientName,
    keyId: found.id,
    accountId: metadata.account_id,
    orgId,
    role,
    scopes: keyScopes
  }
}

async function guestTokenPrincipal(token: string, clientName: ClientName): Promise<Principal | null> {
  const row = await credentialRow(
    'guest_token',
    tokenHash(token),
    async (tx, id) => (await tx.select().from(guestToken).where(eq(guestToken.id, id)))[0]
  )
  if (!row || !(await liveAccount(row.accountId))) return null
  return {
    kind: 'guest_token',
    client: 'playground',
    clientName,
    tokenId: row.id,
    accountId: row.accountId,
    orgId: row.orgId,
    scopes: only(['read', 'draft'] as const, row.scopes)
  }
}

/** D37: a signed access token from the JWT plugin's keys, issued by APP_ORIGIN for the surface's resource. */
async function verifyAccessToken(token: string, surface: Surface): Promise<JWTPayload | null> {
  const { auth, settings } = getAuth()
  const { api, mcp } = resources(settings)
  const audience = surface === 'v1' ? [api] : surface === 'mcp' ? [mcp] : [api, mcp]
  try {
    const { keys } = await auth.api.getJwks()
    const { payload } = await jwtVerify(token, createLocalJWKSet({ keys }), {
      issuer: settings.appOrigin,
      audience,
      typ: 'at+jwt'
    })
    return payload
  } catch {
    return null
  }
}

/**
 * An OAuth access token names its `oauth_grant` in `grant_id` (#198 issues it at consent). The grant must belong to
 * the token's account and client; a link-bound grant takes its live reviewer link's project and no role, any other
 * its account's current role.
 */
async function oauthPrincipal(token: string, surface: Surface, clientName: ClientName): Promise<Principal | null> {
  const claims = await verifyAccessToken(token, surface)
  const { sub, client_id: clientId, grant_id: grantId, scope } = claims ?? {}
  if (typeof sub !== 'string' || typeof clientId !== 'string' || typeof grantId !== 'string') return null
  const found = await credentialRow('oauth_grant', grantId, async (tx, id) => {
    const [grant] = await tx.select().from(oauthGrant).where(eq(oauthGrant.id, id))
    if (!grant?.shareLinkId) return grant && { grant, link: null }
    const [link] = await tx.select().from(shareLink).where(eq(shareLink.id, grant.shareLinkId))
    return { grant, link: link ?? null }
  })
  if (!found || found.grant.accountId !== sub || found.grant.clientId !== clientId || !(await liveAccount(sub))) {
    return null
  }
  const { grant, link } = found
  let role: Role | null = null
  let projectIds: string[] | 'all'
  if (grant.shareLinkId) {
    if (!link || link.access !== 'reviewer' || link.revokedAt || link.expiresAt <= new Date()) return null
    projectIds = [link.projectId]
  } else {
    role = await currentRole(sub, grant.orgId)
    if (!role) return null
    projectIds = grant.projectIds ?? 'all'
  }
  const audiences = [claims!.aud].flat()
  const resource =
    surface === 'v1'
      ? 'api'
      : surface === 'mcp'
        ? 'mcp'
        : audiences.includes(resources(getAuth().settings).mcp)
          ? 'mcp'
          : 'api'
  const granted = typeof scope === 'string' ? scope.split(' ') : []
  return {
    kind: 'oauth',
    client: resource,
    clientName,
    grantId: grant.id,
    clientId,
    accountId: sub,
    orgId: grant.orgId,
    role,
    resource,
    projectIds,
    scopes: only(['read', 'draft'] as const, granted).filter((s) => grant.scopes.includes(s)),
    shareLinkId: grant.shareLinkId
  }
}

function cookieValue(header: string, name: string) {
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

async function shareLinkPrincipal(cookies: string, clientName: ClientName): Promise<Principal | null> {
  const token = cookieValue(cookies, SHARE_COOKIE)
  if (!token) return null
  const row = await credentialRow(
    'share_link',
    tokenHash(token),
    async (tx, id) => (await tx.select().from(shareLink).where(eq(shareLink.id, id)))[0]
  )
  if (!row) return null
  return {
    kind: 'share_link',
    client: 'app',
    clientName,
    linkId: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    access: row.access
  }
}

/**
 * #79 §1, in its order: `skc_` key, `skg_` token, session bearer, OAuth JWT (audience-checked), session cookie,
 * `sc_share` cookie. Every bearer travels in `Authorization: Bearer` and decides alone: an invalid one is null, never
 * a fall-back to a cookie. The bearer kinds have disjoint shapes (a JWT has two dots, a session token at most one), so
 * the shape picks the one lookup the order would reach. `/mcp` is OAuth only (#79 §4): any other credential is null.
 */
export const resolvePrincipal: ResolvePrincipal = async (req, { surface }) => {
  const clientName = clientNameOf(req.headers.get('Skyclause-Client'))
  const authorization = req.headers.get('Authorization')
  if (authorization) {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
    if (!token) return null
    const jwt = token.split('.').length === 3 && !token.startsWith('skc_') && !token.startsWith('skg_')
    if (surface === 'mcp') return jwt ? oauthPrincipal(token, surface, clientName) : null
    if (token.startsWith('skc_')) return apiKeyPrincipal(token, clientName)
    if (token.startsWith('skg_')) return guestTokenPrincipal(token, clientName)
    if (jwt) return oauthPrincipal(token, surface, clientName)
    return sessionPrincipal(new Headers({ Authorization: `Bearer ${token}` }), 'bearer', clientName)
  }
  const cookies = req.headers.get('Cookie')
  if (surface === 'mcp' || !cookies) return null
  return (
    (await sessionPrincipal(new Headers({ Cookie: cookies }), 'cookie', clientName)) ??
    shareLinkPrincipal(cookies, clientName)
  )
}
