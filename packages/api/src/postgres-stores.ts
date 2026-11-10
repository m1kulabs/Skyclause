import {
  completeIdempotencyKey,
  findMembership,
  hitRateLimit,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
  withSystem
} from '@skyclause/db'
import type { IdempotencyStore, MembershipLookup, RateLimitStore } from './stores'

// The production stores (#93 ticket decision): S tables through `withSystem`, and `auth.member` read as `system`.

export const postgresIdempotency: IdempotencyStore = {
  async reserve({ scope, route, key, requestHash, expiresAt }, now) {
    const held = await withSystem('api:idempotency', (tx) =>
      reserveIdempotencyKey(tx, { scope, route, key, requestHash, expiresAt }, now)
    )
    return held && { scope, route, key, ...held }
  },
  complete: (claim, response, expiresAt) =>
    withSystem('api:idempotency', (tx) => completeIdempotencyKey(tx, claim, response, expiresAt)),
  release: (claim) => withSystem('api:idempotency', (tx) => releaseIdempotencyKey(tx, claim))
}

export const postgresRateLimits: RateLimitStore = {
  hit: (q) => withSystem('api:rate-limit', (tx) => hitRateLimit(tx, q))
}

export const postgresMembership: MembershipLookup = {
  lookup: (ref, accountId) => withSystem('api:membership', (tx) => findMembership(tx, ref, accountId))
}
