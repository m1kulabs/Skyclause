import { ROLES, SCOPE_STATEMENTS, type Principal, type Role } from '@skyclause/contracts'
import {
  oauthClient,
  oauthConsent,
  oauthGrant,
  oauthOrgClient,
  member,
  organization,
  project,
  recordAudit,
  shareLink,
  systemPrincipal,
  tokenHash,
  track,
  withTenant
} from '@skyclause/db'
import { authDatabase, credentialOwner } from '@skyclause/db/auth'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { can } from './can'
import { getAuth, resources } from './instance'
import { oauthConsentReference } from './oauth-consent-context'

const GEMINI_REDIRECT = 'https://vertexaisearch.cloud.google.com/oauth-redirect'
const SCOPE_VALUES = ['read', 'draft'] as const
type Resource = 'api' | 'mcp'
type OAuthScope = (typeof SCOPE_VALUES)[number]

export interface OAuthConsentOrganisation {
  id: string
  name: string
  slug: string
  role: Role
  availableScopes: OAuthScope[]
  projects: Array<{ id: string; name: string }>
}

export interface OAuthConsentDetails {
  clientId: string
  clientName: string
  redirectHost: string
  redirectUri: string
  resource: Resource
  requestedScopes: OAuthScope[]
  lockedOrgId: string | null
  organisations: OAuthConsentOrganisation[]
  link: {
    id: string
    orgId: string
    organizationName: string
    projectId: string
    projectName: string
    access: 'view' | 'reviewer'
  } | null
}

type SessionSnapshot = {
  session: {
    id: string
    createdAt: Date
    reauthenticatedAt?: Date | null
    activeOrganizationId?: string | null
  }
  user: { id: string; isAnonymous?: boolean | null }
}

function scopeList(value: string | null): OAuthScope[] {
  const requested = (value ?? '')
    .split(' ')
    .filter((scope): scope is OAuthScope => SCOPE_VALUES.includes(scope as OAuthScope))
  return [...new Set(requested)]
}

function cookie(header: string | null, name: string) {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

function resourceFor(settings: ReturnType<typeof getAuth>['settings'], value: string): Resource | null {
  const known = resources(settings)
  return value === known.api ? 'api' : value === known.mcp ? 'mcp' : null
}

async function sessionFor(headers: Headers): Promise<SessionSnapshot> {
  const found = (await getAuth().auth.api.getSession({
    headers,
    query: { disableRefresh: true }
  })) as SessionSnapshot | null
  if (!found || found.user.isAnonymous) throw new Error('A signed-up member session is required for OAuth consent.')
  return found
}

async function applyOAuthConsent(
  headers: Headers,
  body: { accept: boolean; scope?: string; oauth_query: string },
  referenceId: string
): Promise<{ url: string }> {
  const auth = getAuth()
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Content-Type', 'application/json')
  requestHeaders.set('Accept', 'application/json')
  requestHeaders.set('Origin', auth.settings.appOrigin)
  const response = await oauthConsentReference.run(referenceId, () =>
    auth.auth.handler(
      new Request(`${auth.settings.appOrigin}/api/auth/oauth2/consent`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body)
      })
    )
  )
  const responseBody = (await response.json().catch(() => null)) as { url?: unknown } | null
  if (!response.ok || typeof responseBody?.url !== 'string')
    throw new Error(`The OAuth consent request returned ${response.status}: ${JSON.stringify(responseBody)}`)
  return { url: responseBody.url }
}

async function shareLinkFor(headers: Headers) {
  const token = cookie(headers.get('cookie'), 'sc_share')
  if (!token) return null
  const owner = await credentialOwner('share_link', tokenHash(token))
  if (!owner) return null
  const [row] = await withTenant({ orgId: owner.orgId, principal: systemPrincipal('auth:oauth-consent') }, (tx) =>
    tx
      .select()
      .from(shareLink)
      .where(and(eq(shareLink.id, owner.id), isNull(shareLink.revokedAt)))
      .limit(1)
  )
  if (!row || row.expiresAt <= new Date()) return null
  if (row.access !== 'reviewer') return null
  const [foundProject] = await withTenant(
    { orgId: owner.orgId, principal: systemPrincipal('auth:oauth-consent') },
    (tx) => tx.select({ name: project.name }).from(project).where(eq(project.id, row.projectId)).limit(1)
  )
  const [foundOrganization] = await authDatabase()
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, owner.orgId))
    .limit(1)
  if (!foundProject || !foundOrganization) return null
  return {
    id: row.id,
    orgId: owner.orgId,
    organizationName: foundOrganization.name,
    projectId: row.projectId,
    projectName: foundProject.name,
    access: row.access as 'view' | 'reviewer'
  }
}

/** The signed Better Auth query is checked before the consent page displays client details. */
export async function getOAuthConsentDetails(headers: Headers, oauthQuery: string): Promise<OAuthConsentDetails> {
  const session = await sessionFor(headers)
  const query = new URLSearchParams(oauthQuery)
  const clientId = query.get('client_id')
  const redirectUri = query.get('redirect_uri')
  const target = query.getAll('resource')
  if (!clientId || !redirectUri || target.length !== 1) throw new Error('The OAuth request is incomplete.')
  const resource = resourceFor(getAuth().settings, target[0]!)
  if (!resource) throw new Error('The requested OAuth resource is not supported.')
  const client = await getAuth().auth.api.getOAuthClientPublicPrelogin({
    headers,
    body: { client_id: clientId, oauth_query: oauthQuery }
  })
  const clientName = client.client_name || client.client_id
  const requestedScopes = scopeList(query.get('scope'))
  const redirect = new URL(redirectUri)

  const [storedClient] = await authDatabase()
    .select({ referenceId: oauthClient.referenceId })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1)
  let lockedOrgId: string | null = null
  if (storedClient?.referenceId) {
    const [organisationClient] = await withTenant(
      { orgId: storedClient.referenceId, principal: systemPrincipal('auth:oauth-consent') },
      (tx) =>
        tx
          .select()
          .from(oauthOrgClient)
          .where(and(eq(oauthOrgClient.clientId, clientId), isNull(oauthOrgClient.revokedAt)))
          .limit(1)
    )
    if (!organisationClient) throw new Error('The organisation OAuth client is revoked or missing.')
    lockedOrgId = storedClient.referenceId
  } else if (client.reference_id) {
    throw new Error('The organisation OAuth client is revoked or missing.')
  }

  const link = await shareLinkFor(headers)
  const organisations = await authDatabase()
    .select({ id: organization.id, name: organization.name, slug: organization.slug, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, session.user.id), isNull(organization.deletionRequestedAt)))
    .orderBy(asc(organization.name))
  const memberOrganisations: OAuthConsentOrganisation[] = []
  for (const row of organisations) {
    if (!(ROLES as readonly string[]).includes(row.role) || row.role === 'guest') continue
    const projects = await withTenant({ orgId: row.id, principal: systemPrincipal('auth:oauth-consent') }, (tx) =>
      tx
        .select({ id: project.id, name: project.name })
        .from(project)
        .where(isNull(project.archivedAt))
        .orderBy(asc(project.name))
    )
    const role = row.role as Role
    const principal: Principal = {
      kind: 'session',
      via: 'cookie',
      client: 'app',
      clientName: null,
      accountId: session.user.id,
      sessionId: session.session.id,
      isGuest: false,
      staff: false,
      orgId: row.id,
      role,
      authenticatedAt: session.session.reauthenticatedAt ?? session.session.createdAt
    }
    const availableScopes = SCOPE_VALUES.filter((scope) =>
      SCOPE_STATEMENTS[scope].some((statement) => can(principal, statement))
    )
    memberOrganisations.push({ id: row.id, name: row.name, slug: row.slug, role, availableScopes, projects })
  }
  return {
    clientId,
    clientName,
    redirectHost: redirect.host,
    redirectUri,
    resource,
    requestedScopes,
    lockedOrgId,
    organisations: lockedOrgId ? memberOrganisations.filter((org) => org.id === lockedOrgId) : memberOrganisations,
    link
  }
}

export interface CompleteOAuthConsentInput {
  headers: Headers
  oauthQuery: string
  orgId: string
  /** `null` grants all current and future projects in this organisation. */
  projectIds: string[] | null
  scopes: OAuthScope[]
  accept: boolean
}

export async function completeOAuthConsent(
  input: CompleteOAuthConsentInput
): Promise<{ url: string; grantId?: string }> {
  const { headers, oauthQuery, orgId, accept } = input
  const session = await sessionFor(headers)
  const details = await getOAuthConsentDetails(headers, oauthQuery)
  if (details.lockedOrgId && details.lockedOrgId !== orgId)
    throw new Error('This OAuth client is locked to another organisation.')
  if (details.link && details.link.orgId !== orgId) throw new Error('The share link belongs to another organisation.')

  let role: Role | null = null
  if (!details.link) {
    const [membership] = await authDatabase()
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)))
      .limit(1)
    if (!membership || membership.role === 'guest' || !(ROLES as readonly string[]).includes(membership.role)) {
      throw new Error('Choose an organisation where this account is a member.')
    }
    role = membership.role as Role
  }

  const allowedScopes: readonly OAuthScope[] = details.link
    ? details.link.access === 'reviewer'
      ? (['read', 'draft'] as const)
      : (['read'] as const)
    : SCOPE_VALUES.filter((scope) =>
        SCOPE_STATEMENTS[scope].some((statement) =>
          can(
            {
              kind: 'session',
              via: 'cookie',
              client: 'app',
              clientName: null,
              accountId: session.user.id,
              sessionId: session.session.id,
              isGuest: false,
              staff: false,
              orgId,
              role,
              authenticatedAt: session.session.reauthenticatedAt ?? session.session.createdAt
            },
            statement
          )
        )
      )
  const scopes = accept ? [...new Set(input.scopes)] : []
  if (
    accept &&
    (!scopes.length ||
      scopes.some((scope) => !details.requestedScopes.includes(scope) || !allowedScopes.includes(scope)))
  ) {
    throw new Error('The selected scopes are outside the request or this account’s access.')
  }

  let projectIds: string[] | null = null
  if (details.link) {
    projectIds = [details.link.projectId]
  } else if (input.projectIds) {
    const selected = [...new Set(input.projectIds)]
    const found = selected.length
      ? await withTenant({ orgId, principal: systemPrincipal('auth:oauth-consent') }, (tx) =>
          tx
            .select({ id: project.id })
            .from(project)
            .where(and(inArray(project.id, selected), isNull(project.archivedAt)))
        )
      : []
    if (found.length !== selected.length)
      throw new Error('A selected project is outside this organisation or archived.')
    projectIds = selected
  }

  const selectedOrg = details.link?.orgId ?? orgId
  const principal: Principal = {
    kind: 'session',
    via: 'cookie',
    client: 'app',
    clientName: null,
    accountId: session.user.id,
    sessionId: session.session.id,
    isGuest: false,
    staff: false,
    orgId: selectedOrg,
    role,
    authenticatedAt: session.session.reauthenticatedAt ?? session.session.createdAt
  }
  if (!accept) {
    const result = await applyOAuthConsent(headers, { accept: false, oauth_query: oauthQuery }, 'denied')
    await withTenant({ orgId: selectedOrg, principal }, async (tx) => {
      await recordAudit(tx, {
        action: 'mcp.consent_denied',
        target: { type: 'oauth_client', id: details.clientId },
        after: { resource: details.resource }
      })
    })
    return { url: result.url }
  }

  const inserted = await withTenant({ orgId: selectedOrg, principal }, async (tx) => {
    const previous = await tx
      .update(oauthGrant)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(oauthGrant.clientId, details.clientId),
          eq(oauthGrant.accountId, session.user.id),
          eq(oauthGrant.resource, details.resource),
          isNull(oauthGrant.revokedAt),
          details.link ? eq(oauthGrant.shareLinkId, details.link.id) : isNull(oauthGrant.shareLinkId)
        )
      )
      .returning()
    for (const revoked of previous) {
      await recordAudit(tx, {
        action: 'mcp.consent_revoked',
        target: { type: 'oauth_grant', id: revoked.id },
        projectId: revoked.shareLinkId ? details.link?.projectId : undefined,
        after: { resource: revoked.resource, reason: 'replaced' }
      })
    }
    const [grant] = await tx
      .insert(oauthGrant)
      .values({
        orgId: selectedOrg,
        clientId: details.clientId,
        accountId: session.user.id,
        resource: details.resource,
        projectIds,
        scopes,
        shareLinkId: details.link?.id ?? null
      })
      .returning()
    return grant!
  })

  const referenceId = `grant:${inserted.id}`
  try {
    const result = await applyOAuthConsent(
      headers,
      { accept: true, scope: scopes.join(' '), oauth_query: oauthQuery },
      referenceId
    )
    await withTenant({ orgId: selectedOrg, principal }, async (tx) => {
      await recordAudit(tx, {
        action: 'mcp.consent_granted',
        target: { type: 'oauth_grant', id: inserted.id },
        projectId: details.link?.projectId,
        after: {
          resource: details.resource,
          scopes,
          project_count: projectIds?.length ?? 'all',
          share_link_bound: !!details.link
        }
      })
      await track(tx, 'mcp_connected', { client: analyticsClient(details.clientName) })
    })
    return { url: result.url, grantId: inserted.id }
  } catch (error) {
    await withTenant({ orgId: selectedOrg, principal }, async (tx) => {
      await tx
        .update(oauthGrant)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(oauthGrant.id, inserted.id))
      await recordAudit(tx, {
        action: 'mcp.consent_revoked',
        target: { type: 'oauth_grant', id: inserted.id },
        projectId: details.link?.projectId,
        after: { resource: details.resource, reason: 'consent_failed' }
      })
    })
    throw error
  }
}

function analyticsClient(
  clientName: string
): 'claude' | 'chatgpt' | 'gemini_cli' | 'gemini_enterprise' | 'cursor' | 'vscode' | 'other' {
  const name = clientName.toLowerCase()
  if (name.includes('claude')) return 'claude'
  if (name.includes('chatgpt') || name.includes('openai')) return 'chatgpt'
  if (name.includes('gemini') && (name.includes('enterprise') || name.includes('vertex'))) return 'gemini_enterprise'
  if (name.includes('gemini') && name.includes('cli')) return 'gemini_cli'
  if (name.includes('cursor')) return 'cursor'
  if (name.includes('vscode') || name.includes('visual studio code')) return 'vscode'
  return 'other'
}

export interface OAuthClientView {
  id: string
  client_id: string
  client_name: string
  redirect_uris: string[]
  scopes: OAuthScope[]
  created_at: string
}

export interface OAuthGrantView {
  id: string
  client_id: string
  org_id: string
  resource: Resource
  project_ids: string[] | 'all'
  scopes: OAuthScope[]
  share_link_id: string | null
  revoked_at: string | null
  account_id: string
  client_name: string
  created_at: string
}

export interface OAuthPage<T> {
  data: T[]
  next_cursor: string | null
}

function page<T extends { id: string }>(all: T[], query: { limit: number; cursor?: string }): OAuthPage<T> {
  const start = query.cursor ? Math.max(0, all.findIndex((item) => item.id === query.cursor) + 1) : 0
  const data = all.slice(start, start + query.limit)
  return { data, next_cursor: start + data.length < all.length ? (data.at(-1)?.id ?? null) : null }
}

export async function listOAuthClients(
  orgId: string,
  query: { limit: number; cursor?: string }
): Promise<OAuthPage<OAuthClientView>> {
  const owned = await withTenant({ orgId, principal: systemPrincipal('api:oauth-clients') }, (tx) =>
    tx.select().from(oauthOrgClient).where(isNull(oauthOrgClient.revokedAt)).orderBy(desc(oauthOrgClient.createdAt))
  )
  if (!owned.length) return { data: [], next_cursor: null }
  const clients = await authDatabase()
    .select()
    .from(oauthClient)
    .where(
      inArray(
        oauthClient.clientId,
        owned.map((row) => row.clientId)
      )
    )
  const byClient = new Map(clients.map((client) => [client.clientId, client]))
  return page(
    owned.flatMap((row) => {
      const client = byClient.get(row.clientId)
      return client && !client.disabled
        ? [
            {
              id: row.id,
              client_id: client.clientId,
              client_name: client.name || client.clientId,
              redirect_uris: client.redirectUris,
              scopes: scopeList(client.scopes?.join(' ') ?? ''),
              created_at: (row.createdAt ?? new Date()).toISOString()
            }
          ]
        : []
    }),
    query
  )
}

export async function createOAuthClient(input: {
  orgId: string
  principal: Principal
  headers: Headers
  clientName: string
  redirectUris: string[]
  scopes: OAuthScope[]
}): Promise<
  OAuthClientView & { client_secret: string; redirect_uri: string; authorization_url: string; token_url: string }
> {
  if (input.redirectUris.length !== 1 || input.redirectUris[0] !== GEMINI_REDIRECT) {
    throw new Error(`The redirect URI must be ${GEMINI_REDIRECT}.`)
  }
  if (!input.scopes.length || input.scopes.some((scope) => !SCOPE_VALUES.includes(scope)))
    throw new Error('Choose at least one supported scope.')
  const auth = getAuth()
  const headers = new Headers(input.headers)
  await auth.auth.api.setActiveOrganization({ headers, body: { organizationId: input.orgId } })
  const created = await auth.auth.api.adminCreateOAuthClient({
    headers,
    body: {
      client_name: input.clientName,
      redirect_uris: [GEMINI_REDIRECT],
      scope: input.scopes.join(' '),
      token_endpoint_auth_method: 'client_secret_post',
      application_type: 'web',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      resources: [resources(auth.settings).mcp],
      require_pkce: true,
      skip_consent: false
    }
  })
  const clientId = created.client_id
  const secret = created.client_secret
  if (!clientId || !secret) throw new Error('Better Auth did not return the new client secret.')
  const now = new Date()
  if (input.principal.kind !== 'session') throw new Error('A signed-in session is required to create an OAuth client.')
  const actor: Principal = { ...input.principal, orgId: input.orgId }
  try {
    await authDatabase().update(oauthClient).set({ referenceId: input.orgId }).where(eq(oauthClient.clientId, clientId))
    const [row] = await withTenant({ orgId: input.orgId, principal: actor }, async (tx) => {
      const [createdRow] = await tx.insert(oauthOrgClient).values({ orgId: input.orgId, clientId }).returning()
      await recordAudit(tx, {
        action: 'mcp.client_created',
        target: { type: 'oauth_client', id: clientId },
        after: { scopes: input.scopes }
      })
      return [createdRow]
    })
    return {
      id: row!.id,
      client_id: clientId,
      client_name: input.clientName,
      redirect_uris: [GEMINI_REDIRECT],
      scopes: input.scopes,
      created_at: (row!.createdAt ?? now).toISOString(),
      client_secret: secret,
      redirect_uri: GEMINI_REDIRECT,
      authorization_url: `${auth.settings.appOrigin}/api/auth/oauth2/authorize`,
      token_url: `${auth.settings.appOrigin}/api/auth/oauth2/token`
    }
  } catch (error) {
    await authDatabase().update(oauthClient).set({ disabled: true }).where(eq(oauthClient.clientId, clientId))
    throw error
  }
}

export async function deleteOAuthClient(input: {
  orgId: string
  id: string
  now: Date
  principal: Principal
}): Promise<boolean> {
  const target = await withTenant(
    { orgId: input.orgId, principal: systemPrincipal('api:oauth-clients') },
    async (tx) => {
      const [row] = await tx
        .select()
        .from(oauthOrgClient)
        .where(and(eq(oauthOrgClient.id, input.id), isNull(oauthOrgClient.revokedAt)))
        .limit(1)
      if (!row) return null
      await tx
        .update(oauthOrgClient)
        .set({ revokedAt: input.now, updatedAt: input.now })
        .where(eq(oauthOrgClient.id, row.id))
      const grants = await tx
        .update(oauthGrant)
        .set({ revokedAt: input.now, updatedAt: input.now })
        .where(and(eq(oauthGrant.clientId, row.clientId), isNull(oauthGrant.revokedAt)))
        .returning()
      return { row, grants }
    }
  )
  if (!target) return false
  await authDatabase().update(oauthClient).set({ disabled: true }).where(eq(oauthClient.clientId, target.row.clientId))
  await authDatabase().delete(oauthConsent).where(eq(oauthConsent.clientId, target.row.clientId))
  await withTenant({ orgId: input.orgId, principal: input.principal }, async (tx) => {
    await recordAudit(tx, { action: 'mcp.client_revoked', target: { type: 'oauth_client', id: target.row.clientId } })
    for (const grant of target.grants) {
      await recordAudit(tx, {
        action: 'mcp.consent_revoked',
        target: { type: 'oauth_grant', id: grant.id },
        after: { resource: grant.resource, reason: 'client_revoked' }
      })
    }
  })
  return true
}

export async function listOAuthGrants(
  orgId: string,
  query: { limit: number; cursor?: string }
): Promise<OAuthPage<OAuthGrantView>> {
  const grants = await withTenant({ orgId, principal: systemPrincipal('api:oauth-grants') }, (tx) =>
    tx.select().from(oauthGrant).orderBy(desc(oauthGrant.createdAt))
  )
  const clients = grants.length
    ? await authDatabase()
        .select()
        .from(oauthClient)
        .where(inArray(oauthClient.clientId, [...new Set(grants.map((grant) => grant.clientId))]))
    : []
  const byClient = new Map(clients.map((client) => [client.clientId, client]))
  return page(
    grants.map((grant) => ({
      id: grant.id,
      client_id: grant.clientId,
      org_id: orgId,
      resource: grant.resource,
      project_ids: grant.projectIds ?? 'all',
      scopes: scopeList(grant.scopes.join(' ')),
      share_link_id: grant.shareLinkId,
      revoked_at: grant.revokedAt?.toISOString() ?? null,
      account_id: grant.accountId,
      client_name: byClient.get(grant.clientId)?.name || grant.clientId,
      created_at: grant.createdAt.toISOString()
    })),
    query
  )
}

export async function revokeOAuthGrant(input: {
  orgId: string
  id: string
  now: Date
  principal: Principal
}): Promise<boolean> {
  const grant = await withTenant({ orgId: input.orgId, principal: systemPrincipal('api:oauth-grants') }, async (tx) => {
    const [row] = await tx
      .update(oauthGrant)
      .set({ revokedAt: input.now, updatedAt: input.now })
      .where(and(eq(oauthGrant.id, input.id), isNull(oauthGrant.revokedAt)))
      .returning()
    return row ?? null
  })
  if (!grant) return false
  const referenceId = `grant:${grant.id}`
  await authDatabase()
    .delete(oauthConsent)
    .where(
      and(
        eq(oauthConsent.clientId, grant.clientId),
        eq(oauthConsent.userId, grant.accountId),
        eq(oauthConsent.referenceId, referenceId)
      )
    )
  await withTenant({ orgId: input.orgId, principal: input.principal }, (tx) =>
    recordAudit(tx, {
      action: 'mcp.consent_revoked',
      target: { type: 'oauth_grant', id: grant.id },
      projectId: grant.shareLinkId ? grant.projectIds?.[0] : undefined,
      after: { resource: grant.resource, scopes: grant.scopes }
    })
  )
  return true
}

export const oauthManagement = {
  listClients: listOAuthClients,
  createClient: createOAuthClient,
  deleteClient: deleteOAuthClient,
  listGrants: listOAuthGrants,
  revokeGrant: revokeOAuthGrant
}
