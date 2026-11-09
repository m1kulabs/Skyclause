// #158: the worker's `/ses/events` route (NTC-10). SES publishes the configuration set's events to SNS
// `SES_EVENTS_SNS_TOPIC_ARN`; the route checks each message's signature by AWS's steps and hands Delivery, Permanent
// Bounce and Complaint events to `apply`. Signed doubles in the shape of AWS's event-publishing examples, until a
// production capture replaces them (#113).
import { describe, expect, test, vi } from 'vitest'
import { parseSesEvent, sesEventsHandler, type SesEvent } from '../src/ses-events'
import { certificates, certUrl, region, signed } from './sns-double'

const topicArn = 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events'
const messageId = '010801a1ae506e3b-9bc1ec93-b865-4aad-8783-c8375ba00353-000000'
const recipient = 'subscriber@example.test'

const mail = {
  timestamp: '2026-11-09T07:08:00.000Z',
  source: 'Skyclause <notices@notices.skyclause.m1ku.tech>',
  sendingAccountId: '776566309118',
  messageId,
  destination: [recipient],
  tags: { category: ['call'] }
}

/** An SES event as SNS delivers it, signed like SNS's SignatureVersion 2. */
export function sesEvent(event: Record<string, unknown>, sns: Record<string, string> = {}) {
  return signed({
    Type: 'Notification',
    TopicArn: topicArn,
    Message: JSON.stringify({ mail, ...event }),
    ...sns
  })
}

const delivery = { eventType: 'Delivery', delivery: { timestamp: '2026-11-09T07:08:02.000Z', recipients: [recipient] } }
const bounce = (bounceType: string) => ({
  eventType: 'Bounce',
  bounce: {
    bounceType,
    bounceSubType: 'General',
    bouncedRecipients: [{ emailAddress: recipient, action: 'failed', status: '5.1.1' }],
    timestamp: '2026-11-09T07:08:03.000Z'
  }
})
const complaint = {
  eventType: 'Complaint',
  complaint: { complainedRecipients: [{ emailAddress: recipient }], timestamp: '2026-11-09T09:00:00.000Z' }
}

function route(o: { fetch?: typeof fetch; recorded?: boolean } = {}) {
  const applied: SesEvent[] = []
  const handle = sesEventsHandler({
    topicArn,
    region,
    certificate: certificates,
    fetch: o.fetch,
    apply: async (event) => (applied.push(event), o.recorded ?? true)
  })
  const post = (body: unknown) =>
    handle(new Request('https://worker.test/ses/events', { method: 'POST', body: JSON.stringify(body) }))
  return { applied, post }
}

describe('parseSesEvent', () => {
  test('reads Delivery, Permanent Bounce and Complaint, with the provider message ID and recipients', () => {
    const parse = (event: object) => parseSesEvent(JSON.stringify({ mail, ...event }))
    expect(parse(delivery)).toEqual({
      type: 'delivery',
      providerMessageId: messageId,
      category: 'call',
      recipients: [recipient]
    })
    expect(parse(bounce('Permanent'))).toEqual({
      type: 'bounce',
      providerMessageId: messageId,
      category: 'call',
      recipients: [recipient]
    })
    expect(parse(complaint)).toEqual({
      type: 'complaint',
      providerMessageId: messageId,
      category: 'call',
      recipients: [recipient]
    })
  })

  test('an untagged message has no category', () => {
    const untagged = { ...mail, tags: undefined }
    expect(parseSesEvent(JSON.stringify({ ...delivery, mail: untagged }))?.category).toBeNull()
  })

  test('ignores transient and undetermined bounces and the other event types', () => {
    const parse = (event: object) => parseSesEvent(JSON.stringify({ mail, ...event }))
    expect(parse(bounce('Transient'))).toBeNull()
    expect(parse(bounce('Undetermined'))).toBeNull()
    for (const eventType of ['Send', 'Reject', 'DeliveryDelay', 'Open', 'Click']) {
      expect(parse({ eventType })).toBeNull()
    }
  })
})

describe('POST /ses/events', () => {
  test('hands a signed Permanent bounce to apply and answers 204', async () => {
    const { applied, post } = route()
    const response = await post(sesEvent(bounce('Permanent')))
    expect(response.status).toBe(204)
    expect(applied).toEqual([
      { type: 'bounce', providerMessageId: messageId, category: 'call', recipients: [recipient] }
    ])
  })

  test('refuses a forged signature, another topic and a certificate off SNS’s host, applying nothing', async () => {
    const { applied, post } = route()
    const forged = { ...sesEvent(delivery), Message: JSON.stringify({ mail, ...complaint }) }
    const otherTopic = sesEvent(delivery, {
      TopicArn: 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound'
    })
    const offHost = sesEvent(delivery, {
      SigningCertURL: 'https://sns.ap-southeast-2.amazonaws.com.attacker.example/cert.pem'
    })
    const otherRegion = sesEvent(delivery, { SigningCertURL: certUrl.replace('ap-southeast-2', 'us-east-1') })
    for (const body of [forged, otherTopic, offHost, otherRegion, { Type: 'Notification' }]) {
      expect((await post(body)).status).toBe(403)
    }
    expect(applied).toEqual([])
  })

  test('answers 503, so SNS retries, while apply can’t find the send yet', async () => {
    const { post } = route({ recorded: false })
    expect((await post(sesEvent(delivery))).status).toBe(503)
  })

  test('a transient bounce changes nothing', async () => {
    const { applied, post } = route()
    expect((await post(sesEvent(bounce('Transient')))).status).toBe(204)
    expect(applied).toEqual([])
  })

  test('confirms the subscription only for the events topic and an SNS SubscribeURL', async () => {
    const fetch = vi.fn(async () => new Response('<ConfirmSubscriptionResponse/>'))
    const { post } = route({ fetch: fetch as unknown as typeof globalThis.fetch })
    const subscribeUrl = `https://sns.${region}.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=t`
    const confirm = (fields: Record<string, string>) =>
      signed({
        Type: 'SubscriptionConfirmation',
        TopicArn: topicArn,
        Message: 'You have chosen to subscribe to the topic.',
        SubscribeURL: subscribeUrl,
        Token: 't',
        ...fields
      })

    expect((await post(confirm({}))).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(subscribeUrl, { redirect: 'error' })

    const other = confirm({ TopicArn: 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound' })
    expect((await post(other)).status).toBe(403)
    expect((await post(confirm({ SubscribeURL: 'https://attacker.example/confirm' }))).status).toBe(403)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('answers 400 to a body that isn’t JSON', async () => {
    const apply = vi.fn()
    const handle = sesEventsHandler({ topicArn, region, certificate: certificates, apply })
    const response = await handle(new Request('https://worker.test/ses/events', { method: 'POST', body: 'not json' }))
    expect(response.status).toBe(400)
    expect(apply).not.toHaveBeenCalled()
  })
})
