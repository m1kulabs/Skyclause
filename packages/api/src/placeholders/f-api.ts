import { notBuilt } from '@skyclause/contracts'
import type { IdempotencyStore, MembershipLookup, RateLimitStore } from '../stores'

// The production stores and membership lookup run on Postgres: `idempotency_key` and `rate_limit` land with #92,
// `auth.member` with #91. f-api replaces these once both merge.
export const membership: MembershipLookup = notBuilt('f-api')
export const idempotencyStore: IdempotencyStore = notBuilt('f-api')
export const rateLimitStore: RateLimitStore = notBuilt('f-api')
