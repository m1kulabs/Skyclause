import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sseResponse, type SseMessage } from '../src/sse'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text
    text += decoder.decode(value)
  }
}

it('replays after Last-Event-ID, then streams live events with id: <seq>, skipping any it already replayed', async () => {
  let send!: (message: SseMessage) => void
  const replay = vi.fn(async (afterSeq: number) => [
    { seq: afterSeq + 1, event: 'reading', data: { value: 1 } },
    { seq: afterSeq + 2, event: 'reading', data: { value: 2 } }
  ])
  const unlisten = vi.fn()
  const response = sseResponse({
    lastEventId: '41',
    replay,
    listen: (deliver) => {
      send = deliver
      // A live event that also arrives in the replay is sent once.
      deliver({ seq: 43, event: 'reading', data: { value: 2 } })
      return unlisten
    }
  })
  expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')

  const text = readAll(response)
  await vi.advanceTimersByTimeAsync(0)
  send({ seq: 44, event: 'reading', data: { value: 3 } })
  await vi.advanceTimersByTimeAsync(5 * 60_000)

  expect(replay).toHaveBeenCalledWith(41)
  expect(await text).toBe(
    'id: 42\nevent: reading\ndata: {"value":1}\n\n' +
      'id: 43\nevent: reading\ndata: {"value":2}\n\n' +
      'id: 44\nevent: reading\ndata: {"value":3}\n\n' +
      ': heartbeat\n\n'.repeat(19)
  )
  expect(unlisten).toHaveBeenCalledOnce()
})

it('sends a comment heartbeat every 15 seconds and closes after 5 minutes', async () => {
  const response = sseResponse({ listen: () => () => {} })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  const next = reader.read()
  await vi.advanceTimersByTimeAsync(14_999)
  let settled = false
  void next.then(() => (settled = true))
  await vi.advanceTimersByTimeAsync(0)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(decoder.decode((await next).value)).toBe(': heartbeat\n\n')

  await vi.advanceTimersByTimeAsync(5 * 60_000)
  let result = await reader.read()
  while (!result.done) result = await reader.read()
  expect(result.done).toBe(true)
})

it('starts without replay when there is no Last-Event-ID, and sends an unnumbered event without id', async () => {
  const replay = vi.fn(async () => [])
  const response = sseResponse({
    replay,
    listen: (deliver) => {
      deliver({ event: 'snapshot', data: { bundle_ids: [] } })
      return () => {}
    }
  })
  const text = readAll(response)
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(replay).not.toHaveBeenCalled()
  expect((await text).startsWith('event: snapshot\ndata: {"bundle_ids":[]}\n\n')).toBe(true)
})

it('stops listening when the client goes away', async () => {
  const unlisten = vi.fn()
  const abort = new AbortController()
  const response = sseResponse({ listen: () => unlisten, signal: abort.signal })
  const reader = response.body!.getReader()
  abort.abort()
  await vi.advanceTimersByTimeAsync(0)
  expect((await reader.read()).done).toBe(true)
  expect(unlisten).toHaveBeenCalledOnce()
})
