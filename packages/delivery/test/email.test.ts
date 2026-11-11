import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { createEmailTransport, EmailSendError, type EmailMessage } from '../src/email'

// A double of Resend's API: records each request and answers like `POST /emails`. The success body is the one in
// https://resend.com/docs/api-reference/emails/send-email.md
function resendDouble(
  answer: () => Promise<Response> = async () => Response.json({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })
) {
  const requests: Array<{ url: string; method?: string; headers: Headers; body: string }> = []
  return {
    requests,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method,
        headers: new Headers(init?.headers),
        body: String(init?.body)
      })
      return answer()
    }) as typeof fetch
  }
}

const config = {
  apiKey: 're_test_sending_only',
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

describe('EmailTransport.send', () => {
  test('posts a plain notice to Resend with its one-click headers and category tag, and returns Resend’s ID', async () => {
    const resend = resendDouble()
    const result = await createEmailTransport({ ...config, fetch: resend.fetch }).send(notice)

    expect(result).toEqual({ providerMessageId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })
    expect(resend.requests).toHaveLength(1)
    const request = resend.requests[0]!
    expect(request.url).toBe('https://api.resend.com/emails')
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe('Bearer re_test_sending_only')
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.headers.get('user-agent')).toBeTruthy()
    expect(JSON.parse(request.body)).toEqual({
      from: 'Skyclause <notices@notices.skyclause.m1ku.tech>',
      to: 'approver@example.edu.my',
      subject: 'Storm confirmed: Friday practical',
      text: 'Storm confirmed for the Friday practical.\nSkyclause is not a safety or emergency service.',
      headers: {
        'List-Unsubscribe': '<https://app.skyclause.m1ku.tech/u/abc>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      tags: [{ name: 'category', value: 'call' }]
    })
  })

  test('auth mail with HTML and a reply-to sends both bodies, and a non-ASCII subject as it is', async () => {
    const resend = resendDouble()
    await createEmailTransport({ ...config, fetch: resend.fetch }).send({
      to: 'student@example.edu.my',
      from: 'auth',
      subject: 'Pautan log masuk — Skyclause',
      text: 'Buka pautan ini untuk log masuk.',
      html: '<p>Buka pautan ini untuk log masuk.</p>',
      replyTo: 'r+token@in.skyclause.m1ku.tech',
      category: 'auth',
      idempotencyKey: 'magic-link:1'
    })

    expect(JSON.parse(resend.requests[0]!.body)).toEqual({
      from: 'Skyclause <sign-in@notices.skyclause.m1ku.tech>',
      to: 'student@example.edu.my',
      subject: 'Pautan log masuk — Skyclause',
      text: 'Buka pautan ini untuk log masuk.',
      html: '<p>Buka pautan ini untuk log masuk.</p>',
      reply_to: 'r+token@in.skyclause.m1ku.tech',
      tags: [{ name: 'category', value: 'auth' }]
    })
  })

  test('auth mail comes from EMAIL_FROM_AUTH, notices and system mail from EMAIL_FROM_NOTICES, display name kept', async () => {
    for (const [from, sender] of [
      ['auth', 'Skyclause <sign-in@notices.skyclause.m1ku.tech>'],
      ['notices', 'Skyclause <notices@notices.skyclause.m1ku.tech>'],
      ['system', 'Skyclause <notices@notices.skyclause.m1ku.tech>']
    ] as const) {
      const resend = resendDouble()
      await createEmailTransport({ ...config, fetch: resend.fetch }).send({ ...notice, from })
      expect(JSON.parse(resend.requests[0]!.body).from).toBe(sender)
    }
  })

  // #653 Sending: the key covers the body too, since the notice sender mints new links on every claim and Resend
  // answers 409 to a known key with a different body.
  test('Idempotency-Key is the SHA-256 hex of the message’s key and the request body', async () => {
    const resend = resendDouble()
    const transport = createEmailTransport({ ...config, fetch: resend.fetch })
    await transport.send(notice)
    await transport.send(notice)
    await transport.send({ ...notice, text: `${notice.text}\nhttps://app.skyclause.m1ku.tech/subscribe/new-token` })
    await transport.send({ ...notice, idempotencyKey: 'notice:0190f8a2-7c1e-7000-8000-000000000002' })

    const [first, again, changed, other] = resend.requests.map((r) => r.headers.get('idempotency-key'))
    const { body } = resend.requests[0]!
    expect(first).toBe(createHash('sha256').update(`${notice.idempotencyKey}\n${body}`).digest('hex'))
    expect(again).toBe(first)
    expect(changed).toMatch(/^[0-9a-f]{64}$/)
    expect(changed).not.toBe(first)
    expect(other).not.toBe(first)
  })

  test('a line break in an address, subject or header is refused before any request', async () => {
    const resend = resendDouble()
    const transport = createEmailTransport({ ...config, fetch: resend.fetch })
    for (const bad of [
      { ...notice, to: 'a@example.com\r\nBcc: b@example.com' },
      { ...notice, replyTo: 'r+token@in.skyclause.m1ku.tech\nBcc: b@example.com' },
      { ...notice, subject: 'Hi\r\nBcc: b@example.com' },
      { ...notice, headers: { 'X-Note': 'ok\nBcc: b@example.com' } },
      { ...notice, headers: { 'Bcc: b@example.com\r\nX': 'y' } }
    ]) {
      await expect(transport.send(bad)).rejects.toThrow(/line break|header name/)
    }
    expect(resend.requests).toHaveLength(0)
  })

  test('caller headers cannot replace the ones the transport writes', async () => {
    const resend = resendDouble()
    const transport = createEmailTransport({ ...config, fetch: resend.fetch })
    for (const name of ['from', 'Reply-To', 'Subject', 'Content-Type']) {
      await expect(transport.send({ ...notice, headers: { [name]: 'x@evil.example' } })).rejects.toThrow(
        `${name} is set by the transport`
      )
    }
    expect(resend.requests).toHaveLength(0)
  })

  test('an answer without an email ID is an error, since the outbox stores the ID', async () => {
    const resend = resendDouble(async () => Response.json({}))
    await expect(createEmailTransport({ ...config, fetch: resend.fetch }).send(notice)).rejects.toThrow(
      'Resend returned no email id'
    )
  })

  // Error bodies are `{statusCode, message, name}`; names, statuses and messages from
  // https://resend.com/docs/api-reference/errors.md
  const refusal = (statusCode: number, name: string, message: string) => async () =>
    Response.json({ statusCode, message, name }, { status: statusCode })

  async function failure(answer: () => Promise<Response>) {
    const resend = resendDouble(answer)
    return createEmailTransport({ ...config, fetch: resend.fetch })
      .send(notice)
      .catch((caught: unknown) => caught)
  }

  test('a 4xx is a permanent send error with the status, Resend’s error name and its message', async () => {
    const domain = 'The `domain.com` domain is not verified. Please, add and verify your domain.'
    const error = await failure(refusal(403, 'validation_error', domain))

    expect(error).toBeInstanceOf(EmailSendError)
    expect(error).toMatchObject({ status: 403, code: 'validation_error', retryable: false })
    expect((error as Error).message).toBe('Resend send failed: validation_error (HTTP 403)')
    expect(((error as Error).cause as Error).message).toBe(domain)

    for (const [status, name, message] of [
      [400, 'validation_error', 'An error was found with one or more fields in the request.'],
      [401, 'validation_error', 'API key is invalid'],
      [
        409,
        'invalid_idempotent_request',
        "This idempotency key has been used with this HTTP method and endpoint within the last 24 hours, but the request body was modified and doesn't match the original request."
      ]
    ] as const) {
      expect(await failure(refusal(status, name, message))).toMatchObject({ status, code: name, retryable: false })
    }
  })

  test('throttling, a server error and a request still in flight are retryable', async () => {
    for (const [status, name, message] of [
      [
        429,
        'rate_limit_exceeded',
        'Too many requests. Please limit the number of requests per second. Or contact support to increase rate limit.'
      ],
      [429, 'daily_quota_exceeded', 'You have exceeded your daily email sending quota.'],
      [500, 'application_error', 'An unexpected error occurred.'],
      [503, 'service_unavailable', 'API is temporarily unavailable'],
      [409, 'concurrent_idempotent_requests', 'There is another request in progress with the same idempotency key.']
    ] as const) {
      const error = await failure(refusal(status, name, message))
      expect(error).toBeInstanceOf(EmailSendError)
      expect(error).toMatchObject({ status, code: name, retryable: true })
    }
  })

  test('an error answer that isn’t Resend’s JSON keeps its status, and a 5xx stays retryable', async () => {
    const error = await failure(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    expect(error).toMatchObject({ status: 502, code: 'unknown', retryable: true })
    expect((error as Error).message).toBe('Resend send failed: unknown (HTTP 502)')
  })

  test('a failure with no HTTP response is a retryable send error with no status', async () => {
    const cause = new TypeError('fetch failed')
    const error = await failure(async () => Promise.reject(cause))

    expect(error).toBeInstanceOf(EmailSendError)
    expect(error).toMatchObject({ status: null, code: 'TypeError', retryable: true, cause })
    expect((error as Error).message).toBe('Resend send failed: TypeError (no HTTP response)')
  })
})
