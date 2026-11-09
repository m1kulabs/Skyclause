import type { EmailTransport } from '@skyclause/contracts'
import {
  feedbackRecipients,
  issueSubscriberToken,
  queueFeedbackNotice,
  recordNoticeSend,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import { renderFeedbackEmail } from '@skyclause/delivery'
import { onEvent } from '../events'
import { log, type EventConsumer } from '../server'

// #163 (ANL-7): one "Did the weather change your plan?" email per subscriber per graded Sky window. The event's
// transaction (`handleOnce`) queues the notices and mints the links; the sends follow its commit, so a redelivered
// `call.graded` sends nothing twice. A crash between commit and send leaves those notices `queued`, unsent.

export interface FeedbackDeps {
  email: () => EmailTransport
  /** `APP_ORIGIN`, where the feedback and unsubscribe pages live. */
  appOrigin: () => string
}

const CONSUMER = 'plan-feedback'
const principal = systemPrincipal(`event:${CONSUMER}`)

interface QueuedFeedback {
  orgId: string
  noticeId: string
  message: Parameters<EmailTransport['send']>[0]
}

async function queueFeedback(tx: Tx, callId: string, deps: FeedbackDeps): Promise<QueuedFeedback[]> {
  const graded = await feedbackRecipients(tx, callId)
  if (!graded?.recipients.length) return []
  const origin = deps.appOrigin()
  const { window } = graded
  const queued: QueuedFeedback[] = []
  for (const recipient of graded.recipients) {
    const language = recipient.language === 'ms' ? 'ms' : 'en'
    const row = await queueFeedbackNotice(tx, {
      projectId: window.projectId,
      subscriberId: recipient.id,
      windowId: window.id,
      language
    })
    if (!row) continue
    const feedback = await issueSubscriberToken(tx, {
      subscriberId: recipient.id,
      purpose: 'feedback',
      windowId: window.id
    })
    const unsubscribe = await issueSubscriberToken(tx, { subscriberId: recipient.id, purpose: 'unsubscribe' })
    const { subject, text } = renderFeedbackEmail({
      language,
      projectName: window.projectName,
      windowTitle: window.title,
      windowStartsAt: window.startsAt,
      url: `${origin}/subscribe/${feedback}/feedback`,
      unsubscribeUrl: `${origin}/subscribe/${unsubscribe}/unsubscribe`
    })
    queued.push({
      orgId: tx.orgId!,
      noticeId: row.id,
      message: {
        to: recipient.email,
        from: 'notices',
        subject,
        text,
        headers: {
          'List-Unsubscribe': `<${origin}/api/subscribe/${unsubscribe}/unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        },
        category: 'feedback',
        idempotencyKey: row.idempotencyKey
      }
    })
  }
  return queued
}

/** Sends one queued email and records SES's answer; a refusal (D48's sandbox included) is logged, never rethrown. */
async function deliver(deps: FeedbackDeps, queued: QueuedFeedback) {
  let providerMessageId: string | null = null
  try {
    ;({ providerMessageId } = await deps.email().send(queued.message))
  } catch (error) {
    log('ERROR', 'feedback email failed', {
      notice_id: queued.noticeId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
  await withTenant({ orgId: queued.orgId, principal }, (tx) => recordNoticeSend(tx, queued.noticeId, providerMessageId))
}

/** The `call.graded` consumer; a `pending` grade isn't graded yet, and its later grade asks instead. */
export function planFeedbackConsumer(deps: FeedbackDeps): EventConsumer {
  return {
    consumer: CONSUMER,
    types: ['call.graded'],
    handler: async (raw) => {
      const queued: QueuedFeedback[] = []
      await onEvent(['call.graded'], CONSUMER, async (event, tx) => {
        const { call_id: callId, outcome } = event.data as { call_id: string; outcome: string }
        if (outcome !== 'pending') queued.push(...(await queueFeedback(tx, callId, deps)))
      }).handler(raw)
      for (const email of queued) await deliver(deps, email)
    }
  }
}
