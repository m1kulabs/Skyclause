import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { idempotencyKey, rateLimit } from '../schema'

// f-api's store queries (#79 conventions: only packages/db holds SQL), run by packages/api inside `withSystem`.

export interface IdempotencyKeyId {
  scope: string
  route: string
  key: string
}

export interface IdempotencyResponse {
  status: number
  contentType: string | null
  location: string | null
  body: string
}

export interface IdempotencyHolder {
  requestHash: string
  expiresAt: Date
  /** Null while the first request still runs. */
  response: IdempotencyResponse | null
}

/** A key as the request that reserved it holds it: a request that took over after expiry has another hash. */
export type IdempotencyClaim = IdempotencyKeyId & { requestHash: string }

const keyed = (id: IdempotencyKeyId) =>
  and(eq(idempotencyKey.scope, id.scope), eq(idempotencyKey.route, id.route), eq(idempotencyKey.key, id.key))
/** This request's own row, still pending. */
const claimed = (claim: IdempotencyClaim) =>
  and(keyed(claim), eq(idempotencyKey.requestHash, claim.requestHash), isNull(idempotencyKey.status))

/**
 * Reserves `id` for a new request, taking over an expired holder's row, and returns null; or returns the unexpired
 * holder. A holder released between the two statements is gone, so the reservation is tried again.
 */
export async function reserveIdempotencyKey(
  tx: Tx<SystemPrincipal>,
  record: IdempotencyClaim & { expiresAt: Date },
  now: Date
): Promise<IdempotencyHolder | null> {
  const pending = { requestHash: record.requestHash, expiresAt: record.expiresAt, status: null, contentType: null }
  for (;;) {
    const [reserved] = await tx
      .insert(idempotencyKey)
      .values({ ...record, ...pending })
      .onConflictDoUpdate({
        target: [idempotencyKey.scope, idempotencyKey.route, idempotencyKey.key],
        set: { ...pending, location: null, body: null, createdAt: now },
        setWhere: lte(idempotencyKey.expiresAt, now)
      })
      .returning({ id: idempotencyKey.id })
    if (reserved) return null
    const [held] = await tx.select().from(idempotencyKey).where(keyed(record))
    if (held) {
      const { requestHash, expiresAt, status, contentType, location, body } = held
      return {
        requestHash,
        expiresAt,
        response: status === null ? null : { status, contentType, location, body: body ?? '' }
      }
    }
  }
}

/** Stores the response a repeat replays, on the row this request reserved, kept until `expiresAt`. */
export async function completeIdempotencyKey(
  tx: Tx<SystemPrincipal>,
  claim: IdempotencyClaim,
  response: IdempotencyResponse,
  expiresAt: Date
) {
  await tx
    .update(idempotencyKey)
    .set({ ...response, expiresAt })
    .where(claimed(claim))
}

/** Frees the row this request reserved, so a retry runs again; a row another request took over stays. */
export async function releaseIdempotencyKey(tx: Tx<SystemPrincipal>, claim: IdempotencyClaim) {
  await tx.delete(idempotencyKey).where(claimed(claim))
}

/** Counts one request in `bucket`'s fixed window, opening a new window once the last one has ended. */
export async function hitRateLimit(
  tx: Tx<SystemPrincipal>,
  q: { bucket: string; windowS: number; now: Date }
): Promise<{ count: number; resetAt: Date }> {
  const ended = sql`${rateLimit.resetAt} <= ${q.now}`
  const [row] = await tx
    .insert(rateLimit)
    .values({ bucket: q.bucket, count: 1, resetAt: new Date(q.now.getTime() + q.windowS * 1000) })
    .onConflictDoUpdate({
      target: rateLimit.bucket,
      set: {
        count: sql`CASE WHEN ${ended} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        resetAt: sql`CASE WHEN ${ended} THEN excluded.reset_at ELSE ${rateLimit.resetAt} END`
      }
    })
    .returning({ count: rateLimit.count, resetAt: rateLimit.resetAt })
  return row!
}
