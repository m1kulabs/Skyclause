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

test('reconnect delay is jittered inside the exponential backoff window', async () => {
  const controller = new AbortController()
  const fetchMock = vi.fn(async () => new Response('event: snapshot\ndata: {}\n\n'))
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const timers = vi.spyOn(globalThis, 'setTimeout')
  vi.stubGlobal('fetch', fetchMock)
  let received!: () => void
  const firstEvent = new Promise<void>((resolve) => (received = resolve))

  const reading = readSse('/v1/events/stream', {
    resume: false,
    signal: controller.signal,
    onEvent: received
  })

  try {
    await firstEvent
    await vi.waitFor(() => expect(timers.mock.calls.some(([, delay]) => delay === 188)).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(random).toHaveBeenCalledTimes(1)
    expect(timers.mock.calls.find(([, delay]) => delay === 188)?.[1]).toBe(188)
    controller.abort()
    await expect(reading).resolves.toBeUndefined()
  } finally {
    controller.abort()
    random.mockRestore()
    timers.mockRestore()
    vi.unstubAllGlobals()
  }
})

test('a stream that is not available yet (501) is asked once, reported once and never retried', async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 501 }))
  const errors: unknown[] = []
  vi.stubGlobal('fetch', fetchMock)
  try {
    await readSse('/v1/events/stream', { onError: (error) => errors.push(error), onEvent: () => undefined })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ status: 501 })
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a real failure (503) is still retried with backoff', async () => {
  const controller = new AbortController()
  const fetchMock = vi.fn(async () => {
    if (fetchMock.mock.calls.length === 2) controller.abort()
    return new Response(null, { status: 503 })
  })
  const errors: unknown[] = []
  vi.stubGlobal('fetch', fetchMock)
  try {
    await readSse('/v1/events/stream', {
      signal: controller.signal,
      onError: (error) => errors.push(error),
      onEvent: () => undefined
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(errors[0]).toMatchObject({ status: 503 })
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a stream refused for good (401, 403, 404, 501) is asked once, reported once and never retried', async () => {
  for (const status of [401, 403, 404, 501]) {
    const fetchMock = vi.fn(async () => new Response(null, { status }))
    const errors: unknown[] = []
    vi.stubGlobal('fetch', fetchMock)
    try {
      await readSse('/v1/events/stream', { onError: (error) => errors.push(error), onEvent: () => undefined })
      expect(fetchMock, String(status)).toHaveBeenCalledTimes(1)
      expect(errors).toEqual([expect.objectContaining({ status })])
    } finally {
      vi.unstubAllGlobals()
    }
  }
})

test('a rate-limited stream (429) waits for Retry-After, in seconds or as a date, and at least 30 seconds without it', async () => {
  const now = Date.parse('2026-11-13T04:00:00Z')
  const cases: Array<[Record<string, string>, number]> = [
    [{ 'Retry-After': '45' }, 45_000],
    [{ 'Retry-After': new Date(now + 90_000).toUTCString() }, 90_000],
    [{}, 30_000],
    [{ 'Retry-After': '1' }, 1_000],
    [{ 'Retry-After': '0' }, 1_000],
    [{ 'Retry-After': 'soon' }, 30_000]
  ]
  for (const [headers, wait] of cases) {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => new Response(null, { status: 429, headers }))
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    vi.stubGlobal('fetch', fetchMock)
    const reading = readSse('/v1/events/stream', { signal: controller.signal, onEvent: () => undefined })
    try {
      await vi.waitFor(() => expect(timers.mock.calls.length).toBeGreaterThan(0))
      expect(timers.mock.calls.at(-1)?.[1], JSON.stringify(headers)).toBe(wait)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      controller.abort()
      await reading
      timers.mockRestore()
      clock.mockRestore()
      vi.unstubAllGlobals()
    }
  }
})
