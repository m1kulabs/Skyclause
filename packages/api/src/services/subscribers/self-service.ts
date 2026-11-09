import { PRIVACY_NOTICE_VERSION, type Subscriber, type Window } from '@skyclause/contracts'
import {
  consentRecord,
  consumeSubscriberToken,
  emailHash,
  normalizeEmail,
  openWindows,
  organization,
  project,
  subscriber,
  suppression,
  systemPrincipal,
  track,
  type Tx
} from '@skyclause/db'
import { and, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { queueSubscriberEmail, type QueuedEmail } from './mail'
import {
  checkWindows,
  linkExpired,
  projectOr404,
  publishedNoticeVersion,
  subscriberWire,
  type SubscriberFields
} from './shared'

// #157: what a subscriber does from a link, with no account (NTC-8, NTC-9, NTC-14). The route resolves the link's
// token, then calls these in the link's organisation as `LINK_PRINCIPAL`.

/** Who acts for a link holder, who has no account. */
export const LINK_PRINCIPAL = systemPrincipal('subscribers')

/** What a link request carries besides its token. */
export interface LinkRequest {
  now: Date
  /** HMAC of the caller's IP (`IP_HASH_KEY`), kept on consent records. */
  ipHash: string
  appOrigin: string
}

function windowWire(row: Awaited<ReturnType<typeof openWindows>>[number]): Window {
  return {
    id: row.id,
    project_id: row.projectId,
    starts_at: instant(row.startsAt),
    ends_at: instant(row.endsAt),
    title: row.title,
    kind: row.kind,
    tz: row.tz,
    declared_by: row.declaredBy,
    guest: row.guest,
    via: row.via,
    expires_at: row.expiresAt && instant(row.expiresAt),
    series_id: row.seriesId,
    ics_feed_id: row.icsFeedId,
    cancelled_at: row.cancelledAt && instant(row.cancelledAt),
    share_link_id: row.shareLinkId,
    moderation: row.moderation
  }
}

/** What a sign-up or preference page shows: the project, its open windows and, by a subscriber's link, them. */
export async function getSubscription(ctx: ServiceContext, input: { projectId: string; subscriberId: string | null }) {
  const tx = ctx.tx as Tx
  const [row] = await tx
    .select({ id: project.id, slug: project.slug, name: project.name, orgSlug: organization.slug })
    .from(project)
    .innerJoin(organization, eq(organization.id, project.orgId))
    .where(eq(project.id, input.projectId))
  const [own] = input.subscriberId
    ? await tx.select().from(subscriber).where(eq(subscriber.id, input.subscriberId))
    : [undefined]
  return {
    project: { id: row!.id, slug: row!.slug, org_slug: row!.orgSlug },
    project_name: row!.name,
    windows: (await openWindows(tx, row!.id)).map(windowWire),
    subscriber: own ? subscriberWire(own) : null,
    privacy_notice_version: PRIVACY_NOTICE_VERSION
  }
}

/**
 * NTC-8: joins by the project's subscribe link. A new address gets an unconfirmed row; an address already here keeps
 * its settings, since the form proves nothing about who sent it (they change by preference link). Unless the address
 * is confirmed and subscribed, the join is a consent record and a confirmation; a confirmed one gets a fresh
 * preference link instead (the page's "send me my link"); a bounced or complained address gets nothing. The answer
 * is the same in every case, so addresses can't be probed.
 */
export async function joinProject(
  ctx: ServiceContext,
  input: LinkRequest & { projectId: string; body: SubscriberFields & { notice_version: string } }
): Promise<{ subscriber: Subscriber; email: QueuedEmail | null }> {
  const noticeVersion = publishedNoticeVersion()
  const { body } = input
  if (body.notice_version !== noticeVersion) {
    throw new ApiError(422, 'validation-failed', 'The privacy notice has changed; read the current one.', {
      errors: [{ in: 'body', pointer: '/notice_version', detail: `The published notice is ${noticeVersion}` }]
    })
  }
  const tx = ctx.tx as Tx
  const found = await projectOr404(tx, input.projectId)
  const windowIds = await checkWindows(tx, found.id, body.window_ids)
  const email = normalizeEmail(body.email)
  const hash = emailHash(email)
  // An address already here (or inserted by a join racing this one) keeps its row as it is.
  const [created] = await tx
    .insert(subscriber)
    .values({
      orgId: tx.orgId!,
      projectId: found.id,
      email,
      emailHash: hash,
      role: body.role,
      windowIds,
      channels: body.channels,
      language: body.language
    })
    .onConflictDoNothing({ target: [subscriber.projectId, subscriber.email] })
    .returning()
  const [row] = created
    ? [created]
    : await tx
        .select()
        .from(subscriber)
        .where(and(eq(subscriber.projectId, found.id), eq(subscriber.email, email)))
  const active = row!.confirmedAt && !row!.unsubscribedAt
  if (!active) {
    await tx.insert(consentRecord).values({
      orgId: tx.orgId!,
      subscriberId: row!.id,
      form: 'subscribe_link',
      noticeVersion,
      language: body.language,
      ipHash: input.ipHash
    })
  }
  const [blocked] = await tx
    .select({ id: suppression.id })
    .from(suppression)
    .where(and(eq(suppression.emailHash, hash), inArray(suppression.reason, ['bounce', 'complaint'])))
  const queued = blocked
    ? null
    : await queueSubscriberEmail(tx, active ? 'preference_link' : 'confirmation', {
        subscriber: row!,
        projectName: found.name,
        appOrigin: input.appOrigin
      })
  return {
    subscriber: {
      id: row!.id,
      project_id: found.id,
      email,
      role: body.role,
      window_ids: windowIds,
      channels: body.channels,
      language: body.language,
      confirmed_at: null
    },
    email: queued
  }
}

const PATCHABLE = ['email', 'role', 'window_ids', 'channels', 'language'] as const

/**
 * NTC-14: a `manage` link changes role, windows, channels or language, each change appended as a consent record
 * naming the fields. The address itself changes only through the data page's confirmed correction (#110), so this
 * refuses every new address alike and can't be used to learn who else subscribes.
 */
export async function updatePreferences(
  ctx: ServiceContext,
  input: LinkRequest & { subscriberId: string; patch: Partial<SubscriberFields>; sentKeys: string[] }
): Promise<Subscriber> {
  const noticeVersion = publishedNoticeVersion()
  const { patch, sentKeys } = input
  const extra = sentKeys.filter((key) => !(PATCHABLE as readonly string[]).includes(key))
  if (extra.length) {
    throw new ApiError(422, 'validation-failed', 'Preferences take only email, role, windows, channels and language.', {
      errors: extra.map((key) => ({ in: 'body', pointer: `/${key}`, detail: 'Not a preference' }))
    })
  }
  const tx = ctx.tx as Tx
  const [current] = await tx.select().from(subscriber).where(eq(subscriber.id, input.subscriberId))
  const owner = await projectOr404(tx, current!.projectId)
  const changes: Partial<typeof subscriber.$inferInsert> = {}
  const changed: string[] = []
  const differs = (a: readonly string[], b: readonly string[]) =>
    a.length !== b.length || a.some((item) => !b.includes(item))
  if (patch.role !== undefined && patch.role !== current!.role) {
    changes.role = patch.role
    changed.push('role')
  }
  if (patch.window_ids !== undefined) {
    const windowIds = await checkWindows(tx, owner.id, patch.window_ids)
    if (differs(windowIds, current!.windowIds)) {
      changes.windowIds = windowIds
      changed.push('window_ids')
    }
  }
  if (patch.channels !== undefined && differs([...new Set(patch.channels)], current!.channels)) {
    changes.channels = [...new Set(patch.channels)]
    changed.push('channels')
  }
  if (patch.language !== undefined && patch.language !== current!.language) {
    changes.language = patch.language
    changed.push('language')
  }
  if (patch.email !== undefined && normalizeEmail(patch.email) !== current!.email) {
    throw new ApiError(422, 'validation-failed', 'An address changes from the data page, by confirming the new one.', {
      errors: [{ in: 'body', pointer: '/email', detail: 'Not changeable here' }]
    })
  }
  if (!changed.length) return subscriberWire(current!)
  const [updated] = await tx
    .update(subscriber)
    .set({ ...changes, updatedAt: input.now })
    .where(eq(subscriber.id, current!.id))
    .returning()
  await tx.insert(consentRecord).values({
    orgId: tx.orgId!,
    subscriberId: updated!.id,
    form: 'preferences',
    noticeVersion,
    language: updated!.language,
    changed,
    ipHash: input.ipHash
  })
  return subscriberWire(updated!)
}

/**
 * Spends a `confirm` link: the subscriber is confirmed, a consent record repeats the notice version they joined
 * under, and an `unsubscribe` suppression on the address is lifted unless another of its rows in the organisation is
 * still unsubscribed.
 */
export async function confirmSubscription(
  ctx: ServiceContext,
  input: Omit<LinkRequest, 'appOrigin'> & { subscriberId: string; tokenId: string }
): Promise<Subscriber> {
  const tx = ctx.tx as Tx
  if (!(await consumeSubscriberToken(tx, input.tokenId))) throw linkExpired()
  const [joined] = await tx
    .select({ noticeVersion: consentRecord.noticeVersion })
    .from(consentRecord)
    .where(eq(consentRecord.subscriberId, input.subscriberId))
    .orderBy(desc(consentRecord.at), desc(consentRecord.id))
    .limit(1)
  const { now } = input
  const [row] = await tx
    .update(subscriber)
    .set({ confirmedAt: now, unsubscribedAt: null, updatedAt: now })
    .where(eq(subscriber.id, input.subscriberId))
    .returning()
  const hash = emailHash(row!.email)
  const [stillOut] = await tx
    .select({ id: subscriber.id })
    .from(subscriber)
    .where(and(eq(subscriber.emailHash, hash), isNotNull(subscriber.unsubscribedAt), ne(subscriber.id, row!.id)))
    .limit(1)
  if (!stillOut) {
    await tx.delete(suppression).where(and(eq(suppression.emailHash, hash), eq(suppression.reason, 'unsubscribe')))
  }
  await tx.insert(consentRecord).values({
    orgId: tx.orgId!,
    subscriberId: row!.id,
    form: 'confirm',
    noticeVersion: joined?.noticeVersion ?? publishedNoticeVersion(),
    language: row!.language,
    ipHash: input.ipHash
  })
  return subscriberWire(row!)
}

/**
 * NTC-9, RFC 8058: one POST from an `unsubscribe` link (or the preference page's `manage` link) stops notices before
 * the next one: `unsubscribed_at` and an organisation-wide `unsubscribe` suppression of the address, which #158's
 * sender checks. Repeating it changes nothing.
 */
export async function unsubscribe(ctx: ServiceContext, input: { subscriberId: string; now: Date }): Promise<void> {
  const tx = ctx.tx as Tx
  const { now } = input
  const [row] = await tx
    .update(subscriber)
    .set({ unsubscribedAt: now, updatedAt: now })
    .where(and(eq(subscriber.id, input.subscriberId), isNull(subscriber.unsubscribedAt)))
    .returning()
  const [current] = row ? [row] : await tx.select().from(subscriber).where(eq(subscriber.id, input.subscriberId))
  await tx
    .insert(suppression)
    .values({ orgId: tx.orgId!, emailHash: emailHash(current!.email), reason: 'unsubscribe' })
    .onConflictDoNothing()
  if (row) await track(tx, 'unsubscribed', { channel: 'email' }, { projectId: row.projectId })
}
