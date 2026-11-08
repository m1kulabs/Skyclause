import type { Page } from '@skyclause/contracts'
import {
  consentRecord,
  countSubscribers,
  emailHash,
  eraseSubscriber,
  listSubscriberRows,
  normalizeEmail,
  rotateSubscribeLink,
  subscriber,
  suppression,
  type SubscriberStatus,
  type Tx
} from '@skyclause/db'
import { and, eq } from 'drizzle-orm'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { queueSubscriberEmail, type QueuedEmail } from './mail'
import {
  checkWindows,
  isUuid,
  projectOr404,
  publishedNoticeVersion,
  subscriberWire,
  type SubscriberFields
} from './shared'

// #157, NTC-13: what an Admin sees and does on a project's subscribers (`channels.manage`), and the counts an
// Approver sees (`project.view`).

type Row = Awaited<ReturnType<typeof listSubscriberRows>>[number]

function viewOf(row: Row) {
  return {
    ...subscriberWire(row),
    status: row.status,
    suppressed: row.suppressed,
    last_notice_at: row.lastNoticeAt && instant(row.lastNoticeAt),
    consent: row.consent && {
      at: instant(row.consent.at),
      form: row.consent.form,
      notice_version: row.consent.noticeVersion,
      language: row.consent.language as 'en' | 'ms'
    }
  }
}
export type SubscriberView = ReturnType<typeof viewOf>

export async function listSubscribers(
  ctx: ServiceContext,
  q: {
    projectId: string
    limit: number
    cursor?: string
    windowId?: string
    channel?: string
    status?: SubscriberStatus
  }
): Promise<Page<SubscriberView>> {
  const tx = ctx.tx as Tx
  await projectOr404(tx, q.projectId)
  const after = q.cursor ? decodeCursor(q.cursor).id : undefined
  if (after !== undefined && (typeof after !== 'string' || !isUuid(after))) {
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  }
  if (q.windowId !== undefined && !isUuid(q.windowId)) return { data: [], next_cursor: null }
  const rows = await listSubscriberRows(tx, {
    projectId: q.projectId,
    limit: q.limit,
    afterId: after,
    windowId: q.windowId,
    channel: q.channel,
    status: q.status
  })
  return page(rows.map(viewOf), q.limit, (row) => ({ id: row.id }))
}

export async function getSubscriberCounts(ctx: ServiceContext, projectId: string) {
  const tx = ctx.tx as Tx
  await projectOr404(tx, projectId)
  const { byWindow, byChannel, ...counts } = await countSubscribers(tx, projectId)
  return {
    ...counts,
    by_window: [...byWindow].map(([window_id, count]) => ({ window_id, count })),
    by_channel: [...byChannel].map(([channel, count]) => ({
      channel: channel as SubscriberFields['channels'][number],
      count
    }))
  }
}

/**
 * Imports one address (NTC-13): an unconfirmed subscriber with an `import` consent record naming who imported it,
 * sent only a confirmation, and nothing at all if its hash is suppressed. An address already here is left as it is.
 */
export async function importSubscriber(
  ctx: ServiceContext,
  input: { projectId: string; fields: SubscriberFields; appOrigin: string }
): Promise<{ view: SubscriberView; email: QueuedEmail | null }> {
  const noticeVersion = publishedNoticeVersion()
  const tx = ctx.tx as Tx
  const project = await projectOr404(tx, input.projectId)
  const { fields } = input
  const windowIds = await checkWindows(tx, project.id, fields.window_ids)
  const email = normalizeEmail(fields.email)
  const hash = emailHash(email)
  const [created] = await tx
    .insert(subscriber)
    .values({
      orgId: tx.orgId!,
      projectId: project.id,
      email,
      emailHash: hash,
      role: fields.role,
      windowIds,
      channels: fields.channels,
      language: fields.language
    })
    .onConflictDoNothing({ target: [subscriber.projectId, subscriber.email] })
    .returning()
  let queued: QueuedEmail | null = null
  if (created) {
    await tx.insert(consentRecord).values({
      orgId: tx.orgId!,
      subscriberId: created.id,
      form: 'import',
      noticeVersion,
      language: fields.language,
      actorId: 'accountId' in ctx.principal ? ctx.principal.accountId : null
    })
    const [suppressed] = await tx
      .select({ id: suppression.id })
      .from(suppression)
      .where(eq(suppression.emailHash, hash))
    if (!suppressed) {
      queued = await queueSubscriberEmail(tx, 'confirmation', {
        subscriber: created,
        projectName: project.name,
        appOrigin: input.appOrigin
      })
    }
  }
  const id =
    created?.id ??
    (
      await tx
        .select({ id: subscriber.id })
        .from(subscriber)
        .where(and(eq(subscriber.projectId, project.id), eq(subscriber.email, email)))
    )[0]!.id
  const [row] = await listSubscriberRows(tx, { projectId: project.id, limit: 1, id })
  return { view: viewOf(row!), email: queued }
}

/** Mints the project's subscribe link, retiring the earlier one, and returns its URL. */
export async function createSubscribeLink(ctx: ServiceContext, input: { projectId: string; appOrigin: string }) {
  const tx = ctx.tx as Tx
  const project = await projectOr404(tx, input.projectId)
  const { id, token } = await rotateSubscribeLink(tx, project.id)
  return { id, project_id: project.id, url: `${input.appOrigin}/subscribe/${token}` }
}

/** Removes a subscriber through #110's erasure, which leaves any suppression in place. */
export async function removeSubscriber(ctx: ServiceContext, subscriberId: string) {
  const tx = ctx.tx as Tx
  const [row] = isUuid(subscriberId)
    ? await tx.select({ id: subscriber.id }).from(subscriber).where(eq(subscriber.id, subscriberId))
    : []
  if (!row) throw new ApiError(404, 'not-found', 'No such subscriber.')
  await eraseSubscriber(tx, row.id)
}
