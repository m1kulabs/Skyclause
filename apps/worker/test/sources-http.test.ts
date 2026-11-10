import { expect, test } from 'vitest'
import { HttpError, NetworkError, RateLimitedError, SchemaError, TimeoutError } from '@skyclause/sources'
import { context, MemoryStore, TestClock, flush } from './support/source-adapter'
test('HTTP consumes preflight credit once, enforces UA/manual redirect, buffers repeatable exact bytes and measured metadata', async () => {
  const clock = new TestClock()
  let calls = 0
  const c = context({
    clock,
    http: async (_, init) => {
      calls++
      expect(new Headers(init?.headers).get('user-agent')).toBe('Skyclause/test')
      expect(init?.redirect).toBe('manual')
      await clock.advance(7)
      return new Response('hello', { status: 201 })
    }
  })
  await c.ctx.budget.take('datagovmy-weather')
  const response = await c.ctx.http('https://example.test/data', { headers: { 'uSeR-aGeNt': 'wrong' } })
  expect(await response.text()).toBe('hello')
  expect(await response.text()).toBe('hello')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode('hello'))
  expect(c.requests[0]).toMatchObject({
    httpStatus: 201,
    latencyMs: 7,
    bodySha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    error: null
  })
  await c.ctx.http('https://example.test/second')
  expect(calls).toBe(2)
  expect(JSON.parse(Buffer.from([...c.store.objects.values()][0]!.body).toString()).requests).toHaveLength(2)
  expect(c.requests.map((r) => r.requestId)).toEqual(['req-1', 'req-2'])
})
test.each([301, 500, 429])('HTTP %s throws an HTTP error once with actual response status', async (status) => {
  let calls = 0
  const c = context({
    http: async () => {
      calls++
      return new Response('error', { status })
    }
  })
  await expect(c.ctx.http('https://example.test/error')).rejects.toBeInstanceOf(HttpError)
  expect(c.requests[0]).toMatchObject({ httpStatus: status, error: { type: 'http' } })
  expect(calls).toBe(1)
})
test('deadline includes body consumption and retains the observed status', async () => {
  const c = context({ http: async () => new Response(new ReadableStream({ start() {} }), { status: 200 }) })
  const request = c.ctx.http('https://example.test/slow')
  const rejected = expect(request).rejects.toBeInstanceOf(TimeoutError)
  await flush()
  await c.clock.advance(19999)
  expect(c.requests[0]?.error).toBeNull()
  await c.clock.advance(1)
  await rejected
  expect(c.requests[0]).toMatchObject({ httpStatus: 200, latencyMs: 20000, error: { type: 'timeout' } })
})
test('network failure has null status and measured elapsed time', async () => {
  const clock = new TestClock()
  const c = context({
    clock,
    http: async () => {
      await clock.advance(13)
      throw new Error('socket closed')
    }
  })
  await expect(c.ctx.http('https://example.test/down')).rejects.toBeInstanceOf(NetworkError)
  expect(c.requests[0]).toMatchObject({ httpStatus: null, latencyMs: 13, error: { type: 'network' } })
})
test('malformed JSON is a schema error without another HTTP call', async () => {
  const c = context()
  const response = await c.ctx.http('https://example.test/bad-json')
  await expect(response.json()).rejects.toBeInstanceOf(SchemaError)
  expect(c.requests).toHaveLength(1)
  expect(c.requests[0]?.error?.type).toBe('schema')
})
test('local denial waits twenty seconds, records no response and never sends HTTP', async () => {
  let calls = 0
  const c = context({
    http: async () => {
      calls++
      return new Response('ok')
    }
  })
  for (let i = 0; i < 4; i++) await c.ctx.http('https://example.test/data')
  const fifth = c.ctx.http('https://example.test/data')
  const rejection = expect(fifth).rejects.toBeInstanceOf(RateLimitedError)
  await flush()
  await c.clock.advance(20000)
  await rejection
  expect(calls).toBe(4)
  expect(c.requests[4]).toMatchObject({ httpStatus: null, latencyMs: 20000, error: { type: 'rate_limited' } })
})

test('a response arriving after the deadline cannot mutate a completed timeout capture', async () => {
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => {
    release = resolve
  })
  const c = context({ http: async () => pending })
  const rejected = expect(c.ctx.http('https://example.test/late')).rejects.toBeInstanceOf(TimeoutError)
  await flush()
  await c.clock.advance(20000)
  await rejected
  release(new Response('late', { status: 200 }))
  await flush()
  expect(c.requests[0]).toMatchObject({ httpStatus: null, body: null, bodySha256: null, error: { type: 'timeout' } })
})

test('concurrent preflight and automatic reservation record one denied request', async () => {
  const c = context()
  for (let i = 0; i < 4; i++) await c.ctx.http('https://example.test/data')
  const preflight = expect(c.ctx.budget.take('datagovmy-weather')).rejects.toBeInstanceOf(RateLimitedError)
  const automatic = expect(c.ctx.http('https://example.test/data')).rejects.toBeInstanceOf(RateLimitedError)
  await flush()
  await c.clock.advance(20000)
  await Promise.all([preflight, automatic])
  expect(c.requests).toHaveLength(5)
  expect(c.requests[4]).toMatchObject({ httpStatus: null, error: { type: 'rate_limited' } })
})

test.each(['read', 'write'] as const)(
  'late budget %s completion cannot send HTTP after a denied admission',
  async (method) => {
    const store = new MemoryStore(),
      clock = new TestClock()
    let release!: () => void,
      calls = 0
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const read = store.read.bind(store),
      write = store.write.bind(store)
    if (method === 'read')
      store.read = async (path) => {
        await pending
        return read(path)
      }
    else
      store.write = async (path, body, generation) => {
        await pending
        return write(path, body, generation)
      }
    const c = context({
      budget: store,
      clock,
      http: async () => {
        calls++
        return new Response('should not happen')
      }
    })
    const rejected = expect(c.ctx.http('https://example.test/data')).rejects.toBeInstanceOf(RateLimitedError)
    await flush()
    await clock.advance(20000)
    await rejected
    release()
    await flush()
    expect(calls).toBe(0)
    expect(c.requests[0]).toMatchObject({ httpStatus: null, latencyMs: 20000, error: { type: 'rate_limited' } })
  }
)

test('nineteen-second preflight admission is consumed without another GCS read or a restarted deadline', async () => {
  const clock = new TestClock(),
    store = new MemoryStore(),
    read = store.read.bind(store)
  let reads = 0
  const sentAt: number[] = []
  store.read = async (path) => {
    reads++
    await clock.sleep(19000)
    return read(path)
  }
  const c = context({
    clock,
    budget: store,
    http: async () => {
      sentAt.push(clock.monotonic())
      return new Response('ok')
    }
  })
  const request = (async () => {
    await c.ctx.budget.take('datagovmy-weather')
    return c.ctx.http('https://example.test/data')
  })()
  await flush()
  await clock.advance(19000)
  expect(reads).toBe(1)
  expect(sentAt).toEqual([19000])
  await request
  expect(c.requests[0]).toMatchObject({ latencyMs: 0, admissionMs: 19000, httpStatus: 200 })
})

test('an unused preflight credit expires at its original twenty-second deadline without HTTP or another read', async () => {
  const clock = new TestClock(),
    store = new MemoryStore(),
    read = store.read.bind(store)
  let reads = 0,
    sent = 0
  store.read = async (path) => {
    reads++
    return read(path)
  }
  const c = context({
    clock,
    budget: store,
    http: async () => {
      sent++
      return new Response('ok')
    }
  })
  await c.ctx.budget.take('datagovmy-weather')
  await clock.advance(20000)
  await expect(c.ctx.http('https://example.test/data')).rejects.toBeInstanceOf(RateLimitedError)
  expect(reads).toBe(1)
  expect(sent).toBe(0)
  expect(c.requests[0]).toMatchObject({ httpStatus: null, latencyMs: 20000, error: { type: 'rate_limited' } })
})

test('delayed preflight credits protect every physical start for a full trailing minute', async () => {
  const clock = new TestClock(),
    store = new MemoryStore(),
    starts: number[] = []
  let sequence = 0
  const make = () =>
    context({
      clock,
      budget: store,
      requestId: () => `physical-${++sequence}`,
      http: async () => {
        starts.push(clock.monotonic())
        return new Response('{}')
      }
    })
  const contexts = Array.from({ length: 4 }, make)
  for (const c of contexts) await c.ctx.budget.take('datagovmy-weather')
  await clock.advance(19000)
  for (const c of contexts) await c.ctx.http('https://example.test/delayed')
  expect(contexts[0]!.requests[0]).toMatchObject({
    startedAt: clock.now().toISOString(),
    admissionMs: 19000,
    transportStartedAt: clock.now().toISOString()
  })
  await clock.advance(41000)
  const waiting = Promise.allSettled(Array.from({ length: 4 }, () => make().ctx.http('https://example.test/new')))
  await flush()
  expect(starts).toEqual([19000, 19000, 19000, 19000])
  await clock.advance(20000)
  expect(
    (await waiting).every((result) => result.status === 'rejected' && result.reason instanceof RateLimitedError)
  ).toBe(true)
  for (let i = 0; i < 4; i++) await make().ctx.http('https://example.test/retry')
  expect(starts).toEqual([19000, 19000, 19000, 19000, 80000, 80000, 80000, 80000])
  for (const at of starts)
    expect(starts.filter((start) => start > at - 60000 && start <= at).length).toBeLessThanOrEqual(4)
})
test('slow CAS admission cannot expire protection before the resulting physical starts', async () => {
  const clock = new TestClock(),
    store = new MemoryStore(),
    write = store.write.bind(store),
    starts: number[] = []
  let writes = 0
  store.write = async (path, body, generation) => {
    if (++writes <= 4) await clock.sleep(19000)
    return write(path, body, generation)
  }
  const c = context({
    clock,
    budget: store,
    http: async () => {
      starts.push(clock.monotonic())
      return new Response('{}')
    }
  })
  for (let i = 0; i < 4; i++) {
    const call = c.ctx.http('https://example.test/cas')
    await flush()
    await clock.advance(19000)
    await call
  }
  await clock.advance(4000)
  const calls = Promise.all([c.ctx.http('https://example.test/next'), c.ctx.http('https://example.test/next')])
  await flush()
  await clock.advance(19000)
  await calls
  for (const at of starts)
    expect(starts.filter((start) => start > at - 60000 && start <= at).length).toBeLessThanOrEqual(4)
  expect(starts).toEqual([19000, 38000, 57000, 76000, 80000, 99000])
})
