import { apiKey } from '@better-auth/api-key'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { passkey } from '@better-auth/passkey'
import { loadEnv } from '@skyclause/config'
import type { EmailTransport } from '@skyclause/contracts'
import { authDatabase } from '@skyclause/db/auth'
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous, bearer, deviceAuthorization, jwt, organization } from 'better-auth/plugins'
import { ac, roles } from './access'
import { PLUGINS } from './plugins'

/** What the instance needs from the web env (#79 §6). */
export interface AuthSettings {
  secret: string
  /** The issuer and the only cookie host (D37, #79 §4). */
  appOrigin: string
  apiOrigin: string
  mcpOrigin: string
  /** HMAC key for the IP side of auth rate limits (#100). */
  ipHashKey: string
}

/** Under HOST_MODE=single every surface shares APP_ORIGIN, so an unset API or MCP origin is APP_ORIGIN. */
export function authSettings(env: Record<string, string | undefined> = process.env): AuthSettings {
  const { BETTER_AUTH_SECRET: secret, APP_ORIGIN, API_ORIGIN, MCP_ORIGIN, IP_HASH_KEY: ipHashKey } = loadEnv('web', env)
  if (!APP_ORIGIN) throw new Error('APP_ORIGIN is not set: Better Auth needs it as its issuer and cookie host')
  const origin = (value: string | undefined) => new URL(value ?? APP_ORIGIN).origin
  return {
    secret,
    appOrigin: origin(APP_ORIGIN),
    apiOrigin: origin(API_ORIGIN),
    mcpOrigin: origin(MCP_ORIGIN),
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
            onboardingSkipped: { type: 'boolean', required: true, defaultValue: false, ...fixed },
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
    // #106 and #128 store scopes in `permissions.scopes`, the creator in `metadata.account_id` and a device key's
    // source in `metadata.source_id`. #93's `rateLimit` limits each credential, so the plugin's 10 a day is off.
    apiKey({ references: 'organization', defaultPrefix: 'skc_', enableMetadata: true, rateLimit: { enabled: false } }),
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
  const byId = new Map(owners.map((plugin) => [plugin.id, plugin]))
  const added = owners.filter((plugin) => !base.some(({ id }) => id === plugin.id))
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
  const owners = PLUGINS.map((owner) =>
    owner({ appOrigin: s.appOrigin, ipHashKey: s.ipHashKey, sendEmail: extra.sendStepUpEmail })
  )
  const plugins = withOwners(base, [...owners, ...(extra.plugins ?? [])])
  return betterAuth({
    secret: s.secret,
    baseURL: s.appOrigin,
    database: drizzleAdapter(authDatabase(), { provider: 'pg' }),
    // The database's uuidv7() default makes every ID (#79 conventions).
    advanced: { database: { generateId: 'uuid' } },
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        preferences: { type: 'json', required: false, ...fixed },
        magicLinkEnabled: { type: 'boolean', required: true, defaultValue: true, ...fixed },
        deletedAt: { type: 'date', required: false, ...fixed },
        lastActiveAt: { type: 'date', required: false, ...fixed }
      }
    },
    session: { additionalFields: { reauthenticatedAt: { type: 'date', required: false, ...fixed } } },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({ data: { ...session, reauthenticatedAt: session.createdAt } })
        }
      }
    },
    socialProviders: extra.socialProviders,
    plugins,
    disabledPaths: unbuiltPaths(base, plugins)
  })
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

/** Better Auth's own endpoints, `/api/auth/*` (#79 §4), for the web app's Route Handler. */
export const authHandler = (request: Request): Promise<Response> => getAuth().auth.handler(request)
