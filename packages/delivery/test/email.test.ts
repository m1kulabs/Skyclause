import { MessageRejected, SendEmailCommand } from '@aws-sdk/client-sesv2'
import PostalMime from 'postal-mime'
import { describe, expect, test } from 'vitest'
import { createEmailTransport, SesError, type EmailMessage } from '../src/email'

// A double of the SES v2 client: records each SendEmail input and answers like SES.
function sesDouble(
  answer: () => Promise<{ MessageId?: string }> = async () => ({ MessageId: '0108019a5b6f0001-test' })
) {
  const inputs: SendEmailCommand['input'][] = []
  return {
    inputs,
    client: {
      send: async (command: SendEmailCommand) => {
        inputs.push(command.input)
        return answer()
      }
    }
  }
}

const config = {
  configurationSet: 'skyclause-production',
  fromAuth: 'Skyclause <sign-in@notices.skyclause.m1ku.tech>',
  fromNotices: 'Skyclause <notices@notices.skyclause.m1ku.tech>'
}

const notice: EmailMessage = {
  to: 'approver@example.edu.my',
  from: 'notices',
  subject: 'Storm confirmed: Friday practical',
  text: 'Storm confirmed for the Friday practical.\nSkyclause is not a safety or emergency service.',
  headers: {
    'List-Unsubscribe': '<https://app.skyclause.m1ku.tech/u/abc>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  },
  category: 'call',
  idempotencyKey: 'notice:0190f8a2-7c1e-7000-8000-000000000001'
}

async function rawOf(input: SendEmailCommand['input'] | undefined) {
  const data = input?.Content?.Raw?.Data
  if (!data) throw new Error('no raw content')
  return { text: Buffer.from(data).toString('utf8'), parsed: await PostalMime.parse(Buffer.from(data)) }
}

describe('EmailTransport.send', () => {
  test('sends raw MIME with the plain-text part and caller headers through the configuration set', async () => {
    const ses = sesDouble()
    const result = await createEmailTransport({ ses: ses.client, ...config }).send(notice)

    expect(result).toEqual({ providerMessageId: '0108019a5b6f0001-test' })
    expect(ses.inputs).toHaveLength(1)
    const input = ses.inputs[0]
    expect(input?.ConfigurationSetName).toBe('skyclause-production')
    expect(input?.EmailTags).toEqual([
      { Name: 'category', Value: 'call' },
      { Name: 'idempotency_key_sha256', Value: 'a4a73284e22fa0fe18fadab66b8d5e2bfc5505280242b5fa2840cc84f83d8df2' }
    ])
    const { text, parsed } = await rawOf(input)
    expect(parsed.from).toEqual({ name: 'Skyclause', address: 'notices@notices.skyclause.m1ku.tech' })
    expect(parsed.to).toEqual([{ name: '', address: 'approver@example.edu.my' }])
    expect(parsed.subject).toBe('Storm confirmed: Friday practical')
    expect(parsed.text?.replace(/\r\n/g, '\n').trimEnd()).toBe(notice.text)
    expect(parsed.html).toBeUndefined()
    expect(text).toContain('\r\nList-Unsubscribe: <https://app.skyclause.m1ku.tech/u/abc>\r\n')
    expect(text).toContain('\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n')
  })

  test('auth mail with HTML is multipart/alternative and keeps a non-ASCII subject', async () => {
    const ses = sesDouble()
    await createEmailTransport({ ses: ses.client, ...config }).send({
      to: 'student@example.edu.my',
      from: 'auth',
      subject: 'Pautan log masuk — Skyclause',
      text: 'Buka pautan ini untuk log masuk.',
      html: '<p>Buka pautan ini untuk log masuk.</p>',
      replyTo: 'r+token@in.skyclause.m1ku.tech',
      category: 'auth',
      idempotencyKey: 'magic-link:1'
    })

    const { text, parsed } = await rawOf(ses.inputs[0])
    expect(parsed.from?.address).toBe('sign-in@notices.skyclause.m1ku.tech')
    expect(parsed.replyTo).toEqual([{ name: '', address: 'r+token@in.skyclause.m1ku.tech' }])
    expect(parsed.subject).toBe('Pautan log masuk — Skyclause')
    expect(parsed.text?.trimEnd()).toBe('Buka pautan ini untuk log masuk.')
    expect(parsed.html?.trimEnd()).toBe('<p>Buka pautan ini untuk log masuk.</p>')
    expect(text).toContain('multipart/alternative')
    // Headers stay 7-bit: a raw UTF-8 subject would need SMTPUTF8.
    expect(text.split('\r\n\r\n')[0]).toMatch(/^[ -~\r\n\t]*$/)
  })

  test('a line break in an address, subject or header is refused before any SES call', async () => {
    const ses = sesDouble()
    const transport = createEmailTransport({ ses: ses.client, ...config })
    for (const bad of [
      { ...notice, to: 'a@example.com\r\nBcc: b@example.com' },
      { ...notice, subject: 'Hi\r\nBcc: b@example.com' },
      { ...notice, headers: { 'X-Note': 'ok\nBcc: b@example.com' } },
      { ...notice, headers: { 'Bcc: b@example.com\r\nX': 'y' } }
    ]) {
      await expect(transport.send(bad)).rejects.toThrow(/line break|header name/)
    }
    expect(ses.inputs).toHaveLength(0)
  })

  test('caller headers cannot replace the ones the transport writes', async () => {
    const ses = sesDouble()
    const send = createEmailTransport({ ses: ses.client, ...config }).send({
      ...notice,
      headers: { from: 'x@evil.example' }
    })
    await expect(send).rejects.toThrow(/from is set by the transport/)
    expect(ses.inputs).toHaveLength(0)
  })

  test('an answer without a message ID is an error, since the outbox stores the ID', async () => {
    const ses = sesDouble(async () => ({}))
    await expect(createEmailTransport({ ses: ses.client, ...config }).send(notice)).rejects.toThrow(
      'SES SendEmail returned no MessageId'
    )
  })

  test('an SES error surfaces as a typed error naming SES and the status', async () => {
    const rejected = new MessageRejected({
      message: 'Email address is not verified.',
      $metadata: { httpStatusCode: 400, requestId: 'req-1' }
    })
    const ses = sesDouble(async () => {
      throw rejected
    })
    const error = await createEmailTransport({ ses: ses.client, ...config })
      .send(notice)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SesError)
    expect(error).toMatchObject({ status: 400, code: 'MessageRejected', cause: rejected })
    expect((error as Error).message).toBe('SES SendEmail failed: MessageRejected (HTTP 400)')
  })

  test('a failure with no HTTP response is an SES error with no status', async () => {
    const ses = sesDouble(async () => {
      throw new TypeError('fetch failed')
    })
    const error = await createEmailTransport({ ses: ses.client, ...config })
      .send(notice)
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status: null, code: 'TypeError' })
    expect((error as Error).message).toBe('SES SendEmail failed: TypeError (no HTTP response)')
  })
})
