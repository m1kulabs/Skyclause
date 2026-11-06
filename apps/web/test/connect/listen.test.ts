import { afterEach, expect, test, vi } from 'vitest'
import { startListening } from '../../features/connect/listen'

afterEach(() => vi.useRealTimers())

function setup() {
  vi.useFakeTimers()
  const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const read = vi.fn().mockResolvedValue({ data: [], next_cursor: null })
  const change = vi.fn()
  const stop = startListening({ read, change, visibility })
  return { visibility, read, change, stop }
}

test('activity waits five seconds between reads, pauses while hidden, and stops on the first request', async () => {
  const { visibility, read, change, stop } = setup()
  await vi.advanceTimersByTimeAsync(0)
  expect(read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(4999)
  expect(read).toHaveBeenCalledTimes(1)
  visibility.visibilityState = 'hidden'
  visibility.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(20_000)
  expect(read).toHaveBeenCalledTimes(1)
  const request = { at: '2026-11-06T01:23:00Z', tool: 'test_tool', client_name: 'Test client' }
  read.mockResolvedValueOnce({ data: [request], next_cursor: null })
  visibility.visibilityState = 'visible'
  visibility.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
  expect(change).toHaveBeenLastCalledWith({ kind: 'received', request })
  await vi.advanceTimersByTimeAsync(30_000)
  expect(read).toHaveBeenCalledTimes(2)
  stop()
})

test('activity stops after ten wall-clock minutes, even if the tab was hidden', async () => {
  const { visibility, read, change, stop } = setup()
  await vi.advanceTimersByTimeAsync(0)
  visibility.visibilityState = 'hidden'
  visibility.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(600_000)
  expect(change).toHaveBeenLastCalledWith({ kind: 'timeout' })
  visibility.visibilityState = 'visible'
  visibility.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(10_000)
  expect(read).toHaveBeenCalledTimes(1)
  stop()
})

test('cleanup aborts an in-flight read and prevents stale results after unmount', async () => {
  vi.useFakeTimers()
  const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  let finish!: (value: { data: []; next_cursor: null }) => void
  let signal!: AbortSignal
  const change = vi.fn()
  const stop = startListening({
    visibility,
    change,
    read: (abort) => {
      signal = abort
      return new Promise((resolve) => {
        finish = resolve
      })
    }
  })
  stop()
  expect(signal.aborted).toBe(true)
  finish({ data: [], next_cursor: null })
  await vi.advanceTimersByTimeAsync(10_000)
  expect(change).not.toHaveBeenCalled()
})

test('activity failures show an error and stop reading', async () => {
  const { read, change, stop } = setup()
  await vi.advanceTimersByTimeAsync(0)
  read.mockRejectedValueOnce(new Error('API unavailable'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(change).toHaveBeenLastCalledWith({ kind: 'error' })
  await vi.advanceTimersByTimeAsync(10_000)
  expect(read).toHaveBeenCalledTimes(2)
  stop()
})
