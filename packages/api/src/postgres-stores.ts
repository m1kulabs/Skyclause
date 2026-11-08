import { ROLES, type Role } from '@skyclause/contracts'
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
  complete: (claim, response) => withSystem('api:idempotency', (tx) => completeIdempotencyKey(tx, claim, response)),
  release: (claim) => withSystem('api:idempotency', (tx) => releaseIdempotencyKey(tx, claim))
}

export const postgresRateLimits: RateLimitStore = {
  hit: (q) => withSystem('api:rate-limit', (tx) => hitRateLimit(tx, q))
}

const isRole = (role: string | null): role is Role => (ROLES as readonly (string | null)[]).includes(role)

export const postgresMembership: MembershipLookup = {
  async lookup(ref, accountId) {
    const found = await withSystem('api:membership', (tx) => findMembership(tx, ref, accountId))
    // A role outside §1's set (Better Auth's default `member`, say) grants nothing.
    return found && { id: found.id, slug: found.slug, role: isRole(found.role) ? found.role : null }
  }
}
