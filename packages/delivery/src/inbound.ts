// Inbound mail (D7): SES stores each message for in.skyclause.m1ku.tech in INBOUND_BUCKET and
// announces it on INBOUND_SNS_TOPIC_ARN; the worker's /ses/inbound verifies the notification,
// reads the object, hands it to the matching consumer and deletes it. Bodies and addresses never
// reach the logs.
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { log as sharedLog } from '@skyclause/config'
import PostalMime from 'postal-mime'
import { webIdentityCredentials } from './aws-credentials'
import { isSnsUrl, SnsVerificationError, verifySnsMessage } from './sns'

/** What a consumer receives (spec §1 `onInbound`). */
export interface InboundMessage {
  recipient: string
  from: string
  subject: string
  text: string
  /** SES's message ID, also the object key. */
  messageId: string
  /** When SES received it, RFC 3339. */
  receivedAt: string
  verdicts: Record<'spf' | 'dkim' | 'spam' | 'virus', string>
}

export type InboundHandler = (m: InboundMessage) => Promise<void>

/** The part of the S3 client the handler uses. */
export interface InboundBucket {
  send(
    command: GetObjectCommand | DeleteObjectCommand
  ): Promise<{ Body?: { transformToByteArray(): Promise<Uint8Array> } }>
}

export interface SesInboundOptions {
  /** `INBOUND_SNS_TOPIC_ARN` */
  topicArn: string
  /** `INBOUND_BUCKET` */
  bucket: string
  /** `SES_REGION` */
  region: string
  s3: InboundBucket
  certificate?: (url: string) => Promise<string>
  /** Confirms subscriptions; defaults to the global fetch. */
  fetch?: typeof fetch
}

interface Receipt {
  timestamp: string
  recipients: string[]
  spamVerdict?: { status: string }
  virusVerdict?: { status: string }
  spfVerdict?: { status: string }
  dkimVerdict?: { status: string }
  action?: { type: string; bucketName?: string; objectKey?: string }
}

// The shared logger: redacted and linked to the request's trace (#114, #245).
function log(severity: 'INFO' | 'ERROR', message: string, fields: Record<string, unknown>) {
  if (severity === 'ERROR') sharedLog.error(message, fields)
  else sharedLog.info(message, fields)
}

export function createInboundRouter() {
  const consumers: Array<{ pattern: RegExp; consumer: string; handler: InboundHandler }> = []
  // Consumers already called per SES message ID, so an SNS redelivery after a partial failure
  // doesn't call the ones that succeeded. A finished message is deleted, which stops later ones.
  const delivered = new Map<string, Set<string>>()
  // A copy that arrives while the first is still being handled waits for it instead.
  const inFlight = new Map<string, Promise<boolean>>()

  function onInbound(recipient: RegExp, consumer: string, handler: InboundHandler) {
    if (consumers.some((c) => c.consumer === consumer)) throw new Error(`inbound consumer ${consumer} is registered`)
    consumers.push({ pattern: recipient, consumer, handler })
  }

  async function dispatch(options: SesInboundOptions, receipt: Receipt, messageId: string): Promise<boolean> {
    const s3 = options.s3
    const key = receipt.action?.objectKey
    if (receipt.action?.type !== 'S3' || receipt.action.bucketName !== options.bucket || !key) {
      log('ERROR', 'inbound notification has no object in the inbound bucket', { messageId })
      return true
    }
    const remove = () => s3.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }))
    const verdicts = {
      spf: receipt.spfVerdict?.status ?? 'NONE',
      dkim: receipt.dkimVerdict?.status ?? 'NONE',
      spam: receipt.spamVerdict?.status ?? 'NONE',
      virus: receipt.virusVerdict?.status ?? 'NONE'
    }
    if (verdicts.spam === 'FAIL' || verdicts.virus === 'FAIL') {
      await remove()
      log('INFO', 'inbound mail dropped', { messageId, spam: verdicts.spam, virus: verdicts.virus })
      return true
    }

    let raw: Uint8Array
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }))
      if (!object.Body) throw new Error('inbound object has no body')
      raw = await object.Body.transformToByteArray()
    } catch (error) {
      // Gone: an earlier delivery of this notification finished it.
      if ((error as Error).name === 'NoSuchKey') return true
      throw error
    }
    const mail = await PostalMime.parse(raw)
    const done = delivered.get(messageId) ?? new Set<string>()
    delivered.set(messageId, done)

    let ok = true
    const called = new Set<string>()
    // Matched lower-cased, handed over as received: a reply token in `r+{token}@…` is case-sensitive.
    for (const recipient of receipt.recipients) {
      const match = consumers.find((c) => c.pattern.test(recipient.toLowerCase()))
      if (!match || called.has(match.consumer)) continue
      called.add(match.consumer)
      if (done.has(match.consumer)) continue
      try {
        await match.handler({
          recipient,
          from: mail.from?.address ?? '',
          subject: mail.subject ?? '',
          text: mail.text ?? '',
          messageId,
          receivedAt: receipt.timestamp,
          verdicts
        })
        done.add(match.consumer)
      } catch (error) {
        ok = false
        log('ERROR', 'inbound consumer failed', { messageId, consumer: match.consumer, error: String(error) })
      }
    }
    if (!ok) return false
    await remove()
    delivered.delete(messageId)
    log('INFO', 'inbound mail handled', { messageId, consumers: [...called] })
    return true
  }

  /** The worker's `POST /ses/inbound` route. */
  function handler(options: SesInboundOptions) {
    return async (request: Request): Promise<Response> => {
      let body: unknown
      try {
        body = JSON.parse(await request.text())
      } catch {
        return new Response('malformed SNS message', { status: 400 })
      }
      let message
      try {
        message = await verifySnsMessage(body, options)
      } catch (error) {
        if (error instanceof SnsVerificationError) return new Response(error.message, { status: 403 })
        throw error
      }

      if (message.Type === 'SubscriptionConfirmation') {
        if (!message.SubscribeURL || !isSnsUrl(message.SubscribeURL, options.region)) {
          return new Response('SubscribeURL is not SNS in this region', { status: 403 })
        }
        const confirmation = await (options.fetch ?? fetch)(message.SubscribeURL, { redirect: 'error' })
        if (!confirmation.ok) throw new Error(`SNS ConfirmSubscription failed (HTTP ${confirmation.status})`)
        log('INFO', 'inbound subscription confirmed', { topicArn: message.TopicArn })
        return new Response(null, { status: 200 })
      }
      if (message.Type === 'UnsubscribeConfirmation') return new Response(null, { status: 204 })

      const notification = JSON.parse(message.Message) as {
        notificationType?: string
        mail?: { messageId?: string }
        receipt?: Receipt
      }
      if (notification.notificationType !== 'Received' || !notification.receipt || !notification.mail?.messageId) {
        return new Response(null, { status: 204 })
      }
      const messageId = notification.mail.messageId
      let handling = inFlight.get(messageId)
      if (!handling) {
        handling = dispatch(options, notification.receipt, messageId).finally(() => inFlight.delete(messageId))
        inFlight.set(messageId, handling)
      }
      const ok = await handling
      return new Response(ok ? null : 'a consumer failed', { status: ok ? 204 : 500 })
    }
  }

  return { onInbound, handler }
}

const router = createInboundRouter()

/** Registers the consumer for recipients matching `recipient`; the first match per recipient wins. */
export const onInbound = router.onInbound
/** The worker's `/ses/inbound` route over every `onInbound` registration. */
export const sesInboundHandler = router.handler

/** `sesInboundHandler` reading the bucket as `AWS_ROLE_ARN`, with keyless credentials (D42). */
export function sesInboundForAws(config: { region: string; roleArn: string; topicArn: string; bucket: string }) {
  const { region, roleArn, topicArn, bucket } = config
  const s3 = new S3Client({ region, credentials: webIdentityCredentials({ roleArn, region }) })
  return sesInboundHandler({ topicArn, bucket, region, s3 })
}
