import { createHash } from 'node:crypto'
import { loadEnv } from '@skyclause/config'

/** Spec §1 `EmailTransport.send` input; #87 moves the type to `packages/contracts`. */
export interface EmailMessage {
  to: string
  from: 'auth' | 'notices' | 'system'
  subject: string
  text: string
  html?: string
  replyTo?: string
  headers?: Record<string, string>
  /** The `category` tag's value: ASCII letters, digits, `_` and `-`. */
  category: string
  idempotencyKey: string
}

export interface EmailTransport {
  send(m: EmailMessage): Promise<{ providerMessageId: string }>
}

/**
 * Whether the same send may succeed later: no response, throttling or a quota (429), a server error (5xx), or Resend
 * still running a request with the same idempotency key. Every other 4xx will be refused again.
 */
function isRetryable(status: number | null, code: string) {
  return (
    status === null || status === 429 || status >= 500 || (status === 409 && code === 'concurrent_idempotent_requests')
  )
}

/**
 * A send that failed: `code` is the provider's error name, `status` its HTTP status or null with no response, and
 * `retryable` the transport's verdict on trying again.
 */
export class EmailSendError extends Error {
  readonly status: number | null
  readonly code: string
  readonly retryable: boolean

  constructor(message: string, details: { status: number | null; code: string; cause?: unknown }) {
    super(message, { cause: details.cause })
    this.name = 'EmailSendError'
    this.status = details.status
    this.code = details.code
    this.retryable = isRetryable(details.status, details.code)
  }
}

export interface EmailTransportOptions {
  /** `RESEND_SENDING_API_KEY`: a sending-only key. */
  apiKey: string
  /** `EMAIL_FROM_AUTH`, for `from: 'auth'` */
  fromAuth: string
  /** `EMAIL_FROM_NOTICES`, for `from: 'notices'` and `'system'` */
  fromNotices: string
  /** Tests only. */
  fetch?: typeof fetch
}

const SEND_URL = 'https://api.resend.com/emails'

export function createEmailTransport(options: EmailTransportOptions): EmailTransport {
  return {
    async send(m) {
      checkHeaders(m)
      const body = JSON.stringify({
        from: m.from === 'auth' ? options.fromAuth : options.fromNotices,
        to: m.to,
        subject: m.subject,
        text: m.text,
        ...(m.html !== undefined && { html: m.html }),
        ...(m.replyTo && { reply_to: m.replyTo }),
        ...(m.headers && { headers: m.headers }),
        tags: [{ name: 'category', value: m.category }]
      })
      let response: Response
      try {
        response = await (options.fetch ?? fetch)(SEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            // Resend refuses a request without one.
            'User-Agent': 'skyclause',
            // Over the body too: a retry with the same content is deduplicated for 24 hours, while new content (fresh
            // links after a reclaim) is a new send rather than Resend's 409 for a known key with another body. JSON
            // holds no raw line break, so the newline separates the two unambiguously.
            'Idempotency-Key': createHash('sha256').update(`${m.idempotencyKey}\n${body}`).digest('hex')
          },
          body
        })
      } catch (error) {
        const code = error instanceof Error ? error.name : 'Unknown'
        throw new EmailSendError(`Resend send failed: ${code} (no HTTP response)`, { status: null, code, cause: error })
      }
      // `{id}` on success, `{statusCode, message, name}` on an error.
      const answer = (await response.json().catch(() => ({}))) as { id?: unknown; name?: unknown; message?: unknown }
      if (!response.ok) {
        const code = typeof answer.name === 'string' ? answer.name : 'unknown'
        const cause = typeof answer.message === 'string' ? new Error(answer.message) : undefined
        throw new EmailSendError(`Resend send failed: ${code} (HTTP ${response.status})`, {
          status: response.status,
          code,
          cause
        })
      }
      if (typeof answer.id !== 'string' || !answer.id) throw new Error('Resend returned no email id')
      return { providerMessageId: answer.id }
    }
  }
}

const built: Partial<Record<'web' | 'worker', EmailTransport>> = {}

/**
 * The production transport for `service`, built from its environment on first use; null while its sending variables
 * are unset and mail is off. The one place that reads them.
 */
export function emailTransportFromEnv(service: 'web' | 'worker'): EmailTransport | null {
  if (built[service]) return built[service]
  const { RESEND_SENDING_API_KEY, EMAIL_FROM_AUTH, EMAIL_FROM_NOTICES } = loadEnv(service)
  if (!RESEND_SENDING_API_KEY || !EMAIL_FROM_AUTH || !EMAIL_FROM_NOTICES) return null
  return (built[service] = createEmailTransport({
    apiKey: RESEND_SENDING_API_KEY,
    fromAuth: EMAIL_FROM_AUTH,
    fromNotices: EMAIL_FROM_NOTICES
  }))
}

/** `emailTransportFromEnv`, refusing while mail is off. */
export function requireEmailTransport(service: 'web' | 'worker'): EmailTransport {
  const transport = emailTransportFromEnv(service)
  if (!transport)
    throw new Error('email is off: RESEND_SENDING_API_KEY, EMAIL_FROM_AUTH and EMAIL_FROM_NOTICES are unset')
  return transport
}

const RESERVED = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'reply-to',
  'subject',
  'date',
  'mime-version',
  'content-type',
  'content-transfer-encoding'
])

function checkHeaders(m: EmailMessage) {
  for (const [field, value] of [
    ['to', m.to],
    ['replyTo', m.replyTo ?? ''],
    ['subject', m.subject],
    ...Object.entries(m.headers ?? {})
  ]) {
    if (/[\r\n]/.test(value ?? '')) throw new Error(`${field} holds a line break`)
  }
  for (const [name, value] of Object.entries(m.headers ?? {})) {
    if (!/^[!-9;-~]+$/.test(name)) throw new Error(`invalid header name ${JSON.stringify(name)}`)
    if (RESERVED.has(name.toLowerCase())) throw new Error(`${name} is set by the transport`)
    if (!/^[\x20-\x7e\t]*$/.test(value)) throw new Error(`${name} must be ASCII`)
  }
}
