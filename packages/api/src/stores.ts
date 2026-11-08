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
  /** Null while the first request is still running, whose reservation expires sooner (the pending lease). */
  response: StoredResponse | null
}

/** A key as the request that reserved it holds it; another request that took over an expired key has another hash. */
export type IdempotencyClaim = IdempotencyKey & { requestHash: string }

export interface IdempotencyStore {
  /** Inserts a pending record unless an unexpired one holds the key, which it returns instead. */
  reserve(record: IdempotencyRecord, now: Date): Promise<IdempotencyRecord | null>
  /** Stores the response on the pending key this request reserved, kept until `expiresAt`. */
  complete(claim: IdempotencyClaim, response: StoredResponse, expiresAt: Date): Promise<void>
  /** Frees the pending key this request reserved, so a retry runs again; a completed key stays. */
  release(claim: IdempotencyClaim): Promise<void>
}

export interface RateLimitStore {
  /** Counts one request in `bucket`'s fixed window and returns the count so far. */
  hit(q: { bucket: string; windowS: number; now: Date }): Promise<{ count: number; resetAt: Date }>
}

/** `requireOrg` reads `auth.organization` and `auth.member` through this (#93 ticket decision). */
export interface MembershipLookup {
  /**
   * The organisation named by slug or ID, with `accountId`'s role in it: null when the account isn't a member or no
   * account is given. Null for an unknown organisation.
   */
  lookup(ref: string, accountId: string | null): Promise<{ id: string; slug: string; role: Role | null } | null>
}
