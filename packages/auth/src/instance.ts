import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { passkey } from '@better-auth/passkey'
import { loadEnv } from '@skyclause/config'
import type { EmailTransport } from '@skyclause/contracts'
import { authDatabase, withAccountSecurityLock } from '@skyclause/db/auth'
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous, bearer, deviceAuthorization, jwt, organization } from 'better-auth/plugins'
import { ac, roles } from './access'
import { apiKeyPlugin } from './plugins/a-api-keys'
import { authSignInHandler } from './plugins/a-auth-signin-api'
import { PLUGINS } from './plugins'

/** What the instance needs from the web env (#79 §6). */
export interface AuthSettings {
  secret: string
  /** The issuer and the only cookie host (D37, #79 §4). */
  appOrigin: string
  apiOrigin: string
  mcpOrigin: string
  google?: { clientId: string; clientSecret: string }
  /** HMAC key for the IP side of auth rate limits (#100). */
  ipHashKey: string
}

/** Under HOST_MODE=single every surface shares APP_ORIGIN, so an unset API or MCP origin is APP_ORIGIN. */
export function authSettings(env: Record<string, string | undefined> = process.env): AuthSettings {
  const {
    BETTER_AUTH_SECRET: secret,
    APP_ORIGIN,
    API_ORIGIN,
    MCP_ORIGIN,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    IP_HASH_KEY: ipHashKey
  } = loadEnv('web', env)
  if (!APP_ORIGIN) throw new Error('APP_ORIGIN is not set: Better Auth needs it as its issuer and cookie host')
  const origin = (value: string | undefined) => new URL(value ?? APP_ORIGIN).origin
  return {
    secret,
    appOrigin: origin(APP_ORIGIN),
    apiOrigin: origin(API_ORIGIN),
    mcpOrigin: origin(MCP_ORIGIN),
    ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } }
      : {}),
    ipHashKey
  }
}

/** The OAuth resources (D37): an access token is audience-bound to one. */
export const resources = (s: AuthSettings) => ({ api: `${s.apiOrigin}/v1`, mcp: `${s.mcpOrigin}/mcp` })

// Columns #79 §3 adds to Better Auth's tables, as packages/db/scripts/auth.config.ts declares them for generation.
// None is client input: the routes that own them write them.
const fixed = { input: false } as const

function basePlugins(s: AuthSettings) {
  return [
    organization({
      ac,
      roles,
      // ORG-2: 7 days, not the plugin's 48 hours.
      invitationExpiresIn: 7 * 24 * 60 * 60,
      schema: {
        organization: {
          additionalFields: {
            plan: {
              type: ['community', 'team', 'campus', 'commons'],
              required: true,
              defaultValue: 'community',
              ...fixed
            },
            deletionRequestedAt: { type: 'date', required: false, ...fixed },
            purgeAfter: { type: 'date', required: false, ...fixed },
            onboardingSkipped: { type: 'json', required: true, defaultValue: [], ...fixed },
            aiFallbackEnabled: { type: 'boolean', required: true, defaultValue: false, ...fixed },
            allowMemberAiKeys: { type: 'boolean', required: true, defaultValue: false, ...fixed }
          }
        },
        member: {
          additionalFields: { readsMalay: { type: 'boolean', required: true, defaultValue: false, ...fixed } }
        },
        invitation: { additionalFields: { tokenHash: { type: 'string', required: false, ...fixed } } }
      }
    }),
    anonymous(),
    // #106 replaces the plugin #94 registered here, keeping Better Auth's auth-table generation order stable.
    apiKeyPlugin,
    passkey(),
    deviceAuthorization(),
    bearer(),
    // @better-auth/mcp requires jwt: it signs the access tokens; D37 makes APP_ORIGIN the issuer.
    jwt({ disableSettingJwtHeader: true, jwt: { issuer: s.appOrigin } }),
    // The options the plugin requires; #198 configures consent and clients.
    mcp({ loginPage: '/sign-in', consentPage: '/oauth/consent', resource: resources(s).mcp }),
    cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' })
  ]
}

/** #79 §7: an owner's plugin replaces the base plugin with its `id` in place, or is appended. */
function withOwners<T extends BetterAuthPlugin[]>(base: T, owners: readonly BetterAuthPlugin[]): T {
  const byId = new Map<string, BetterAuthPlugin>()
  for (const plugin of owners) byId.set(plugin.id, plugin)
  const added = [...byId.values()].filter((plugin) => !base.some(({ id }) => id === plugin.id))
  return [...base.map((plugin) => byId.get(plugin.id) ?? plugin), ...added] as T
}

/**
 * The HTTP paths of the base plugins no owner has replaced. They stay off under /api/auth/* (`disabledPaths`, which
 * `auth.api` ignores): at Better Auth's defaults they would let anyone sign in anonymously past the bot check, create
 * an organisation past the reserved slugs, write an API key's metadata, or register an OAuth client. Each flow's
 * owner turns its endpoints on by replacing the plugin (plugins/index.ts).
 */
function unbuiltPaths(base: readonly BetterAuthPlugin[], plugins: readonly BetterAuthPlugin[]): string[] {
  return plugins
    .filter((plugin) => base.includes(plugin))
    .flatMap((plugin) => Object.values(plugin.endpoints ?? {}))
    .filter((endpoint) => endpoint.path && !endpoint.options?.metadata?.SERVER_ONLY)
    .map((endpoint) => endpoint.path)
}

/** The API-key plugin is available to `auth.api`, but its less restrictive HTTP manager stays off. */
function apiKeyHttpPaths(plugins: readonly BetterAuthPlugin[]): string[] {
  return plugins
    .filter(({ id }) => id === 'api-key')
    .flatMap((plugin) => Object.values(plugin.endpoints ?? {}))
    .filter((endpoint) => endpoint.path && !endpoint.options?.metadata?.SERVER_ONLY)
    .map((endpoint) => endpoint.path)
}

/**
 * Better Auth on `auth_app` over the `auth` schema, with #91's plugin set; tests pass extra plugins and providers.
 * @internal Its inferred type is too large for tsc to emit, so declarations leave it out (`stripInternal`).
 */
export function createAuth(
  s: AuthSettings,
  extra: {
    plugins?: BetterAuthPlugin[]
    socialProviders?: BetterAuthOptions['socialProviders']
    sendStepUpEmail?: EmailTransport['send']
  } = {}
) {
  const base = basePlugins(s)
  const owners = PLUGINS(s, { sendStepUpEmail: extra.sendStepUpEmail })
  const plugins = withOwners(base, [...owners, ...(extra.plugins ?? [])])
  const auth = betterAuth({
    secret: s.secret,
    baseURL: s.appOrigin,
    database: drizzleAdapter(authDatabase(), { provider: 'pg' }),
    // The database's uuidv7() default makes every ID (#79 conventions).
    advanced: { database: { generateId: 'uuid' } },
    emailAndPassword: { enabled: false },
    // #97 has an atomic email + rightmost Cloud Run IP window in auth.verification; do not apply Better Auth's
    // per-path IP bucket here, which otherwise falls back to one shared bucket for Cloud Run's X-Forwarded-For chain.
    rateLimit: { customRules: { '/sign-in/magic-link': false } },
    account: { accountLinking: { disableImplicitLinking: true, allowUnlinkingAll: true } },
    user: {
      additionalFields: {
        preferences: { type: 'json', required: false, ...fixed },
        magicLinkEnabled: { type: 'boolean', required: true, defaultValue: true, ...fixed },
        deletedAt: { type: 'date', required: false, ...fixed },
        lastActiveAt: { type: 'date', required: false, ...fixed }
      }
    },
    session: {
      freshAge: 0,
      additionalFields: { reauthenticatedAt: { type: 'date', required: false, ...fixed } }
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({ data: { ...session, reauthenticatedAt: session.createdAt } })
        }
      }
    },
    socialProviders: extra.socialProviders ?? (s.google ? { google: s.google } : undefined),
    plugins,
    // The email's GET-safe page POSTs to our wrapper. The plugin's GET verification endpoint stays off over HTTP.
    disabledPaths: [...unbuiltPaths(base, plugins), ...apiKeyHttpPaths(plugins), '/magic-link/verify']
  })
  // A before hook alone cannot hold the last-method check through Better Auth's subsequent deletion.
  const handle = auth.handler
  auth.handler = async (request) => {
    const path = new URL(request.url).pathname.replace(/\/+$/, '')
    if (request.method !== 'POST' || !['/api/auth/unlink-account', '/api/auth/passkey/delete-passkey'].includes(path)) {
      return handle(request)
    }
    const current = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } })
    if (!current) return handle(request)
    return withAccountSecurityLock(current.user.id, () => handle(request))
  }
  return auth
}

/** @internal */
export type Auth = ReturnType<typeof createAuth>

let instance: { auth: Auth; settings: AuthSettings } | undefined

/**
 * The app's instance, built from the web env on first use, never at import (a build loads this module).
 * @internal
 */
export function getAuth() {
  if (!instance) {
    const settings = authSettings()
    instance = { auth: createAuth(settings), settings }
  }
  return instance
}

export interface RequestAuthSession {
  session: { id: string; createdAt: Date; reauthenticatedAt?: Date | null }
  user: {
    id: string
    name: string
    email: string
    preferences?: unknown
    magicLinkEnabled?: boolean
  }
}

/** The session fields server-rendered app roots need, without exposing Better Auth's inferred instance type. */
export async function getSessionForRequest(headers: Headers): Promise<RequestAuthSession | null> {
  const result: unknown = await getAuth().auth.api.getSession({ headers, query: { disableRefresh: true } })
  if (typeof result !== 'object' || result === null || !('session' in result) || !('user' in result)) return null
  return result as RequestAuthSession
}

/** Better Auth's own endpoints, `/api/auth/*` (#79 §4), for the web app's Route Handler. */
export const authHandler = (request: Request): Promise<Response> => {
  const { auth, settings } = getAuth()
  return authSignInHandler(auth, request, settings)
}
