// Inbound mail (#657): Resend receives each message for in.skyclause.m1ku.tech and posts an `email.received` webhook,
// metadata only (https://resend.com/docs/webhooks/emails/received.md), to the worker's `POST /resend/webhook`. The
// handler reads the message from Resend and hands it to the matching consumer. Bodies and addresses never reach the logs.
import { log as sharedLog } from '@skyclause/config'
import type { InboundVerdict } from '@skyclause/contracts'
import type { ResendWebhook } from './resend-webhook'

/** What a consumer receives (spec §1 `onInbound`). */
export interface InboundMessage {
  recipient: string
  from: string
  subject: string
  text: string
  /** Resend's received-email ID. */
  messageId: string
  /** When Resend received it, RFC 3339. */
  receivedAt: string
  verdicts: Record<'spf' | 'dkim' | 'dmarc', InboundVerdict>
}

export type InboundHandler = (m: InboundMessage) => Promise<void>

export interface InboundOptions {
  /** `RESEND_RECEIVING_API_KEY`: reading received mail needs a full-access key. */
  apiKey: string
  /** Tests only. */
  fetch?: typeof fetch
  now?: () => Date
}

// The `email.received` fields read. Mail is routed on `to`, where Resend names the address at the receiving domain it
// was delivered for, as its docs advise; `received_for` holds the addresses it was forwarded for, taken from the
// message's own `Received` headers.
interface ReceivedEvent {
  email_id?: unknown
  created_at?: unknown
  to?: unknown
}

// The fields read from `GET /emails/receiving/{id}`
// (https://resend.com/docs/api-reference/emails/retrieve-received-email.md): `from` is the bare address, `text` is null
// for an HTML-only message and `authentication` null for older mail.
interface ReceivedEmail {
  from?: string
  subject?: string | null
  text?: string | null
  authentication?: Partial<Record<'spf' | 'dkim' | 'dmarc', string>> | null
}

// The shared logger: redacted and linked to the request's trace (#114, #245).
function log(severity: 'INFO' | 'ERROR', message: string, fields: Record<string, unknown>) {
  if (severity === 'ERROR') sharedLog.error(message, fields)
  else sharedLog.info(message, fields)
}

// Resend delivers at least once, retries for about 27 hours and replays any event from its dashboard later still, while a
// consumer's `handleOnce` mark is swept after 24 hours (`sweepHandledMessages`). Mail received longer ago than this, an
// hour inside those 24 hours for clock skew, is acknowledged unread, so no consumer can run twice for it.
const MAX_AGE_MS = 23 * 60 * 60_000

// Resend's result: `pass` is `PASS`, `fail` is `FAIL`, and anything else or none is `NONE`.
const verdict = (result: string | undefined): InboundVerdict =>
  result === 'pass' ? 'PASS' : result === 'fail' ? 'FAIL' : 'NONE'

// Errors that retrying won't mend, by status (https://resend.com/docs/api-reference/errors.md): no such email, or one
// received above quota, whose content Resend never returns.
const UNRETRIEVABLE: Record<number, string> = { 404: 'not_found', 403: 'email_above_quota' }

/**
 * The received email, or null when Resend can't ever return it. Throws on any other failure, so the webhook answers
 * 500 and Resend retries.
 */
async function retrieve(options: InboundOptions, messageId: string): Promise<ReceivedEmail | null> {
  const response = await (options.fetch ?? fetch)(
    // Images stay `cid:` references rather than inlined base64: only the text is read.
    `https://api.resend.com/emails/receiving/${encodeURIComponent(messageId)}?html_format=cid`,
    // Resend refuses a request without a User-Agent.
    { headers: { Authorization: `Bearer ${options.apiKey}`, 'User-Agent': 'skyclause' } }
  )
  // The email on success, `{statusCode, message, name}` on an error.
  const answer = (await response.json().catch(() => ({}))) as ReceivedEmail & { name?: unknown }
  if (response.ok) return answer
  const name = typeof answer.name === 'string' ? answer.name : 'unknown'
  if (UNRETRIEVABLE[response.status] !== name) {
    throw new Error(`Resend retrieve failed: ${name} (HTTP ${response.status})`)
  }
  log('ERROR', 'inbound mail not retrievable', { messageId, error: name })
  return null
}

export function createInboundRouter() {
  const consumers: Array<{ pattern: RegExp; consumer: string; handler: InboundHandler }> = []
  // Consumers already called per message, so Resend's retry after a partial failure doesn't call the ones that
  // succeeded. Each consumer's `handleOnce` also keeps a later delivery from repeating it.
  const delivered = new Map<string, Set<string>>()
  // A copy that arrives while the first is still being handled waits for it instead.
  const inFlight = new Map<string, Promise<boolean>>()

  function onInbound(recipient: RegExp, consumer: string, handler: InboundHandler) {
    if (consumers.some((c) => c.consumer === consumer)) throw new Error(`inbound consumer ${consumer} is registered`)
    consumers.push({ pattern: recipient, consumer, handler })
  }

  async function dispatch(
    options: InboundOptions,
    messageId: string,
    recipients: string[],
    receivedAt: string
  ): Promise<boolean> {
    // Matched lower-cased, handed over as received: a reply token in `r+{token}@…` is case-sensitive.
    const matched = new Map<string, { recipient: string; handler: InboundHandler }>()
    for (const recipient of recipients) {
      const match = consumers.find((c) => c.pattern.test(recipient.toLowerCase()))
      if (match && !matched.has(match.consumer)) matched.set(match.consumer, { recipient, handler: match.handler })
    }
    if (!matched.size) {
      log('INFO', 'inbound mail matched no consumer', { messageId })
      return true
    }
    if ((options.now?.() ?? new Date()).getTime() - Date.parse(receivedAt) > MAX_AGE_MS) {
      log('ERROR', 'inbound mail too old to handle once', { messageId, receivedAt })
      return true
    }

    const email = await retrieve(options, messageId)
    if (!email) return true
    const verdicts = {
      spf: verdict(email.authentication?.spf),
      dkim: verdict(email.authentication?.dkim),
      dmarc: verdict(email.authentication?.dmarc)
    }
    const done = delivered.get(messageId) ?? new Set<string>()
    delivered.set(messageId, done)

    let ok = true
    for (const [consumer, { recipient, handler }] of matched) {
      if (done.has(consumer)) continue
      try {
        await handler({
          recipient,
          from: email.from ?? '',
          subject: email.subject ?? '',
          text: email.text ?? '',
          messageId,
          receivedAt,
          verdicts
        })
        done.add(consumer)
      } catch (error) {
        ok = false
        log('ERROR', 'inbound consumer failed', { messageId, consumer, error: String(error) })
      }
    }
    if (!ok) return false
    delivered.delete(messageId)
    log('INFO', 'inbound mail handled', { messageId, consumers: [...matched.keys()] })
    return true
  }

  /**
   * The `email.received` handler of the worker's `POST /resend/webhook`: 200 once every matching consumer has handled
   * the message, 500 so Resend retries while one fails or Resend can't be read. A body without an email ID, a receipt
   * time or recipients is logged and acknowledged too: retrying it can't help, and failures can disable the one endpoint.
   */
  function handler(options: InboundOptions) {
    return async (event: ResendWebhook): Promise<Response> => {
      const { email_id: messageId, created_at: receivedAt, to } = (event.data ?? {}) as ReceivedEvent
      if (
        typeof messageId !== 'string' ||
        typeof receivedAt !== 'string' ||
        isNaN(Date.parse(receivedAt)) ||
        !Array.isArray(to) ||
        !to.every((recipient) => typeof recipient === 'string')
      ) {
        log('ERROR', 'malformed email.received', { messageId: typeof messageId === 'string' ? messageId : null })
        return new Response(null, { status: 200 })
      }
      let handling = inFlight.get(messageId)
      if (!handling) {
        handling = dispatch(options, messageId, to, receivedAt).finally(() => inFlight.delete(messageId))
        inFlight.set(messageId, handling)
      }
      const ok = await handling
      return new Response(ok ? null : 'a consumer failed', { status: ok ? 200 : 500 })
    }
  }

  return { onInbound, handler }
}

const router = createInboundRouter()

/** Registers the consumer for recipients matching `recipient`; the first match per recipient wins. */
export const onInbound = router.onInbound
/** The `email.received` handler over every `onInbound` registration. */
export const resendInboundHandler = router.handler
