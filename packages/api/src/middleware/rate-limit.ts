import { createHmac } from 'node:crypto'
import type { Principal, RouteMetadata } from '@skyclause/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { ApiError } from '../problems'

// TRD "API conventions" and NFR-10: every key and token is rate limited, and public and guest routes per IP hash.
// Fixed one-minute windows; the numbers are code constants (spec §6).
export const RATE_LIMIT_WINDOW_S = 60
export const CREDENTIAL_LIMIT = 600
export const IP_LIMIT = 120

/** The credential a principal arrived with, as a bucket and idempotency scope; null for the in-process `system`. */
export function credentialOf(principal: Principal): string | null {
  switch (principal.kind) {
    case 'session':
      return `session:${principal.sessionId}`
    case 'api_key':
    case 'device':
      return `${principal.kind}:${principal.keyId}`
    case 'oauth':
      return `oauth:${principal.grantId}`
    case 'guest_token':
      return `guest_token:${principal.tokenId}`
    case 'share_link':
      return `share_link:${principal.linkId}`
    case 'system':
      return null
  }
}

/**
 * HMAC-SHA-256 of the client IP under IP_HASH_KEY; the raw address is never stored. Cloud Run's front end appends
 * the client's address to `X-Forwarded-For`, so the rightmost entry is the one a client can't forge.
 */
export function ipHash(c: Context<ApiEnv>): string {
  const key = c.get('deps').config().ipHashKey
  if (!key) throw new Error('IP_HASH_KEY is not set')
  const ip = c.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim() || 'unknown'
  return createHmac('sha256', key).update(ip).digest('hex')
}

const IP_STATEMENTS = new Set<RouteMetadata['statement']>(['public', 'guest', 'token'])

/** 429 `rate-limited` with `Retry-After` in seconds once a bucket passes its limit in the current window. */
export const rateLimit: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const { rateLimits, now } = c.get('deps')
  const principal = c.get('principal')
  const credential = principal && credentialOf(principal)
  const buckets: Array<[string, number]> = credential ? [[credential, CREDENTIAL_LIMIT]] : []
  if (!principal || IP_STATEMENTS.has(c.get('operation')['x-skyclause'].statement)) {
    buckets.push([`ip:${ipHash(c)}`, IP_LIMIT])
  }
  for (const [bucket, limit] of buckets) {
    const at = now()
    const { count, resetAt } = await rateLimits.hit({ bucket, windowS: RATE_LIMIT_WINDOW_S, now: at })
    if (count > limit) {
      const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - at.getTime()) / 1000))
      throw new ApiError(
        429,
        'rate-limited',
        `Too many requests; retry in ${retryAfter} seconds.`,
        {},
        {
          'Retry-After': String(retryAfter)
        }
      )
    }
  }
  await next()
}
