import { createHash } from 'node:crypto'
import { log } from '@skyclause/config'
import type { EmailTransport, Principal } from '@skyclause/contracts'
import { issueSubscriberToken, notice, recentSubscriberEmail, type Tx } from '@skyclause/db'
import { renderSubscriberEmail, type SubscriberEmailKind } from '@skyclause/delivery'
import { eq } from 'drizzle-orm'
import type { WithTenant } from '../../tenancy'

// #157: the `confirmation` and `preference_link` emails (one owner per kind, #79 §1). The flow's transaction mints the
// token and writes the `notice` row; after it commits, `deliverSubscriberEmail` sends it and records the answer.
// #158's `/ses/events` then updates the row's status.

export interface QueuedEmail {
  orgId: string
  noticeId: string
  message: Parameters<EmailTransport['send']>[0]
}

/** The page each email opens (D25: a page whose one button posts). */
const PAGE: Record<SubscriberEmailKind, (token: string) => string> = {
  confirmation: (token) => `/subscribe/${token}/confirm`,
  preference_link: (token) => `/subscribe/${token}`
}
const PURPOSE = { confirmation: 'confirm', preference_link: 'manage' } as const

/**
 * Mints a `confirm` or `manage` token, renders the email in the subscriber's language and queues its `notice`, with an
 * idempotency key hashing the kind, subscriber and token. Null, sending nothing, when the same kind went to this
 * subscriber in the last 10 minutes, so a public form can't be used to flood an inbox.
 */
export async function queueSubscriberEmail(
  tx: Tx,
  kind: SubscriberEmailKind,
  o: {
    subscriber: { id: string; projectId: string; email: string; language: string }
    projectName: string
    appOrigin: string
  }
): Promise<QueuedEmail | null> {
  const { subscriber } = o
  if (await recentSubscriberEmail(tx, subscriber.id, kind)) return null
  const token = await issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose: PURPOSE[kind] })
  const language = subscriber.language === 'ms' ? 'ms' : 'en'
  const { subject, text } = renderSubscriberEmail(kind, {
    language,
    projectName: o.projectName,
    url: `${o.appOrigin}${PAGE[kind](token)}`
  })
  const idempotencyKey = createHash('sha256').update(`${kind}\n${subscriber.id}\n${token}`).digest('hex')
  const [row] = await tx
    .insert(notice)
    .values({
      orgId: tx.orgId!,
      projectId: subscriber.projectId,
      kind,
      channel: 'email',
      idempotencyKey,
      subscriberId: subscriber.id,
      language
    })
    .returning({ id: notice.id })
  return {
    orgId: tx.orgId!,
    noticeId: row!.id,
    message: { to: subscriber.email, from: 'notices', subject, text, category: kind, idempotencyKey }
  }
}

/**
 * Sends a queued email and records `sent` with the provider's message ID, or `failed`. A failure is logged with the
 * notice ID and SES's error (never the address or token) and, when `rethrow`, answers the request as an error; the
 * public join keeps its one response whatever SES says, so it can't be used to probe addresses.
 */
export async function deliverSubscriberEmail(
  deps: { email: EmailTransport; withTenant: WithTenant },
  principal: Principal,
  queued: QueuedEmail,
  o: { rethrow: boolean }
): Promise<void> {
  const record = (values: Partial<typeof notice.$inferInsert>) =>
    deps.withTenant({ orgId: queued.orgId, principal }, (handle) =>
      (handle as Tx).update(notice).set(values).where(eq(notice.id, queued.noticeId))
    )
  let providerMessageId: string
  try {
    ;({ providerMessageId } = await deps.email.send(queued.message))
  } catch (error) {
    await record({ status: 'failed', updatedAt: new Date() })
    log.error('subscriber email failed', {
      notice_id: queued.noticeId,
      kind: queued.message.category,
      error: error instanceof Error ? error.message : String(error)
    })
    if (o.rethrow) throw error
    return
  }
  const now = new Date()
  await record({ status: 'sent', providerMessageId, acceptedAt: now, updatedAt: now })
}
