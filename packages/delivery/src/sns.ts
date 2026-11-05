// SNS message verification for the worker's /ses/* routes, which Google OIDC doesn't cover (spec §4).
import { createVerify } from 'node:crypto'

export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation'
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  Subject?: string
  SubscribeURL?: string
  Token?: string
}

export interface VerifyOptions {
  /** The only topic accepted, e.g. `INBOUND_SNS_TOPIC_ARN`. */
  topicArn: string
  /** `SES_REGION`: the certificate must come from SNS in this region. */
  region: string
  /** Fetches a certificate PEM; defaults to an HTTPS GET, cached per URL. */
  certificate?: (url: string) => Promise<string>
}

export class SnsVerificationError extends Error {
  override name = 'SnsVerificationError'
}

// AWS's "Verifying the signatures of Amazon SNS messages": these fields, in this order, when present.
const SIGNED_FIELDS: Record<SnsMessage['Type'], Array<keyof SnsMessage>> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
}

const certificateCache = new Map<string, Promise<string>>()

async function fetchCertificate(url: string) {
  let pem = certificateCache.get(url)
  if (!pem) {
    pem = fetch(url, { redirect: 'error' }).then(async (response) => {
      if (!response.ok) throw new Error(`SNS certificate fetch failed (HTTP ${response.status})`)
      return response.text()
    })
    certificateCache.set(url, pem)
    pem.catch(() => certificateCache.delete(url))
  }
  return pem
}

/** True when `url` is HTTPS on SNS's own host in `region`. */
export function isSnsUrl(url: string, region: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.host === `sns.${region}.amazonaws.com`
  } catch {
    return false
  }
}

/** Checks a parsed SNS body and returns it typed; throws `SnsVerificationError` otherwise. */
export async function verifySnsMessage(body: unknown, options: VerifyOptions): Promise<SnsMessage> {
  if (typeof body !== 'object' || body === null) throw new SnsVerificationError('not an SNS message')
  const fields = body as Record<string, unknown>
  const type = fields.Type
  if (typeof type !== 'string' || !Object.hasOwn(SIGNED_FIELDS, type)) {
    throw new SnsVerificationError('not an SNS message type')
  }
  if (fields.SignatureVersion !== '2') throw new SnsVerificationError('signature version must be 2')
  if (fields.TopicArn !== options.topicArn) throw new SnsVerificationError('unexpected topic')
  const certUrl = fields.SigningCertURL
  if (typeof certUrl !== 'string' || !isSnsUrl(certUrl, options.region) || !/\.pem$/.test(new URL(certUrl).pathname)) {
    throw new SnsVerificationError('certificate URL is not SNS in this region')
  }
  const signedFields = SIGNED_FIELDS[type as SnsMessage['Type']]
  for (const key of signedFields) {
    const value = fields[key]
    const optional = key === 'Subject'
    if (value === undefined && optional) continue
    if (typeof value !== 'string') throw new SnsVerificationError(`${key} is missing`)
  }
  if (typeof fields.Signature !== 'string') throw new SnsVerificationError('signature is missing')

  const text = signedFields
    .filter((key) => fields[key] !== undefined)
    .map((key) => `${key}\n${fields[key] as string}\n`)
    .join('')
  const pem = await (options.certificate ?? fetchCertificate)(certUrl)
  const valid = createVerify('RSA-SHA256').update(text).verify(pem, fields.Signature, 'base64')
  if (!valid) throw new SnsVerificationError('signature does not match')
  return fields as unknown as SnsMessage
}
