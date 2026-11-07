import { afterEach, describe, expect, test } from 'bun:test'
import { evidenceGmailPorts } from './evidence-gmail.ts'

const originals = new Map<string, PropertyDescriptor | undefined>()
function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete (globalThis as Record<string, unknown>)[key]
  }
  originals.clear()
})
const encoded = (value: string) => Buffer.from(value).toString('base64url')
const text = (value: string, extra = {}) => ({ mimeType: 'text/plain', body: { data: encoded(value) }, ...extra })
function message(extra = {}) {
  return {
    id: 'm1',
    threadId: 't1',
    internalDate: String(Date.parse('2026-11-07T10:00:00.123+08:00')),
    labelIds: ['INBOX'],
    payload: {
      ...text('evidence for 2 Nov 14:00–16:30'),
      headers: [
        { name: 'From', value: 'Requester <requester@example.test>' },
        {
          name: 'Subject',
          value: '=?UTF-8?B?' + Buffer.from('evidence for 2 Nov 14:00–16:30').toString('base64') + '?='
        }
      ]
    },
    ...extra
  }
}
function provider(replies: Array<{ status?: number; body?: unknown; network?: boolean }>) {
  const calls: { url: string; options: Record<string, unknown> }[] = []
  install('Utilities', {
    Charset: { UTF_8: 'UTF-8' },
    base64DecodeWebSafe: (value: string) => [...Buffer.from(value, 'base64url')],
    base64Decode: (value: string) => [...Buffer.from(value, 'base64')],
    base64Encode: (value: string) => Buffer.from(value).toString('base64'),
    base64EncodeWebSafe: (value: string) => encoded(value),
    newBlob: (bytes: number[]) => ({
      getDataAsString: (charset: string) =>
        Buffer.from(bytes).toString(charset.toLowerCase() === 'iso-8859-1' ? 'latin1' : 'utf8')
    })
  })
  install('ScriptApp', { getOAuthToken: () => 'test-only-token' })
  install('UrlFetchApp', {
    fetch: (url: string, options: Record<string, unknown>) => {
      calls.push({ url, options })
      const reply = replies.shift()
      if (!reply) throw new Error('unexpected request')
      if (reply.network) throw new Error('transport 404 private detail')
      return { getResponseCode: () => reply.status ?? 200, getContentText: () => JSON.stringify(reply.body ?? {}) }
    }
  })
  return calls
}

describe('native evidence Gmail protocol', () => {
  test('constructs lazily and lists bounded ID-only pages with exact-bound superset seconds and page token', () => {
    const ports = evidenceGmailPorts()
    const calls = provider([{ body: { messages: [{ id: 'm1' }], nextPageToken: 'next' } }])
    expect(
      ports.listMessages({
        activatedAt: '2026-11-07T10:00:00.123+08:00',
        lowerBound: '2026-11-07T10:00:00.123+08:00',
        upperBound: '2026-11-07T10:00:01.456+08:00',
        pageToken: 'page /?'
      })
    ).toEqual({ messageIds: ['m1'], nextPageToken: 'next' })
    const url = new URL(calls[0]!.url)
    expect(url.origin + url.pathname).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    expect(url.searchParams.get('labelIds')).toBe('INBOX')
    expect(url.searchParams.get('maxResults')).toBe('25')
    expect(url.searchParams.get('pageToken')).toBe('page /?')
    expect(url.searchParams.get('q')).toBe('after:1794016799 before:1794016802')
    expect(calls[0]!.options).toEqual({
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer test-only-token' }
    })
  })

  test('uses individual labels/internalDate, RFC2047 subject and plain alternative, ignoring attached text and quotes', () => {
    provider([
      {
        body: message({
          labelIds: ['INBOX', 'SENT'],
          payload: {
            mimeType: 'multipart/alternative',
            headers: message().payload.headers,
            parts: [
              text('unsubscribe', { filename: 'attachment.txt' }),
              { mimeType: 'text/html', body: { data: encoded('<p>unsubscribe</p>') } },
              text('evidence for 2 Nov 14:00–16:30\n\nOn Friday wrote:\n> unsubscribe')
            ]
          }
        })
      }
    ])
    expect(evidenceGmailPorts().message('m1')).toEqual({
      id: 'm1',
      receivedAt: '2026-11-07T10:00:00.123+08:00',
      fromAddress: 'requester@example.test',
      subject: 'evidence for 2 Nov 14:00–16:30',
      body: 'evidence for 2 Nov 14:00–16:30',
      inInbox: true,
      sentByOwner: true,
      mailerDaemon: false
    })
  })

  test('extracts bounded HTML without script/style/quoted markup and decodes Q subjects', () => {
    const msg = message({
      labelIds: [],
      payload: {
        mimeType: 'text/html',
        headers: [
          { name: 'From', value: 'mailer-daemon@example.test' },
          { name: 'Subject', value: '=?UTF-8?Q?call_for_?= =?UTF-8?Q?tomorrow?=' }
        ],
        body: {
          data: encoded(
            '<script>unsubscribe</script><style>x</style><div>call&nbsp;for tomorrow</div><blockquote>unsubscribe</blockquote>'
          )
        }
      }
    })
    provider([{ body: msg }])
    const result = evidenceGmailPorts().message('m1')!
    expect(result.subject).toBe('call for tomorrow')
    expect(result.body).toBe('call for tomorrow')
    expect(result.inInbox).toBe(false)
    expect(result.mailerDaemon).toBe(true)
  })

  test('malformed MIME is an explicit decode error, malformed receipt is an API data error', () => {
    provider([
      { body: message({ payload: { ...message().payload, body: { data: '%%%bad' } } }) },
      { body: message({ internalDate: 'bad' }) }
    ])
    const ports = evidenceGmailPorts()
    expect(ports.message('m1')!.decodeError).toBe('mime_invalid')
    expect(() => ports.message('m1')).toThrow('gmail_invalid_message')
  })

  test('only verified GET 404 means missing; other HTTP/network/list failures stay explicit', () => {
    provider([{ status: 404 }, { status: 404 }, { status: 403 }, { network: true }, { status: 404 }])
    const ports = evidenceGmailPorts()
    expect(ports.message('gone')).toBeNull()
    expect(ports.draft('gone')).toBeNull()
    expect(() => ports.message('m1')).toThrow('gmail_http_403')
    expect(() => ports.draft('d1')).toThrow()
    expect(() =>
      ports.listMessages({
        activatedAt: '2026-11-07T10:00:00+08:00',
        lowerBound: '2026-11-07T10:00:00+08:00',
        upperBound: '2026-11-07T10:00:01+08:00'
      })
    ).toThrow('gmail_http_404')
  })

  test('reads profile and sender metadata only when needed, with encoded resource IDs', () => {
    const calls = provider([
      { body: { emailAddress: 'owner@example.test' } },
      { body: { payload: { headers: [{ name: 'From', value: 'Someone <requester@example.test>' }] } } }
    ])
    const ports = evidenceGmailPorts()
    expect(ports.ownerEmail()).toBe('owner@example.test')
    expect(ports.ownerEmail()).toBe('owner@example.test')
    expect(ports.requesterAddress('id /?')).toBe('requester@example.test')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.url).toContain('/messages/id%20%2F%3F?')
    const url = new URL(calls[1]!.url)
    expect(url.searchParams.get('format')).toBe('metadata')
    expect(url.searchParams.get('metadataHeaders')).toBe('From')
  })

  test('writes authenticated From and the actual injectable clock Date into outgoing MIME', () => {
    const calls = provider([
      { body: { id: 'before-profile-support', emailAddress: 'owner@example.test' } },
      { body: { id: 'container' } }
    ])
    evidenceGmailPorts(() => new Date('2026-11-07T02:03:04.567Z')).createDraft({
      to: 'approver@example.test',
      subject: 'Controlled',
      body: 'Controlled'
    })
    const raw = JSON.parse(String(calls.find((call) => call.url.endsWith('/drafts'))!.options.payload)).message.raw
    const mime = Buffer.from(raw, 'base64url').toString('utf8')
    expect(mime).toContain('From: owner@example.test\r\n')
    expect(mime).toContain('Date: Sat, 07 Nov 2026 02:03:04 GMT\r\n')
  })

  test('creates valid UTF8 MIME and returns sparse container/send acknowledgements without extra hydration', () => {
    const calls = provider([
      { body: { emailAddress: 'owner@example.test' } },
      { body: { id: 'container-1' } },
      { body: { id: 'final-1' } }
    ])
    const ports = evidenceGmailPorts(() => new Date('2026-11-07T02:03:04.567Z'))
    const mail = {
      to: 'approver@example.test',
      subject: 'Evidence request [evidence:123]',
      body: 'Span: 14:00 – 16:30\n[evidence:123]'
    }
    expect(ports.createDraft(mail)).toEqual({ id: 'container-1' })
    const payload = JSON.parse(String(calls[1]!.options.payload))
    const mime = Buffer.from(payload.message.raw, 'base64url').toString('utf8')
    expect(mime).toContain('From: owner@example.test\r\n')
    expect(mime).toContain('Date: Sat, 07 Nov 2026 02:03:04 GMT\r\n')
    expect(mime).toContain('To: approver@example.test\r\n')
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8\r\n')
    expect(Buffer.from(mime.split('\r\n\r\n')[1]!, 'base64').toString('utf8')).toBe(mail.body)
    expect(ports.sendDraft('container /1')).toEqual({ id: 'final-1' })
    expect(JSON.parse(String(calls[2]!.options.payload))).toEqual({ id: 'container /1' })
    expect(calls).toHaveLength(3)
    expect(
      calls.slice(1).every((c) => c.options.method === 'post' && c.options.contentType === 'application/json')
    ).toBe(true)
  })

  test('folds UTF8 encoded subject words and transfer-encoded body lines to MIME limits', () => {
    const calls = provider([{ body: { emailAddress: 'owner@example.test' } }, { body: { id: 'd1' } }])
    evidenceGmailPorts().createDraft({
      to: 'approver@example.test',
      subject: 'Evidence ⚡ '.repeat(20),
      body: 'Long body – '.repeat(100)
    })
    const mime = Buffer.from(JSON.parse(String(calls[1]!.options.payload)).message.raw, 'base64url').toString('utf8')
    const [head, content] = mime.split('\r\n\r\n')
    expect([...head!.matchAll(/=\?UTF-8\?B\?[^?]+\?=/g)].every((word) => word[0].length <= 75)).toBe(true)
    expect(content!.split('\r\n').every((line) => line.length <= 76)).toBe(true)
  })

  test('round-trips the real-length hash subject through RFC2047 folding and rich draft hydration', () => {
    const replies: { body: Record<string, unknown> }[] = [
      { body: { emailAddress: 'owner@example.test' } },
      { body: { id: 'container' } },
      { body: {} as Record<string, unknown> }
    ]
    const calls = provider(replies)
    const ports = evidenceGmailPorts(() => new Date('2026-11-07T02:03:04Z'))
    const mail = {
      to: 'approver@example.test',
      subject: `Evidence request [evidence:${'a'.repeat(64)}]`,
      body: `Request: m1\n[evidence:${'a'.repeat(64)}]`
    }
    expect(ports.createDraft(mail)).toEqual({ id: 'container' })
    const mime = Buffer.from(JSON.parse(String(calls[1]!.options.payload)).message.raw, 'base64url').toString('utf8')
    const subject = /Subject: ([\s\S]*?)\r\nMIME-Version:/.exec(mime)![1]!
    expect(subject).toContain('\r\n ')
    replies[0]!.body = {
      id: 'container',
      message: {
        id: 'draft-message',
        threadId: 'thread',
        payload: {
          ...text(mail.body),
          headers: [
            { name: 'To', value: mail.to },
            { name: 'Subject', value: subject }
          ]
        }
      }
    }
    const hydrated = ports.draft('container')!
    expect(hydrated.subject).toBe(mail.subject)
    expect(hydrated.body).toBe(mail.body)
    expect(calls.filter((call) => call.url.endsWith('/profile'))).toHaveLength(1)
  })

  test('hydrates distinct draft container/message IDs and retains full controlled body', () => {
    const msg = message({
      payload: {
        ...text('Line one\r\nLine two'),
        headers: [
          { name: 'To', value: 'approver@example.test' },
          { name: 'Subject', value: 'Controlled' }
        ]
      }
    })
    provider([{ body: { id: 'container-1', message: msg } }])
    expect(evidenceGmailPorts().draft('container-1')).toEqual({
      id: 'container-1',
      messageId: 'm1',
      threadId: 't1',
      to: 'approver@example.test',
      subject: 'Controlled',
      body: 'Line one\nLine two'
    })
  })

  test('scans every Sent page and hydrates/validates candidates before returning uniqueness evidence', () => {
    const sent = (id: string) =>
      message({
        id,
        labelIds: ['SENT'],
        payload: {
          ...text('Exact body\n[marker]'),
          headers: [
            { name: 'To', value: 'approver@example.test' },
            { name: 'Subject', value: 'Controlled' }
          ]
        }
      })
    const calls = provider([
      { body: { messages: [{ id: 's1' }], nextPageToken: 'next' } },
      { body: sent('s1') },
      { body: { messages: [{ id: 's2' }] } },
      { body: sent('s2') }
    ])
    expect(
      evidenceGmailPorts()
        .findSent('evidence:123')
        .map((r) => r.id)
    ).toEqual(['s1', 's2'])
    expect(new URL(calls[2]!.url).searchParams.get('pageToken')).toBe('next')
  })

  test('preserves positive send acknowledgement when optional thread metadata is unusable', () => {
    provider([{ body: { id: 'final-real', threadId: { malformed: true } } }])
    expect(evidenceGmailPorts().sendDraft('container')).toEqual({ id: 'final-real' })
  })

  test('rejects mismatched Sent hydration IDs', () => {
    provider([
      { body: { messages: [{ id: 'listed' }] } },
      {
        body: message({
          id: 'different',
          labelIds: ['SENT'],
          payload: { ...text('Controlled'), headers: [{ name: 'To', value: 'approver@example.test' }] }
        })
      }
    ])
    expect(() => evidenceGmailPorts().findSent('evidence:123')).toThrow('gmail_invalid_message')
  })

  test('rejects oversized provider pages rather than breaking the controller page cap', () => {
    provider([{ body: { messages: Array.from({ length: 26 }, (_, n) => ({ id: String(n) })) } }])
    expect(() =>
      evidenceGmailPorts().listMessages({
        activatedAt: '2026-11-07T10:00:00+08:00',
        lowerBound: '2026-11-07T10:00:00+08:00',
        upperBound: '2026-11-07T10:00:01+08:00'
      })
    ).toThrow('gmail_invalid_response')
  })

  test('never returns a partial Sent scan or accepts header injection/empty provider IDs', () => {
    provider([
      { body: { messages: [{ id: 's1' }], nextPageToken: 'next' } },
      {
        body: message({
          id: 's1',
          labelIds: ['SENT'],
          payload: {
            ...text('Controlled'),
            headers: [
              { name: 'To', value: 'approver@example.test' },
              { name: 'Subject', value: 'Controlled' }
            ]
          }
        })
      },
      { status: 429 },
      { body: { id: '' } }
    ])
    const ports = evidenceGmailPorts()
    expect(() => ports.findSent('evidence:123')).toThrow('gmail_http_429')
    expect(() =>
      ports.createDraft({ to: 'approver@example.test\r\nBcc: x@example.test', subject: 'x', body: 'x' })
    ).toThrow()
    expect(() => ports.sendDraft('d')).toThrow('gmail_invalid_acknowledgement')
  })
})
