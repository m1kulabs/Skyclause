import { expect, test, vi } from 'vitest'
import { readSse } from '../../lib/read-sse'

test('reconnects after EOF and resumes with the last event ID', async () => {
  const encoder = new TextEncoder()
  const controller = new AbortController()
  const requestHeaders: Headers[] = []
  const events: Array<{ id?: string; event: string; data: string }> = []
  let requestCount = 0
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestHeaders.push(new Headers(init?.headers))
    requestCount += 1
    const chunk =
      requestCount === 1 ? 'id: 42\nevent: update\ndata: first\ndata: line\n\n' : 'id: 43\ndata: resumed\n\n'

    return new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(chunk))
          stream.close()
        }
      }),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  })
  vi.stubGlobal('fetch', fetchMock)

  await readSse('/v1/events', {
    headers: { 'Skyclause-Organization': 'test-org' },
    signal: controller.signal,
    onEvent(event) {
      events.push(event)
      if (event.id === '43') controller.abort()
    }
  })

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(requestHeaders[1]?.get('Last-Event-ID')).toBe('42')
  expect(requestHeaders.every((headers) => headers.get('Skyclause-Organization') === 'test-org')).toBe(true)
  expect(events).toEqual([
    { id: '42', event: 'update', data: 'first\nline' },
    { id: '43', event: 'message', data: 'resumed' }
  ])
})

test('snapshot streams reconnect without Last-Event-ID when resume is disabled', async () => {
  const controller = new AbortController()
  const headers: Headers[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      headers.push(new Headers(init.headers))
      return new Response('id: 42\nevent: snapshot\ndata: {}\n\n')
    })
  )
  await readSse('/api/notifications/stream', {
    resume: false,
    signal: controller.signal,
    onEvent() {
      if (headers.length === 2) controller.abort()
    }
  })
  expect(headers).toHaveLength(2)
  expect(headers.every((header) => !header.has('Last-Event-ID'))).toBe(true)
})
