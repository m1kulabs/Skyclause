import { expect, test } from 'vitest'
import { runBackfillOnce } from '../src/sources/backfill'
import { loadSourceResult, saveSourceResult } from '../src/sources/storage'
import { adapter, context, MemoryStore, source, TestClock, flush } from './support/source-adapter'
import type { BackfillPorts } from '../src/sources/backfill'
import type { SourceExecutionResult } from '../src/sources/types'
function setup() {
  const store = new MemoryStore(),
    clock = new TestClock(),
    published: SourceExecutionResult[] = []
  let sequence = 0,
    gets = 0
  const ports: BackfillPorts = {
    store,
    clock,
    id: () => `id-${++sequence}`,
    contextFactory: (sources) =>
      context({
        sources,
        clock,
        http: async () => {
          gets++
          return new Response('{}')
        }
      }),
    publish: async (result) => {
      published.push(result)
    }
  }
  const a = adapter({ backfill: async (s, ctx) => (await ctx.http(s.url)).json() })
  return { store, clock, published, ports, a, gets: () => gets }
}
test('job/event race executes once and publishes the generation-fenced immutable result', async () => {
  const t = setup()
  const results = await Promise.all([runBackfillOnce(t.a, source(), t.ports), runBackfillOnce(t.a, source(), t.ports)])
  expect(results.sort()).toEqual(['complete', 'running'])
  expect(t.gets()).toBe(1)
  expect(t.published).toHaveLength(1)
  const claim = JSON.parse(Buffer.from((await t.store.read('control/backfills/rain-a.json'))!.body).toString())
  expect(claim.state).toBe('complete')
  expect(await loadSourceResult(t.store, claim.resultPath)).toEqual(t.published[0])
})
test('publish failure replays saved IDs and bytes without refetching', async () => {
  const t = setup()
  let first: SourceExecutionResult | undefined
  t.ports.publish = async (result) => {
    first = result
    throw new Error('publish unavailable')
  }
  await expect(runBackfillOnce(t.a, source(), t.ports)).rejects.toThrow('publish unavailable')
  t.ports.publish = async (result) => {
    t.published.push(result)
  }
  expect(await runBackfillOnce(t.a, source(), t.ports)).toBe('complete')
  expect(t.gets()).toBe(1)
  expect(t.published[0]).toEqual(first)
  t.ports.acknowledged = async () => true
  await runBackfillOnce(t.a, source(), t.ports)
  expect(t.published).toHaveLength(1)
})
test('an expired claim with a saved result completes that same result without another GET', async () => {
  const t = setup(),
    write = t.store.write.bind(t.store)
  let fail = true
  t.store.write = async (path, body, generation) => {
    if (
      path.startsWith('control/backfills/') &&
      JSON.parse(Buffer.from(body).toString()).state === 'complete' &&
      fail
    ) {
      fail = false
      throw new Error('crash before claim completion')
    }
    return write(path, body, generation)
  }
  await expect(runBackfillOnce(t.a, source(), t.ports)).rejects.toThrow('crash before claim completion')
  await t.clock.advance(60000)
  expect(await runBackfillOnce(t.a, source(), t.ports)).toBe('complete')
  expect(t.gets()).toBe(1)
  expect(t.published).toHaveLength(1)
})
test('a paused expired owner cannot commit or publish after a replacement wins', async () => {
  const t = setup()
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow = adapter({
    backfill: async (s, ctx) => {
      await waiting
      return (await ctx.http(s.url)).json()
    }
  })
  const old = runBackfillOnce(slow, source(), t.ports)
  await flush()
  // Model a suspended process: wall/monotonic time moves while its heartbeat cannot execute.
  t.clock.time += 60001
  t.clock.elapsed += 60001
  expect(await runBackfillOnce(t.a, source(), t.ports)).toBe('complete')
  release()
  expect(await old).toBe('running')
  expect(t.published).toHaveLength(1)
  const results = [...t.store.objects.keys()].filter((path) => path.startsWith('control/results/'))
  expect(results).toHaveLength(1)
})
test('a live owner renews its sixty-second lease every twenty seconds and excludes other deliveries', async () => {
  const t = setup()
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow = adapter({
    backfill: async (s, ctx) => {
      await waiting
      return (await ctx.http(s.url)).json()
    }
  })
  const running = runBackfillOnce(slow, source(), t.ports)
  await flush()
  for (let i = 0; i < 4; i++) {
    await t.clock.advance(20000)
    expect(await runBackfillOnce(t.a, source(), t.ports)).toBe('running')
  }
  release()
  expect(await running).toBe('complete')
  expect(t.gets()).toBe(1)
})
test('completed errors consume the one attempt and unsupported adapters do not create claims', async () => {
  const t = setup()
  expect(await runBackfillOnce(adapter(), source(), t.ports)).toBe('unsupported')
  expect(t.store.objects.size).toBe(0)
  const bad = adapter({
    backfill: async (s, ctx) => {
      await ctx.http(s.url)
      throw new Error('failed adapter')
    }
  })
  await runBackfillOnce(bad, source(), t.ports)
  await runBackfillOnce(bad, source(), t.ports)
  expect(t.gets()).toBe(1)
  expect(t.published[0]?.polls[0]?.outcome).toBe('error')
})
test('immutable results cannot be overwritten with different content', async () => {
  const t = setup()
  await runBackfillOnce(t.a, source(), t.ports)
  const result = t.published[0]!
  await saveSourceResult(t.store, 'control/results/test.json', result)
  await saveSourceResult(t.store, 'control/results/test.json', result)
  await expect(
    saveSourceResult(t.store, 'control/results/test.json', { ...result, operationId: 'other' })
  ).rejects.toThrow('Conflicting immutable')
})

test('expired claims without results retain operation identity and the original manual scheduled slot', async () => {
  const t = setup()
  await t.store.write(
    'control/backfills/rain-a.json',
    new TextEncoder().encode(
      JSON.stringify({
        state: 'running',
        operationId: 'original-operation',
        owner: 'dead-owner',
        leaseExpiresAt: t.clock.now().getTime() - 1,
        resultPath: 'control/results/old.json',
        scheduledAt: null
      })
    ),
    '0'
  )
  t.ports.scheduledAt = '2026-11-10T00:01:00.000Z'
  expect(await runBackfillOnce(t.a, source(), t.ports)).toBe('complete')
  expect(t.published[0]).toMatchObject({ operationId: 'original-operation', scheduledAt: null })
  expect(t.gets()).toBe(1)
})
test('a failed lease renewal propagates storage failure and cannot publish a result', async () => {
  const t = setup()
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow = adapter({
    backfill: async (s, ctx) => {
      await pending
      return (await ctx.http(s.url)).json()
    }
  })
  const result = runBackfillOnce(slow, source(), t.ports)
  const rejected = expect(result).rejects.toThrow('storage unavailable')
  await flush()
  t.store.write = async () => {
    throw new Error('storage unavailable')
  }
  await t.clock.advance(20000)
  release()
  await rejected
  expect(t.published).toEqual([])
})

test('renewal cadence includes GCS latency instead of sleeping twenty seconds after each write', async () => {
  const t = setup(),
    write = t.store.write.bind(t.store)
  const starts: number[] = []
  t.store.write = async (path, body, generation) => {
    if (path.startsWith('control/backfills/') && JSON.parse(Buffer.from(body).toString()).state === 'running') {
      starts.push(t.clock.monotonic())
      if (generation !== '0') await t.clock.sleep(5000)
    }
    return write(path, body, generation)
  }
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow = adapter({
    backfill: async (s, ctx) => {
      await pending
      return (await ctx.http(s.url)).json()
    }
  })
  const running = runBackfillOnce(slow, source(), t.ports)
  await flush()
  await t.clock.advance(20000)
  await t.clock.advance(5000)
  await t.clock.advance(15000)
  expect(starts).toEqual([0, 20000, 40000])
  await t.clock.advance(5000)
  release()
  await running
})

test('backfill cannot commit or publish while a parallel HTTP sibling remains unsettled', async () => {
  const t = setup()
  let release!: (response: Response) => void
  const held = new Promise<Response>((resolve) => {
    release = resolve
  })
  t.ports.contextFactory = (sources) =>
    context({
      sources,
      clock: t.clock,
      http: async (url) => (String(url).endsWith('/bad') ? new Response('', { status: 500 }) : held)
    })
  const a = adapter({
    backfill: async (_, ctx) =>
      Promise.all([ctx.http('https://example.test/bad'), ctx.http('https://example.test/held')])
  })
  const running = runBackfillOnce(a, source(), t.ports)
  await flush()
  expect(t.published).toEqual([])
  expect(JSON.parse(Buffer.from((await t.store.read('control/backfills/rain-a.json'))!.body).toString()).state).toBe(
    'running'
  )
  await t.clock.advance(125)
  release(new Response('hello', { status: 201 }))
  expect(await running).toBe('complete')
  expect(t.published[0]?.requests.map((request) => request.httpStatus)).toEqual([500, 201])
  expect(t.published[0]?.requests.map((request) => request.error?.type ?? null)).toEqual(['http', null])
  expect(t.published[0]?.polls.flatMap((poll) => poll.readings)).toEqual([])
  const saved = JSON.stringify(t.published)
  await t.clock.advance(20000)
  expect(JSON.stringify(t.published)).toBe(saved)
})
