import { createHash, randomUUID } from 'node:crypto'
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'
import { webIdentityCredentials } from './aws-credentials'

/** Spec §1 `EmailTransport.send` input; #87 moves the type to `packages/contracts`. */
export interface EmailMessage {
  to: string
  from: 'auth' | 'notices' | 'system'
  subject: string
  text: string
  html?: string
  replyTo?: string
  headers?: Record<string, string>
  /** SES tag value: ASCII letters, digits, `_` and `-`. */
  category: string
  idempotencyKey: string
}

export interface EmailTransport {
  send(m: EmailMessage): Promise<{ providerMessageId: string }>
}

/** A failed SES call: `code` is SES's error name, `status` its HTTP status or null with no response. */
export class SesError extends Error {
  readonly status: number | null
  readonly code: string

  constructor(operation: string, cause: unknown) {
    const code = cause instanceof Error ? cause.name : 'Unknown'
    const status = (cause as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode ?? null
    super(`SES ${operation} failed: ${code} (${status === null ? 'no HTTP response' : `HTTP ${status}`})`, { cause })
    this.name = 'SesError'
    this.status = status
    this.code = code
  }
}

/** The part of the SES v2 client the transport uses. */
export interface SesClient {
  send(command: SendEmailCommand): Promise<{ MessageId?: string }>
}

export interface EmailTransportOptions {
  ses: SesClient
  /** `SES_CONFIGURATION_SET` */
  configurationSet: string
  /** `EMAIL_FROM_AUTH`, for `from: 'auth'` */
  fromAuth: string
  /** `EMAIL_FROM_NOTICES`, for `from: 'notices'` and `'system'` */
  fromNotices: string
}

export function createEmailTransport(options: EmailTransportOptions): EmailTransport {
  return {
    async send(m) {
      const from = m.from === 'auth' ? options.fromAuth : options.fromNotices
      const raw = buildMime(m, from)
      const command = new SendEmailCommand({
        // The bare address, so SES authorises the sender (ses:FromAddress, #623) without reading the MIME header.
        FromEmailAddress: /<([^<>]+)>$/.exec(from)?.[1] ?? from,
        Content: { Raw: { Data: raw } },
        ConfigurationSetName: options.configurationSet,
        EmailTags: [
          { Name: 'category', Value: m.category },
          { Name: 'idempotency_key_sha256', Value: createHash('sha256').update(m.idempotencyKey).digest('hex') }
        ]
      })
      let result: { MessageId?: string }
      try {
        result = await options.ses.send(command)
      } catch (error) {
        throw new SesError('SendEmail', error)
      }
      if (!result.MessageId) throw new Error('SES SendEmail returned no MessageId')
      return { providerMessageId: result.MessageId }
    }
  }
}

/** `createEmailTransport` on SES in `region` as `AWS_ROLE_ARN`, with keyless credentials (D42). */
export function emailTransportForAws(
  config: Omit<EmailTransportOptions, 'ses'> & { region: string; roleArn: string }
): EmailTransport {
  const { region, roleArn, ...options } = config
  const ses = new SESv2Client({ region, credentials: webIdentityCredentials({ roleArn, region }) })
  return createEmailTransport({ ...options, ses })
}

const CRLF = '\r\n'
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

/** RFC 2047 encoded words of at most 45 UTF-8 bytes each, folded, for a non-ASCII value. */
function encodeWords(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  const words: string[] = []
  let chunk = ''
  for (const char of value) {
    if (Buffer.byteLength(chunk + char) > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  words.push(chunk)
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`).join(`${CRLF} `)
}

function base64Lines(text: string) {
  return (
    Buffer.from(text, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g) ?? []
  ).join(CRLF)
}

function textPart(type: 'plain' | 'html', body: string) {
  return [`Content-Type: text/${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(body)].join(
    CRLF
  )
}

function alternative(text: string, html: string) {
  const boundary = `skyclause-${randomUUID()}`
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    textPart('plain', text),
    `--${boundary}`,
    textPart('html', html),
    `--${boundary}--`
  ].join(CRLF)
}

function buildMime(m: EmailMessage, from: string): Uint8Array {
  checkHeaders(m)
  const head = [`From: ${from}`, `To: ${m.to}`]
  if (m.replyTo) head.push(`Reply-To: ${m.replyTo}`)
  head.push(`Subject: ${encodeWords(m.subject)}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0')
  for (const [name, value] of Object.entries(m.headers ?? {})) head.push(`${name}: ${value}`)
  const body = m.html === undefined ? textPart('plain', m.text) : alternative(m.text, m.html)
  return new TextEncoder().encode([...head, body].join(CRLF) + CRLF)
}
