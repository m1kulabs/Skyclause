import { createHash, createHmac, randomBytes } from 'node:crypto'
import type {
  EmailHash,
  IssueSubscriberToken,
  SubscriberTokenPurpose,
  VerifySubscriberToken
} from '@skyclause/contracts'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { systemPrincipal, withSystem, withTenant, type Tx } from '../client'
import { subscribeLink, subscriber, subscriberToken } from '../schema'

// #157 (c-subscribers), #79 §1: subscriber link tokens and the address hash. TRD "Guests, share links and bot checks":
// 32 random bytes, base64url, stored only as SHA-256, one purpose each.

const LOOKUP_JOB = 'subscriber-token'

/** Days a token of each purpose lasts; null lives as long as its subscriber (ticket decision). */
const LIFETIME_DAYS: Record<SubscriberTokenPurpose, number | null> = {
  confirm: 7,
  manage: 30,
  unsubscribe: null,
  reply: 30,
  feedback: 30
}

/** The form `emailHash` and every stored address take: trimmed and lower-cased. */
export const normalizeEmail = (address: string) => address.trim().toLowerCase()

/** HMAC-SHA-256 hex under `EMAIL_HASH_KEY` (#79 §6) of the normalised address, as `suppression.email_hash` holds it. */
export const emailHash: EmailHash = (address) => {
  const key = process.env.EMAIL_HASH_KEY
  if (!key || key.length < 32) throw new Error('EMAIL_HASH_KEY is not set to at least 32 characters')
  return createHmac('sha256', key).update(normalizeEmail(address)).digest('hex')
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Not yet spent and not expired. */
const live = () =>
  and(isNull(subscriberToken.usedAt), or(isNull(subscriberToken.expiresAt), gt(subscriberToken.expiresAt, sql`now()`)))

function mint() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export const issueSubscriberToken: IssueSubscriberToken = async (handle, t) => {
  const tx = handle as Tx
  const { token, tokenHash } = mint()
  const days = LIFETIME_DAYS[t.purpose]
  await tx.insert(subscriberToken).values({
    orgId: tx.orgId!,
    subscriberId: t.subscriberId,
    tokenHash,
    purpose: t.purpose,
    callId: t.callId,
    windowId: t.windowId,
    expiresAt: days === null ? null : sql`now() + make_interval(days => ${days})`
  })
  return token
}

type Verified = NonNullable<Awaited<ReturnType<VerifySubscriberToken>>>
export type ResolvedSubscribeToken =
  | { kind: 'link'; orgId: string; projectId: string; linkId: string }
  | ({ kind: 'subscriber'; purpose: SubscriberTokenPurpose } & Verified)

/**
 * A subscribe link or a live subscriber token (unexpired, unused, its subscriber present), or null for anything else,
 * so every bad token fails alike. The lookup runs without an organisation (migration `c-subscribers-lookup`).
 */
export async function resolveSubscribeToken(token: string): Promise<ResolvedSubscribeToken | null> {
  const tokenHash = hashToken(token)
  const found = await withSystem(LOOKUP_JOB, async (tx) => {
    const [link] = await tx
      .select({ id: subscribeLink.id, orgId: subscribeLink.orgId, projectId: subscribeLink.projectId })
      .from(subscribeLink)
      .where(eq(subscribeLink.tokenHash, tokenHash))
    if (link) return { link, row: undefined }
    const [row] = await tx
      .select()
      .from(subscriberToken)
      .where(and(eq(subscriberToken.tokenHash, tokenHash), live()))
    return row ? { link: undefined, row } : null
  })
  if (!found) return null
  const { link, row } = found
  if (link) return { kind: 'link', orgId: link.orgId, projectId: link.projectId, linkId: link.id }
  const [owner] = await withTenant({ orgId: row.orgId, principal: systemPrincipal(LOOKUP_JOB) }, (tx) =>
    tx.select({ projectId: subscriber.projectId }).from(subscriber).where(eq(subscriber.id, row.subscriberId))
  )
  if (!owner) return null
  return {
    kind: 'subscriber',
    purpose: row.purpose,
    orgId: row.orgId,
    projectId: owner.projectId,
    subscriberId: row.subscriberId,
    tokenId: row.id,
    callId: row.callId,
    windowId: row.windowId
  }
}

export const verifySubscriberToken: VerifySubscriberToken = async (token, purpose) => {
  const found = await resolveSubscribeToken(token)
  if (found?.kind !== 'subscriber' || found.purpose !== purpose) return null
  const { kind: _kind, purpose: _purpose, ...verified } = found
  return verified
}

/** Spends a single-use token (`confirm`; #163's `reply` and `feedback`): true once, then false. */
export async function consumeSubscriberToken(tx: Tx, tokenId: string): Promise<boolean> {
  const spent = await tx
    .update(subscriberToken)
    .set({ usedAt: sql`now()` })
    .where(and(eq(subscriberToken.id, tokenId), live()))
    .returning({ id: subscriberToken.id })
  return spent.length === 1
}

/** Mints a project's subscribe link, removing any earlier one so its token stops resolving. */
export async function rotateSubscribeLink(tx: Tx, projectId: string): Promise<{ id: string; token: string }> {
  const { token, tokenHash } = mint()
  await tx.delete(subscribeLink).where(eq(subscribeLink.projectId, projectId))
  const [row] = await tx
    .insert(subscribeLink)
    .values({ orgId: tx.orgId!, projectId, tokenHash })
    .returning({ id: subscribeLink.id })
  return { id: row!.id, token }
}
