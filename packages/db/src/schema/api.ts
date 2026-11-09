import { index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { id, instant } from './columns'

// f-api's stores (#79 §3, S: `system` writes them through `withSystem`, `retention` sweeps them, #112). Neither has an
// `org_id`: a key's scope is its organisation, or else its credential or IP hash, so neither is a tenant table.

/**
 * TRD "API conventions": an `Idempotency-Key` with its scope, route and request hash, kept 24 hours. `status` is null
 * while the first request runs; then it holds the 2xx or 3xx response a repeat replays.
 */
export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    id: id(),
    scope: text('scope').notNull(),
    route: text('route').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: integer('status'),
    contentType: text('content_type'),
    location: text('location'),
    body: text('body'),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    unique('idempotency_key_scope_route_key_key').on(self.scope, self.route, self.key),
    index('idempotency_key_expires_at_idx').on(self.expiresAt)
  ]
)

/** One fixed rate-limit window per bucket: a credential, or `ip:` and the HMAC of an address (never the address). */
export const rateLimit = pgTable(
  'rate_limit',
  {
    bucket: text('bucket').primaryKey(),
    count: integer('count').notNull(),
    resetAt: instant('reset_at').notNull()
  },
  (self) => [index('rate_limit_reset_at_idx').on(self.resetAt)]
)
