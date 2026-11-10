import { createHash, createHmac } from 'node:crypto'
import { log, loadEnv } from '@skyclause/config'
import { track, withSystem, hitRateLimit, deviceCode, verification, session } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { deviceAuthorization } from 'better-auth/plugins'
import { and, eq, gt } from 'drizzle-orm'
import type { BetterAuthPlugin } from 'better-auth'

const CLIENT_ID = 'skyclause-cli'
const USER_CODE_PREFIX = 'device-user-code:'
const DEVICE_CODE_PREFIX = 'device-code:'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const normalizeUserCode = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

function userAgent(ctx: { request?: Request; headers?: Headers }) {
  return ctx.request?.headers.get('User-Agent') ?? ctx.headers?.get('User-Agent') ?? ''
}

function ipHash(headers: Headers | undefined) {
  const key = loadEnv('web').IP_HASH_KEY
  const ip = headers?.get('X-Forwarded-For')?.split(',').at(-1)?.trim() || 'unknown'
  return createHmac('sha256', key).update(ip).digest('hex')
}

async function keepVerification(identifier: string, value: string, expiresAt: Date) {
  const db = authDatabase()
  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({ identifier, value, expiresAt })
}

async function findVerification(identifier: string) {
  const [row] = await authDatabase()
    .select({ value: verification.value })
    .from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
    .limit(1)
  return row?.value
}

function parsedCliLogin(value: string) {
  const os = /^skyclause-cli\/[^\s()]+ \((darwin|macos|linux|win32|windows); [^()]+\)$/i.exec(value)?.[1]?.toLowerCase()
  return os === 'darwin' || os === 'macos'
    ? 'macos'
    : os === 'win32' || os === 'windows'
      ? 'windows'
      : os === 'linux'
        ? 'linux'
        : 'unknown'
}

function successResult(ctx: { context: { returned?: unknown } }) {
  return !!ctx.context.returned && !(ctx.context.returned instanceof APIError)
}

/** #101: the sole CLI device authorization client, with hashed IP limits and short-lived request metadata. */
export function aDeviceCode(): BetterAuthPlugin {
  const base = deviceAuthorization({
    expiresIn: '10m',
    interval: '5s',
    validateClient: (clientId) => clientId === CLIENT_ID,
    verificationUri: '/device'
  })

  return {
    ...base,
    hooks: {
      before: [
        {
          matcher: ({ method, path }) => method === 'POST' && path === '/device/code',
          handler: createAuthMiddleware(async (ctx) => {
            const { count } = await withSystem('auth:device-code-rate-limit', (tx) =>
              hitRateLimit(tx, {
                bucket: `device-code:${ipHash(ctx.request?.headers ?? ctx.headers)}`,
                windowS: 3600,
                now: new Date()
              })
            )
            if (count > 10) {
              throw new APIError('TOO_MANY_REQUESTS', {
                error: 'invalid_request',
                error_description: 'Too many device authorization requests. Try again later.'
              })
            }
          })
        }
      ],
      after: [
        {
          matcher: ({ method, path }) => method === 'POST' && path === '/device/code',
          handler: createAuthMiddleware(async (ctx) => {
            if (!successResult(ctx)) return
            const returned = ctx.context.returned as { user_code?: unknown }
            if (typeof returned.user_code !== 'string') return
            const [record] = await authDatabase()
              .select({ expiresAt: deviceCode.expiresAt })
              .from(deviceCode)
              .where(eq(deviceCode.userCode, returned.user_code))
              .limit(1)
            if (!record) return
            await keepVerification(`${USER_CODE_PREFIX}${returned.user_code}`, userAgent(ctx), record.expiresAt)
          })
        },
        {
          matcher: ({ method, path }) => method === 'POST' && path === '/device/approve',
          handler: createAuthMiddleware(async (ctx) => {
            if (!successResult(ctx)) return
            const body = ctx.body as { userCode?: unknown } | undefined
            if (typeof body?.userCode !== 'string') return
            const [record] = await authDatabase()
              .select({
                deviceCode: deviceCode.deviceCode,
                userCode: deviceCode.userCode,
                expiresAt: deviceCode.expiresAt
              })
              .from(deviceCode)
              .where(eq(deviceCode.userCode, normalizeUserCode(body.userCode)))
              .limit(1)
            if (!record) return
            const confirming = ctx.context.session as
              { session?: { createdAt?: Date; reauthenticatedAt?: Date | null } } | undefined
            const authenticatedAt = confirming?.session?.reauthenticatedAt ?? confirming?.session?.createdAt
            if (!authenticatedAt) return
            const originalUserAgent = (await findVerification(`${USER_CODE_PREFIX}${record.userCode}`)) ?? ''
            await keepVerification(
              `${DEVICE_CODE_PREFIX}${hash(record.deviceCode)}`,
              JSON.stringify({
                userAgent: originalUserAgent,
                userCode: record.userCode,
                authenticatedAt: new Date(authenticatedAt).toISOString()
              }),
              record.expiresAt
            )
          })
        },
        {
          matcher: ({ method, path }) => method === 'POST' && path === '/device/deny',
          handler: createAuthMiddleware(async (ctx) => {
            if (!successResult(ctx)) return
            const body = ctx.body as { userCode?: unknown } | undefined
            if (typeof body?.userCode !== 'string') return
            const userCode = normalizeUserCode(body.userCode)
            const [record] = await authDatabase()
              .select({ expiresAt: deviceCode.expiresAt })
              .from(deviceCode)
              .where(eq(deviceCode.userCode, userCode))
              .limit(1)
            if (!record) return
            const agent = (await findVerification(`${USER_CODE_PREFIX}${userCode}`)) ?? ''
            await keepVerification(
              `${USER_CODE_PREFIX}${userCode}`,
              JSON.stringify({ userAgent: agent, status: 'denied' }),
              record.expiresAt
            )
          })
        },
        {
          matcher: ({ method, path }) => method === 'POST' && path === '/device/token',
          handler: createAuthMiddleware(async (ctx) => {
            if (!successResult(ctx)) return
            const issued = ctx.context.newSession as { session?: { id?: string } } | undefined
            const body = ctx.body as { device_code?: unknown } | undefined
            if (!issued?.session?.id || typeof body?.device_code !== 'string') return
            const identifier = `${DEVICE_CODE_PREFIX}${hash(body.device_code)}`
            const metadata = await findVerification(identifier)
            if (!metadata) return
            try {
              const value = JSON.parse(metadata) as { userAgent?: string; userCode?: string; authenticatedAt?: string }
              const authenticatedAt = value.authenticatedAt ? new Date(value.authenticatedAt) : undefined
              if (authenticatedAt && Number.isFinite(authenticatedAt.getTime())) {
                await authDatabase()
                  .update(session)
                  .set({ reauthenticatedAt: authenticatedAt })
                  .where(eq(session.id, issued.session.id))
              }
              await withSystem('auth:device-code-login', (tx) =>
                track(tx, 'cli_login', { os: parsedCliLogin(value.userAgent ?? '') })
              )
              await authDatabase().delete(verification).where(eq(verification.identifier, identifier))
              if (value.userCode)
                await authDatabase()
                  .update(verification)
                  .set({ value: JSON.stringify({ userAgent: value.userAgent ?? '', status: 'done' }) })
                  .where(eq(verification.identifier, `${USER_CODE_PREFIX}${value.userCode}`))
            } catch (error) {
              log.error('device login metadata could not be completed', { error: String(error) })
            }
          })
        }
      ]
    }
  }
}
