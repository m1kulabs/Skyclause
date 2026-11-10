import { createHmac } from 'node:crypto'
import { mcp } from '@better-auth/mcp'
import {
  hitRateLimit,
  member,
  oauthClient,
  oauthClientResource,
  oauthGrant,
  oauthOrgClient,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { authDatabase, credentialOwner } from '@skyclause/db/auth'
import { and, eq, isNull } from 'drizzle-orm'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'
import type { AuthSettings } from '../instance'
import { resources } from '../instance'

const PLAYGROUND_CLIENT = 'skyclause-playground'
const PLAYGROUND_REDIRECT = '/developers/mcp/callback'
const REGISTRATION_WINDOW_S = 60 * 60

function readResource(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value)
}

function resourceKind(value: string, allowed: { api: string; mcp: string }): 'api' | 'mcp' | null {
  if (value === allowed.api) return 'api'
  if (value === allowed.mcp) return 'mcp'
  return null
}

function registrationIp(headers: Headers) {
  return headers.get('cf-connecting-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function activeOrganization(session: Record<string, unknown> | undefined) {
  return typeof session?.activeOrganizationId === 'string' ? session.activeOrganizationId : undefined
}

async function seedPlaygroundClient(s: AuthSettings) {
  const db = authDatabase()
  const resource = resources(s).mcp
  const [existing] = await db
    .select({ clientId: oauthClient.clientId })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, PLAYGROUND_CLIENT))
    .limit(1)
  if (!existing) {
    const now = new Date()
    await db
      .insert(oauthClient)
      .values({
        clientId: PLAYGROUND_CLIENT,
        clientSecret: null,
        disabled: false,
        skipConsent: false,
        scopes: ['read', 'draft'],
        userId: null,
        createdAt: now,
        updatedAt: now,
        name: 'Skyclause Playground',
        redirectUris: [`${s.appOrigin}${PLAYGROUND_REDIRECT}`],
        tokenEndpointAuthMethod: 'none',
        applicationType: 'web',
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        requirePKCE: true,
        referenceId: null
      })
      .onConflictDoNothing({ target: oauthClient.clientId })
  }
  const [linked] = await db
    .select({ id: oauthClientResource.id })
    .from(oauthClientResource)
    .where(and(eq(oauthClientResource.clientId, PLAYGROUND_CLIENT), eq(oauthClientResource.resourceId, resource)))
    .limit(1)
  if (!linked) {
    await db
      .insert(oauthClientResource)
      .values({ clientId: PLAYGROUND_CLIENT, resourceId: resource, createdAt: new Date() })
      .onConflictDoNothing()
  }
}

/** #198 owner for Better Auth's MCP OAuth provider, DCR policy and grant_id claim. */
export function eMcpAuth(s: AuthSettings): BetterAuthPlugin {
  const r = resources(s)
  const allowedResources = [r.api, r.mcp]
  const provider = mcp({
    resource: r.mcp,
    resources: [r.api],
    scopes: ['read', 'draft'],
    clientRegistrationDefaultScopes: ['read', 'draft'],
    clientRegistrationAllowedScopes: ['read', 'draft'],
    clientRegistrationDefaultResources: [r.mcp],
    clientRegistrationAllowedResources: allowedResources,
    enforcePerClientResources: true,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationRequirePKCE: true,
    clientRegistrationDefaultApplicationType: 'web',
    clientReference: ({ session }) => activeOrganization(session),
    clientPrivileges: async ({ action, session, user }) => {
      const orgId = activeOrganization(session)
      if (action !== 'create' || !orgId || !user) return false
      const [membership] = await authDatabase()
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, orgId), eq(member.userId, user.id)))
        .limit(1)
      return membership?.role === 'owner' || membership?.role === 'admin'
    },
    allowPublicClientPrelogin: true,
    loginPage: '/sign-in',
    consentPage: '/oauth/consent',
    postLogin: {
      page: '/oauth/consent',
      consentReferenceId: ({ session }) => activeOrganization(session),
      shouldRedirect: () => false
    },
    extensions: [
      {
        claims: {
          accessToken: async ({ client, user, referenceId, resources: requestedResources, scopes }) => {
            if (!user || !referenceId || !requestedResources || requestedResources.length !== 1) {
              throw new APIError('UNAUTHORIZED', {
                error: 'invalid_grant',
                error_description: 'No active consent grant.'
              })
            }
            const [resourceUri] = requestedResources
            const resource = resourceUri ? resourceKind(resourceUri, r) : null
            if (!resource) {
              throw new APIError('BAD_REQUEST', {
                error: 'invalid_target',
                error_description: 'The resource is not supported.'
              })
            }
            if (!referenceId.startsWith('grant:')) throw new APIError('UNAUTHORIZED', { error: 'invalid_grant' })
            const grantId = referenceId.slice('grant:'.length)
            const owner = await credentialOwner('oauth_grant', grantId)
            if (!owner) throw new APIError('UNAUTHORIZED', { error: 'invalid_grant' })
            const [grant] = await withTenant(
              { orgId: owner.orgId, principal: systemPrincipal('auth:oauth-token') },
              async (tx) => tx.select().from(oauthGrant).where(eq(oauthGrant.id, grantId)).limit(1)
            )
            if (
              !grant ||
              grant.accountId !== user.id ||
              grant.clientId !== client.clientId ||
              grant.resource !== resource ||
              grant.revokedAt ||
              scopes.some((scope) => !grant.scopes.includes(scope))
            ) {
              throw new APIError('UNAUTHORIZED', {
                error: 'invalid_grant',
                error_description: 'The consent grant is no longer active.'
              })
            }
            if (client.referenceId) {
              const [organisationClient] = await withTenant(
                { orgId: client.referenceId, principal: systemPrincipal('auth:oauth-token') },
                (tx) =>
                  tx
                    .select()
                    .from(oauthOrgClient)
                    .where(and(eq(oauthOrgClient.clientId, client.clientId), isNull(oauthOrgClient.revokedAt)))
                    .limit(1)
              )
              if (!organisationClient || client.referenceId !== grant.orgId) {
                throw new APIError('UNAUTHORIZED', {
                  error: 'invalid_grant',
                  error_description: 'The client is locked to another organisation.'
                })
              }
            }
            return { grant_id: grant.id }
          }
        }
      }
    ]
  })
  const originalInit = provider.init

  return {
    ...provider,
    init: async (ctx) => {
      const initialized = await originalInit?.(ctx)
      await seedPlaygroundClient(s)
      return initialized
    },
    hooks: {
      ...provider.hooks,
      before: [
        ...provider.hooks.before,
        {
          matcher: ({ path }) =>
            ['/oauth2/authorize', '/oauth2/consent', '/oauth2/token', '/oauth2/register'].includes(path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const request = ctx.request
            if (!request) return
            const requestPath = new URL(request.url).pathname
            if (requestPath.endsWith('/oauth2/consent')) {
              const session = await getSessionFromCtx<{ isAnonymous?: boolean }>(ctx)
              if (session?.user.isAnonymous) {
                throw new APIError('FORBIDDEN', {
                  error: 'access_denied',
                  error_description: 'Sign up before granting OAuth consent.'
                })
              }
              return
            }
            if (requestPath.endsWith('/oauth2/register')) {
              const body = ctx.body as { token_endpoint_auth_method?: unknown; require_pkce?: unknown } | undefined
              if (body?.token_endpoint_auth_method !== 'none' || body.require_pkce === false) {
                throw new APIError('BAD_REQUEST', {
                  error: 'invalid_client_metadata',
                  error_description: 'Only public clients with PKCE are accepted.'
                })
              }
              const key = process.env.IP_HASH_KEY
              if (!key) throw new Error('IP_HASH_KEY is required for OAuth client registration limits')
              const ipHash = createHmac('sha256', key).update(registrationIp(request.headers)).digest('hex')
              const { count } = await withSystem('oauth:registration-rate-limit', (tx) =>
                hitRateLimit(tx, {
                  bucket: `oauth-registration:${ipHash}`,
                  windowS: REGISTRATION_WINDOW_S,
                  now: new Date()
                })
              )
              if (count > 10) throw new APIError('TOO_MANY_REQUESTS', { error: 'too_many_requests' })
              return
            }

            if (requestPath.endsWith('/oauth2/authorize')) {
              const query = new URL(request.url).searchParams
              const targets = query.getAll('resource')
              if (targets.length !== 1 || !readResource(targets[0], allowedResources)) {
                throw new APIError('BAD_REQUEST', {
                  error: 'invalid_target',
                  error_description: 'Exactly one supported resource is required.'
                })
              }
              if (query.get('code_challenge_method') !== 'S256' || !query.get('code_challenge')) {
                throw new APIError('BAD_REQUEST', {
                  error: 'invalid_request',
                  error_description: 'PKCE S256 is required.'
                })
              }
              return
            }

            if (requestPath.endsWith('/oauth2/token')) {
              const body = ctx.body as { resource?: unknown } | undefined
              const targets = Array.isArray(body?.resource) ? body.resource : [body?.resource]
              if (targets.length !== 1 || !readResource(targets[0], allowedResources)) {
                throw new APIError('BAD_REQUEST', {
                  error: 'invalid_target',
                  error_description: 'Exactly one supported resource is required.'
                })
              }
            }
          })
        }
      ]
    }
  }
}
