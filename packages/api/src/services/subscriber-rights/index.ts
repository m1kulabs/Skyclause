import type { SubscriberData } from '@skyclause/contracts'
import {
  consentRecord,
  crowdReply,
  emailHash,
  normalizeEmail,
  notice,
  project,
  subscriber,
  subscriberToken,
  suppression,
  window,
  type Tx
} from '@skyclause/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { queueSubscriberEmail, type QueuedEmail } from '../subscribers/mail'
import { publishedNoticeVersion } from '../subscribers/shared'

const NOT_FOUND = () => new ApiError(404, 'not-found', 'No subscriber data exists for this link.')

/** Returns every retained row linked to this subscriber, within the token's project and organisation. */
export async function getSubscriberData(
  ctx: ServiceContext,
  input: { projectId: string; subscriberId: string; marketingOrigin?: string }
): Promise<SubscriberData> {
  const tx = ctx.tx as Tx
  const [owner] = await tx
    .select({ id: project.id, name: project.name })
    .from(project)
    .innerJoin(subscriber, and(eq(subscriber.projectId, project.id), eq(subscriber.id, input.subscriberId)))
    .where(eq(project.id, input.projectId))
  if (!owner) throw NOT_FOUND()

  const [person] = await tx.select().from(subscriber).where(eq(subscriber.id, input.subscriberId))
  if (!person) throw NOT_FOUND()
  const consents = await tx
    .select()
    .from(consentRecord)
    .where(eq(consentRecord.subscriberId, person.id))
    .orderBy(desc(consentRecord.at))
  const notices = await tx
    .select()
    .from(notice)
    .where(eq(notice.subscriberId, person.id))
    .orderBy(desc(notice.createdAt))
  const tokens = await tx
    .select({ id: subscriberToken.id })
    .from(subscriberToken)
    .where(eq(subscriberToken.subscriberId, person.id))
  const suppressions = person.emailHash
    ? await tx
        .select()
        .from(suppression)
        .where(and(eq(suppression.orgId, tx.orgId!), eq(suppression.emailHash, person.emailHash)))
    : []
  const windowRows = person.windowIds.length
    ? await tx
        .select()
        .from(window)
        .where(and(eq(window.projectId, input.projectId), inArray(window.id, person.windowIds)))
        .orderBy(window.startsAt)
    : []
  const replies = tokens.length
    ? await tx
        .select({
          id: crowdReply.id,
          windowId: crowdReply.windowId,
          callId: crowdReply.callId,
          kind: crowdReply.kind,
          shiftTo: crowdReply.shiftTo,
          at: crowdReply.at
        })
        .from(crowdReply)
        .innerJoin(subscriberToken, eq(subscriberToken.id, crowdReply.id))
        .where(and(eq(subscriberToken.subscriberId, person.id), eq(subscriberToken.purpose, 'reply')))
        .orderBy(desc(crowdReply.at))
    : []
  const suppressionRow = suppressions[0]
  const status =
    suppressionRow?.reason === 'bounce'
      ? 'bounced'
      : suppressionRow?.reason === 'complaint'
        ? 'complained'
        : person.unsubscribedAt || suppressionRow?.reason === 'unsubscribe'
          ? 'unsubscribed'
          : person.confirmedAt
            ? 'confirmed'
            : 'unconfirmed'
  const permalink = (callId: string | null) => {
    if (!callId) return null
    return `${input.marketingOrigin?.replace(/\/$/, '') ?? ''}/c/${callId}`
  }

  return {
    project_name: owner.name,
    subscriber: {
      id: person.id,
      project_id: person.projectId,
      email: person.email,
      role: person.role,
      window_ids: person.windowIds,
      channels: person.channels as SubscriberData['subscriber']['channels'],
      language: person.language as SubscriberData['subscriber']['language'],
      confirmed_at: person.confirmedAt ? instant(person.confirmedAt) : null
    },
    subscriber_status: status,
    windows: windowRows.map((row) => ({
      id: row.id,
      title: row.title,
      starts_at: instant(row.startsAt),
      ends_at: instant(row.endsAt),
      kind: row.kind,
      tz: row.tz
    })),
    consent_records: consents.map((row) => ({
      at: instant(row.at),
      form: row.form,
      notice_version: row.noticeVersion,
      language: row.language as SubscriberData['consent_records'][number]['language']
    })),
    delivery_history: notices.map((row) => ({
      id: row.id,
      kind: row.kind,
      call_id: row.callId,
      call_permalink: permalink(row.callId),
      channel: row.channel,
      language: row.language as SubscriberData['delivery_history'][number]['language'],
      status: row.status,
      at: instant(row.createdAt),
      accepted_at: row.acceptedAt ? instant(row.acceptedAt) : null
    })),
    crowd_replies: replies.map((row) => ({
      id: row.id,
      window_id: row.windowId,
      call_id: row.callId,
      kind: row.kind,
      shift_to: row.shiftTo ? instant(row.shiftTo) : null,
      at: instant(row.at)
    })),
    suppression: suppressionRow
      ? { email_hash: suppressionRow.emailHash, reason: suppressionRow.reason, at: instant(suppressionRow.at) }
      : null
  }
}

/** Changes role now; a new address gets a confirmation notice and remains pending until its token is used. */
export async function updateSubscriberData(
  ctx: ServiceContext,
  input: {
    projectId: string
    subscriberId: string
    now: Date
    ipHash: string
    appOrigin: string
    marketingOrigin?: string
    patch: { email?: string; role?: string }
  }
): Promise<{ data: SubscriberData; email: QueuedEmail | null }> {
  const tx = ctx.tx as Tx
  const [person] = await tx
    .select()
    .from(subscriber)
    .where(and(eq(subscriber.id, input.subscriberId), eq(subscriber.projectId, input.projectId)))
  if (!person) throw NOT_FOUND()
  const changed: string[] = []
  const changes: Partial<typeof subscriber.$inferInsert> = {}
  if (input.patch.role !== undefined && input.patch.role !== person.role) {
    changes.role = input.patch.role
    changed.push('role')
  }
  let newEmail: string | undefined
  if (input.patch.email !== undefined) {
    newEmail = normalizeEmail(input.patch.email)
    if (newEmail !== person.email) {
      const [duplicate] = await tx
        .select({ id: subscriber.id })
        .from(subscriber)
        .where(and(eq(subscriber.projectId, person.projectId), eq(subscriber.email, newEmail)))
      if (duplicate) {
        throw new ApiError(422, 'validation-failed', 'That address already has a subscription for this project.', {
          errors: [{ in: 'body', pointer: '/email', detail: 'Already subscribed' }]
        })
      }
    } else {
      newEmail = undefined
    }
  }
  let queued: QueuedEmail | null = null
  if (changed.length) {
    const noticeVersion = publishedNoticeVersion()
    const [updated] = await tx
      .update(subscriber)
      .set({ ...changes, updatedAt: input.now })
      .where(eq(subscriber.id, person.id))
      .returning()
    await tx.insert(consentRecord).values({
      orgId: tx.orgId!,
      subscriberId: person.id,
      form: 'preferences',
      noticeVersion,
      language: updated!.language,
      changed,
      ipHash: input.ipHash
    })
  }
  if (newEmail) {
    const [projectRow] = await tx.select({ name: project.name }).from(project).where(eq(project.id, person.projectId))
    if (!projectRow) throw NOT_FOUND()
    queued = await queueSubscriberEmail(tx, 'confirmation', {
      subscriber: person,
      projectName: projectRow.name,
      appOrigin: input.appOrigin,
      recipient: newEmail,
      addressHash: emailHash(newEmail),
      skipRecent: true
    })
  }
  return {
    data: await getSubscriberData(ctx, {
      projectId: input.projectId,
      subscriberId: input.subscriberId,
      marketingOrigin: input.marketingOrigin
    }),
    email: queued
  }
}
