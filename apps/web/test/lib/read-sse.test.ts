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
    signal: controller.signal,
    onEvent(event) {
      events.push(event)
      if (event.id === '43') controller.abort()
    }
  })

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(requestHeaders[1]?.get('Last-Event-ID')).toBe('42')
  expect(events).toEqual([
    { id: '42', event: 'update', data: 'first\nline' },
    { id: '43', event: 'message', data: 'resumed' }
  ])
})
