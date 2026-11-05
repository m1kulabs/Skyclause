import { DeleteObjectCommand, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3'
import { describe, expect, test } from 'vitest'
import { createInboundRouter, type InboundMessage } from '../src/inbound'
import { certificates, region, signed, topicArn } from './sns-double'

const bucket = 'skyclause-production-inbound-776566309118'

// A double of the inbound bucket: objects by key, every command recorded.
function bucketDouble(objects: Record<string, string>) {
  const commands: Array<{ type: 'get' | 'delete'; key: string }> = []
  const store = new Map(Object.entries(objects))
  return {
    commands,
    store,
    client: {
      send: async (command: GetObjectCommand | DeleteObjectCommand) => {
        const key = command.input.Key ?? ''
        expect(command.input.Bucket).toBe(bucket)
        if (command instanceof DeleteObjectCommand) {
          commands.push({ type: 'delete', key })
          store.delete(key)
          return {}
        }
        commands.push({ type: 'get', key })
        const raw = store.get(key)
        if (raw === undefined) throw new NoSuchKey({ message: 'The specified key does not exist.', $metadata: {} })
        return { Body: { transformToByteArray: async () => new TextEncoder().encode(raw) } }
      }
    }
  }
}

function rawMail(to: string, subject: string, body: string) {
  return [
    'From: Lecturer <lecturer@example.edu.my>',
    `To: ${to}`,
    `Subject: ${subject}`,
    'Date: Fri, 06 Nov 2026 18:00:00 +0800',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
    ''
  ].join('\r\n')
}

// SES's "Received" notification for the S3 action, as in AWS's notification contents reference.
function received(messageId: string, recipients: string[], verdicts: { spam?: string; virus?: string } = {}) {
  return signed({
    Type: 'Notification',
    MessageId: `sns-${messageId}`,
    Subject: 'Amazon SES Email Receipt Notification',
    Message: JSON.stringify({
      notificationType: 'Received',
      mail: {
        timestamp: '2026-11-06T10:00:00.000Z',
        source: 'lecturer@example.edu.my',
        messageId,
        destination: recipients
      },
      receipt: {
        timestamp: '2026-11-06T10:00:01.000Z',
        recipients,
        spamVerdict: { status: verdicts.spam ?? 'PASS' },
        virusVerdict: { status: verdicts.virus ?? 'PASS' },
        spfVerdict: { status: 'PASS' },
        dkimVerdict: { status: 'GRAY' },
        dmarcVerdict: { status: 'PASS' },
        action: { type: 'S3', topicArn, bucketName: bucket, objectKey: messageId }
      }
    })
  })
}

function setup(objects: Record<string, string>) {
  const s3 = bucketDouble(objects)
  const router = createInboundRouter()
  const evidence: InboundMessage[] = []
  const replies: InboundMessage[] = []
  router.onInbound(/^[a-z0-9-]+\.[a-z0-9-]+@in\.skyclause\.m1ku\.tech$/, 'evidence', async (m) => {
    evidence.push(m)
  })
  router.onInbound(/^r\+[A-Za-z0-9_-]+@in\.skyclause\.m1ku\.tech$/, 'crowd-replies', async (m) => {
    replies.push(m)
  })
  const confirmed: string[] = []
  const handle = router.handler({
    topicArn,
    bucket,
    region,
    s3: s3.client,
    certificate: certificates,
    fetch: async (url) => {
      confirmed.push(String(url))
      return new Response('<ConfirmSubscriptionResponse/>')
    }
  })
  const post = (body: unknown) =>
    handle(new Request('https://worker.example/ses/inbound', { method: 'POST', body: JSON.stringify(body) }))
  return { s3, evidence, replies, confirmed, post }
}

describe('/ses/inbound', () => {
  test('an evidence message reaches its consumer once, even when SNS redelivers, and its object goes', async () => {
    const t = setup({
      'msg-evidence': rawMail('upm.haze-2026@in.skyclause.m1ku.tech', 'Photo of the field', 'Flooded.')
    })
    const notification = received('msg-evidence', ['upm.haze-2026@in.skyclause.m1ku.tech'])

    expect((await t.post(notification)).status).toBe(204)
    expect((await t.post(notification)).status).toBe(204)

    expect(t.evidence).toEqual([
      {
        recipient: 'upm.haze-2026@in.skyclause.m1ku.tech',
        from: 'lecturer@example.edu.my',
        subject: 'Photo of the field',
        text: 'Flooded.\n',
        messageId: 'msg-evidence',
        receivedAt: '2026-11-06T10:00:01.000Z',
        verdicts: { spf: 'PASS', dkim: 'GRAY', spam: 'PASS', virus: 'PASS' }
      }
    ])
    expect(t.replies).toEqual([])
    expect(t.s3.store.has('msg-evidence')).toBe(false)
  })

  test('a reply to r+{token} reaches the replies consumer once', async () => {
    const t = setup({ 'msg-reply': rawMail('r+tok_9f3a@in.skyclause.m1ku.tech', 'Re: Surge night', 'We moved it.') })
    const notification = received('msg-reply', ['r+tok_9f3a@in.skyclause.m1ku.tech'])

    await t.post(notification)
    await t.post(notification)

    expect(t.replies.map((m) => [m.recipient, m.text])).toEqual([
      ['r+tok_9f3a@in.skyclause.m1ku.tech', 'We moved it.\n']
    ])
    expect(t.evidence).toEqual([])
  })

  test('a virus FAIL is dropped and its object deleted', async () => {
    const t = setup({ 'msg-virus': rawMail('upm.haze-2026@in.skyclause.m1ku.tech', 'Invoice', 'Open the attachment.') })

    const res = await t.post(received('msg-virus', ['upm.haze-2026@in.skyclause.m1ku.tech'], { virus: 'FAIL' }))

    expect(res.status).toBe(204)
    expect(t.evidence).toEqual([])
    expect(t.s3.commands).toEqual([{ type: 'delete', key: 'msg-virus' }])
  })

  test('a spam FAIL is dropped too', async () => {
    const t = setup({ 'msg-spam': rawMail('upm.haze-2026@in.skyclause.m1ku.tech', 'Win', 'Prize.') })
    await t.post(received('msg-spam', ['upm.haze-2026@in.skyclause.m1ku.tech'], { spam: 'FAIL' }))
    expect(t.evidence).toEqual([])
    expect(t.s3.store.has('msg-spam')).toBe(false)
  })

  test('a tampered signature, wrong topic or non-AWS certificate URL is 403 and dispatches nothing', async () => {
    const t = setup({ 'msg-1': rawMail('upm.haze-2026@in.skyclause.m1ku.tech', 'Photo', 'x') })
    const good = received('msg-1', ['upm.haze-2026@in.skyclause.m1ku.tech'])
    const tampered = { ...good, Message: good.Message?.replace('upm.haze-2026', 'upm.other') }
    const otherTopic = signed({ Type: 'Notification', Message: good.Message ?? '', TopicArn: `${topicArn}-other` })
    const foreignCert = signed({
      Type: 'Notification',
      Message: good.Message ?? '',
      SigningCertURL: 'https://evil.example/SimpleNotificationService-1.pem'
    })

    for (const body of [tampered, otherTopic, foreignCert]) expect((await t.post(body)).status).toBe(403)

    expect(t.evidence).toEqual([])
    expect(t.s3.commands).toEqual([])
  })

  test('a subscription confirmation is confirmed at its SNS SubscribeURL', async () => {
    const t = setup({})
    const subscribeUrl = `https://sns.${region}.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=abc`
    const res = await t.post(
      signed({ Type: 'SubscriptionConfirmation', Message: 'Confirm', Token: 'abc', SubscribeURL: subscribeUrl })
    )
    expect(res.status).toBe(200)
    expect(t.confirmed).toEqual([subscribeUrl])
  })

  test("SES's setup notification is acknowledged and touches nothing", async () => {
    const t = setup({})
    const res = await t.post(
      signed({
        Type: 'Notification',
        Message: JSON.stringify({ notificationType: 'AMAZON_SES_SETUP_NOTIFICATION', receipt: {} })
      })
    )
    expect(res.status).toBe(204)
    expect(t.s3.commands).toEqual([])
  })

  test('after a consumer fails, the redelivery retries only that consumer and keeps the object until then', async () => {
    const s3 = bucketDouble({
      'msg-both': rawMail('upm.haze-2026@in.skyclause.m1ku.tech, r+tok@in.skyclause.m1ku.tech', 'Both', 'x')
    })
    const router = createInboundRouter()
    const calls: string[] = []
    let failReplies = true
    router.onInbound(/^[a-z0-9-]+\.[a-z0-9-]+@in\./, 'evidence', async () => {
      calls.push('evidence')
    })
    router.onInbound(/^r\+/, 'crowd-replies', async () => {
      calls.push('replies')
      if (failReplies) throw new Error('database asleep')
    })
    const handle = router.handler({ topicArn, bucket, region, s3: s3.client, certificate: certificates })
    const notification = JSON.stringify(
      received('msg-both', ['upm.haze-2026@in.skyclause.m1ku.tech', 'r+tok@in.skyclause.m1ku.tech'])
    )
    const post = () => handle(new Request('https://worker.example/ses/inbound', { method: 'POST', body: notification }))

    expect((await post()).status).toBe(500)
    expect(s3.store.has('msg-both')).toBe(true)
    failReplies = false
    expect((await post()).status).toBe(204)

    expect(calls).toEqual(['evidence', 'replies', 'replies'])
    expect(s3.store.has('msg-both')).toBe(false)
  })

  test('two copies of one notification arriving together reach the consumer once', async () => {
    const t = setup({ 'msg-twice': rawMail('upm.haze-2026@in.skyclause.m1ku.tech', 'Photo', 'Twice.') })
    const notification = received('msg-twice', ['upm.haze-2026@in.skyclause.m1ku.tech'])

    const statuses = await Promise.all([t.post(notification), t.post(notification)])

    expect(statuses.map((res) => res.status)).toEqual([204, 204])
    expect(t.evidence).toHaveLength(1)
  })
})
