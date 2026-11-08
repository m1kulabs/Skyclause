import type { Role } from '@skyclause/contracts'

// Ticket #93 stores: Postgres implementations run through `withSystem` on the S tables `idempotency_key` and
// `rate_limit` (#92); in-memory ones exist only in tests.

export interface IdempotencyKey {
  /** The organisation ID, else the credential, else the IP hash. */
  scope: string
  /** `METHOD /template`, such as `POST /v1/projects/:id/windows`. */
  route: string
  key: string
}

export interface StoredResponse {
  status: number
  contentType: string | null
  location: string | null
  body: string
}

export interface IdempotencyRecord extends IdempotencyKey {
  requestHash: string
  expiresAt: Date
  /** Null while the first request is still running. */
  response: StoredResponse | null
}

export interface IdempotencyStore {
  /** Inserts a pending record unless an unexpired one holds the key, which it returns instead. */
  reserve(record: IdempotencyRecord, now: Date): Promise<IdempotencyRecord | null>
  complete(key: IdempotencyKey, response: StoredResponse): Promise<void>
  /** Frees a reserved key whose request didn't succeed, so a retry runs again. */
  release(key: IdempotencyKey): Promise<void>
}

export interface RateLimitStore {
  /** Counts one request in `bucket`'s fixed window and returns the count so far. */
  hit(q: { bucket: string; windowS: number; now: Date }): Promise<{ count: number; resetAt: Date }>
}

/** `requireOrg` reads `auth.organization` and `auth.member` through this (#93 ticket decision). */
export interface MembershipLookup {
  /** By slug or ID. */
  organisation(ref: string): Promise<{ id: string; slug: string } | null>
  role(accountId: string, orgId: string): Promise<Role | null>
}
