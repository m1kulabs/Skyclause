import { expect, test } from 'vitest'
import { RateLimitedError } from '@skyclause/sources'
import { takeSourceBudget } from '../src/sources/budget'
import { MemoryStore, TestClock, flush } from './support/source-adapter'
const family = 'datagovmy-weather'
test('CAS admits four concurrent distinct starts, retains reservations across callers and denies the fifth at exactly 20 seconds', async () => {
  const store = new MemoryStore(),
    clock = new TestClock()
  await Promise.all(['a', 'b', 'c', 'd'].map((id) => takeSourceBudget(store, family, id, clock)))
  expect(store.conflicts).toBeGreaterThan(0)
  await takeSourceBudget(store, family, 'a', clock)
  let outcome: unknown
  const fifth = takeSourceBudget(store, family, 'e', clock).catch((error) => {
    outcome = error
  })
  await flush()
  await clock.advance(19999)
  expect(outcome).toBeUndefined()
  await clock.advance(1)
  await fifth
  expect(outcome).toBeInstanceOf(RateLimitedError)
  expect(clock.monotonic()).toBe(20000)
  await takeSourceBudget(store, 'datagovmy-gtfs-rt', 'e', clock)
})
test('trailing window excludes starts exactly sixty seconds old and waits to the actual expiry', async () => {
  const store = new MemoryStore(),
    clock = new TestClock()
  await Promise.all(['a', 'b', 'c', 'd'].map((id) => takeSourceBudget(store, family, id, clock)))
  await clock.advance(50000)
  let done = false
  const next = takeSourceBudget(store, family, 'e', clock).then(() => {
    done = true
  })
  await flush()
  await clock.advance(9999)
  expect(done).toBe(false)
  await clock.advance(1)
  await next
  expect(done).toBe(true)
})
test('coordination failures propagate without admitting HTTP', async () => {
  const store = new MemoryStore(),
    clock = new TestClock()
  store.read = async () => {
    throw new Error('permission denied')
  }
  await expect(takeSourceBudget(store, family, 'a', clock)).rejects.toThrow('permission denied')
})

test('a stalled coordination read cannot outlive the admission deadline or later reserve a request', async () => {
  const store = new MemoryStore(),
    clock = new TestClock()
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  store.read = async () => {
    await pending
    return null
  }
  let outcome: unknown
  const reservation = takeSourceBudget(store, family, 'late', clock).catch((error) => {
    outcome = error
  })
  await flush()
  await clock.advance(20000)
  expect(outcome).toBeInstanceOf(RateLimitedError)
  release()
  await reservation
  await flush()
  expect(store.objects.size).toBe(0)
})

test('a CAS completing after the deadline retains a conservative reservation but cannot grant admission', async () => {
  const store = new MemoryStore(),
    clock = new TestClock(),
    write = store.write.bind(store)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  store.write = async (path, body, generation) => {
    await pending
    return write(path, body, generation)
  }
  const reservation = takeSourceBudget(store, family, 'late', clock)
  const rejected = expect(reservation).rejects.toBeInstanceOf(RateLimitedError)
  await flush()
  await clock.advance(20000)
  await rejected
  expect(store.objects.size).toBe(0)
  release()
  await flush()
  expect(store.objects.size).toBe(1)
})
