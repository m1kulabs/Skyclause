import { expect, test } from 'vitest'
import { SchemaError } from '@skyclause/sources'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createApimsAdapter } from '../../../packages/sources/src/adapters/apims'
import { discoverApims } from '../../../packages/sources/src/adapters/apims-discovery'
import { executeAdapter } from '../src/sources/execute'
import { saveSourceResult, loadSourceResult } from '../src/sources/storage'
import { parseSourceResult } from '../src/sources/ingest'
import { adapter, context, reading, source, TestClock, MemoryStore, flush } from './support/source-adapter'
const options = () => ({
  operationId: 'operation',
  purpose: 'poll' as const,
  scheduledAt: '2026-11-09T23:59:00.000Z',
  clock: new TestClock(),
  requestId: () => 'no-request'
})
const factory = (sources: ReturnType<typeof source>[]) => context({ sources, http: async () => new Response('{}') })

const apimsBytes = readFileSync(
  new URL('../../../packages/sources/test/fixtures/mapcaqm-20261105T1313Z.json', import.meta.url)
)
const apimsSources = ['CA16W', 'CA19B', 'CA17W'].map((externalId) => ({
  ...discoverApims(JSON.parse(apimsBytes.toString())).find((s) => s.externalId === externalId)!,
  id: randomUUID(),
  kind: 'apims' as const
}))
test('source-local parse failure preserves D15 siblings', async () => {
  const body = JSON.parse(apimsBytes.toString())
  body.data = body.data.filter((r: { STATION_ID: string }) => r.STATION_ID !== 'CA19B')
  let calls = 0
  const result = await executeAdapter(
    createApimsAdapter(),
    apimsSources,
    (sources) =>
      context({
        kind: 'apims',
        family: undefined,
        sources,
        requestId: randomUUID,
        http: async () => {
          calls++
          return Response.json(body)
        }
      }),
    { ...options(), operationId: randomUUID() }
  )
  expect(calls).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.requests[0]).toMatchObject({ httpStatus: 200, error: null, sourceIds: apimsSources.map((s) => s.id) })
  expect(result.polls).toHaveLength(3)
  expect(result.polls.map((p) => p.outcome)).toEqual(['ok', 'error', 'ok'])
  expect(result.polls.flatMap((p) => p.readings)).toHaveLength(2)
  expect(result.polls[1]).toMatchObject({
    readings: [],
    error: { type: 'schema', message: expect.stringContaining(apimsSources[1]!.id) }
  })
  expect(new Set(result.polls.map((p) => p.requestId))).toEqual(new Set([result.requests[0]!.requestId]))
  expect(result.polls[1]!.error!.message).toContain('CA19B')
  const store = new MemoryStore()
  await saveSourceResult(store, 'control/results/apims.json', result)
  expect(structuredClone(await loadSourceResult(store, 'control/results/apims.json', parseSourceResult))).toEqual(
    result
  )
  body.data.length = 0
  expect(result.polls.flatMap((p) => p.readings)).toHaveLength(2)
})
test('all-malformed APIMS gives three source errors without falsifying physical HTTP200', async () => {
  const result = await executeAdapter(
    createApimsAdapter(),
    apimsSources,
    (sources) =>
      context({
        kind: 'apims',
        family: undefined,
        sources,
        http: async () => Response.json({})
      }),
    options()
  )
  expect(result.requests).toHaveLength(1)
  expect(result.requests[0]).toMatchObject({ httpStatus: 200, error: null })
  expect(result.polls.map((p) => p.error?.type)).toEqual(['schema', 'schema', 'schema'])
  expect(result.polls.flatMap((p) => p.readings)).toEqual([])
})
test('APIMS 20-second transport timeout remains shared with real null status and latency', async () => {
  const clock = new TestClock()
  const execution = executeAdapter(
    createApimsAdapter(),
    apimsSources,
    (sources) =>
      context({
        clock,
        kind: 'apims',
        family: undefined,
        sources,
        http: async () => new Promise<Response>(() => {})
      }),
    { ...options(), clock }
  )
  await flush()
  await clock.advance(20000)
  const result = await execution
  expect(result.requests).toHaveLength(1)
  expect(result.requests[0]).toMatchObject({ httpStatus: null, latencyMs: 20000, error: { type: 'timeout' } })
  expect(result.polls.map((p) => p.error?.type)).toEqual(['timeout', 'timeout', 'timeout'])
  expect(result.polls.flatMap((p) => p.readings)).toEqual([])
})
test('per-source opt-in validates typed rows independently and retains default aggregate parsing', async () => {
  for (const parseMode of [undefined, 'per_source'] as const) {
    const a = adapter({
      parseMode,
      parse: (_, sources) => sources.map((s) => ({ ...reading(s.id), unit: s.id === 'rain-b' ? 'bad' : 'mm' })) as never
    })
    const result = await executeAdapter(a, [source(), source('rain-b')], factory, options())
    expect(result.polls.map((p) => p.outcome)).toEqual(parseMode ? ['ok', 'error'] : ['error', 'error'])
    expect(result.requests[0]!.error?.type ?? null).toBe(parseMode ? null : 'schema')
  }
})
test.each(['all_bound', 'per_source'] as const)(
  '%s deduplicates bindings and attaches readings only to the participating sources',
  async (batch) => {
    let fetched = 0
    const a = adapter({
      batch,
      fetch: async (sources, ctx) => {
        fetched++
        return (await ctx.http(sources[0]!.url)).json()
      }
    })
    const result = await executeAdapter(a, [source(), source(), source('rain-b')], factory, options())
    expect(fetched).toBe(batch === 'all_bound' ? 1 : 2)
    expect(result.polls.map((p) => p.sourceId)).toEqual(['rain-a', 'rain-b'])
    expect(result.polls.flatMap((p) => p.readings).map((r) => r.sourceId)).toEqual(['rain-a', 'rain-b'])
  }
)
test('identical bodies skip parse; mixed digests parse once and omit only unchanged source rows', async () => {
  const digest = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
  let parsed = 0
  const a = adapter({
    parse: (_, sources) => {
      parsed++
      return sources.map((s) => reading(s.id))
    }
  })
  const all = await executeAdapter(a, [source(), source('rain-b')], factory, {
    ...options(),
    previousDigest: () => digest
  })
  expect(parsed).toBe(0)
  expect(all.polls.map((p) => p.outcome)).toEqual(['unchanged', 'unchanged'])
  const mixed = await executeAdapter(a, [source(), source('rain-b')], factory, {
    ...options(),
    previousDigest: (id) => (id === 'rain-a' ? digest : null)
  })
  expect(parsed).toBe(1)
  expect(mixed.polls.map((p) => p.outcome)).toEqual(['unchanged', 'ok'])
  expect(mixed.polls.flatMap((p) => p.readings).map((r) => r.sourceId)).toEqual(['rain-b'])
})
test('valid empty semantic result is unchanged without a placeholder row', async () => {
  const result = await executeAdapter(adapter({ parse: () => [] }), [source()], factory, options())
  expect(result.polls[0]).toMatchObject({ outcome: 'unchanged', readings: [] })
})
test.each([
  { sourceId: 'foreign' },
  { metric: 'unknown' },
  { unit: 'cm' },
  { valueJson: { bad: true } },
  { value: Infinity },
  { observedAt: 'bad' }
])('invalid readings fail the complete operation: %j', async (invalid) => {
  const result = await executeAdapter(
    adapter({ parse: () => [reading(), { ...reading(), ...invalid }] as never }),
    [source()],
    factory,
    options()
  )
  expect(result.polls[0]).toMatchObject({ outcome: 'error', error: { type: 'schema' }, readings: [] })
})
test('multi-response operations retain both captures, reserve twice and never skip parse using only the final body digest', async () => {
  const c = context({ http: async () => new Response('{}') })
  let parsed = 0
  const a = adapter({
    fetch: async (_, ctx) => {
      await ctx.http('https://example.test/one')
      return (await ctx.http('https://example.test/two')).json()
    },
    parse: () => {
      parsed++
      return [reading()]
    }
  })
  const result = await executeAdapter(a, [source()], () => c, {
    ...options(),
    previousDigest: () => '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
  })
  expect(parsed).toBe(1)
  expect(result.requests.map((r) => r.url)).toEqual(['https://example.test/one', 'https://example.test/two'])
  expect(result.polls.map((p) => p.readings.length)).toEqual([0, 1])
  expect(JSON.parse(Buffer.from([...c.store.objects.values()][0]!.body).toString()).requests).toHaveLength(2)
})
test('an aggregate parse failure empties all per-request rows, retaining actual HTTP metadata', async () => {
  const a = adapter({
    fetch: async (_, ctx) => {
      await ctx.http('https://example.test/one')
      await ctx.http('https://example.test/two')
    },
    parse: () => {
      throw new SchemaError('changed schema')
    }
  })
  const result = await executeAdapter(a, [source()], factory, options())
  expect(result.polls.map((p) => p.outcome)).toEqual(['error', 'error'])
  expect(result.polls.flatMap((p) => p.readings)).toEqual([])
  expect(result.requests.map((r) => r.httpStatus)).toEqual([200, 200])
})
test('caught HTTP failures cannot cause an adapter to publish partial readings', async () => {
  const a = adapter({
    fetch: async (_, ctx) => {
      try {
        await ctx.http('https://example.test/one')
      } catch {
        // An adapter swallowing transport failure must not turn it into successful readings.
      }
      return {}
    }
  })
  const result = await executeAdapter(
    a,
    [source()],
    (sources) => context({ sources, http: async () => new Response('', { status: 500 }) }),
    options()
  )
  expect(result.polls[0]).toMatchObject({ outcome: 'error', readings: [], error: { type: 'http' } })
})

test('schema failures annotate the final request and logs preserve the scheduled slot and actual unchanged outcome', async () => {
  const c = context({ http: async () => new Response('{}') })
  const result = await executeAdapter(
    adapter({
      parse: () => {
        throw new SchemaError('bad shape')
      }
    }),
    [source()],
    () => c,
    options()
  )
  expect(result.requests.at(-1)?.error?.type).toBe('schema')
  const logs: unknown[] = []
  await executeAdapter(
    adapter({ parse: () => [] }),
    [source()],
    (sources) => context({ sources, http: async () => new Response('{}'), log: (_, fields) => logs.push(fields) }),
    options()
  )
  expect(logs[0]).toMatchObject({
    scheduled_at: '2026-11-09T23:59:00.000Z',
    started_at: '2026-11-10T00:00:00.000Z',
    lag_ms: 60000,
    http_status: 200,
    outcome: 'unchanged'
  })
})

test('parallel failure drains its held sibling before durable results, preserving each response error and stable bytes', async () => {
  const clock = new TestClock(),
    store = new MemoryStore()
  let release!: (response: Response) => void,
    returned = false,
    calls = 0
  let buffered: Awaited<ReturnType<ReturnType<typeof context>['ctx']['http']>> | undefined
  const held = new Promise<Response>((resolve) => {
    release = resolve
  })
  const c = context({
    clock,
    http: async (url) => {
      calls++
      return String(url).endsWith('/bad') ? new Response('', { status: 500 }) : held
    }
  })
  const a = adapter({
    fetch: async (_, ctx) =>
      Promise.all([
        ctx.http('https://example.test/bad'),
        ctx.http('https://example.test/held').then((response) => {
          buffered = response
          return response
        })
      ])
  })
  const execution = executeAdapter(a, [source()], () => c, { ...options(), clock }).then((result) => {
    returned = true
    return result
  })
  await flush()
  expect(returned).toBe(false)
  await clock.advance(125)
  release(new Response('hello', { status: 201 }))
  await flush()
  const result = await execution
  expect(result.requests.map((request) => request.httpStatus)).toEqual([500, 201])
  expect(result.requests.map((request) => request.error?.type ?? null)).toEqual(['http', null])
  expect(result.requests[1]).toMatchObject({
    latencyMs: 125,
    bodySha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
  })
  expect(result.polls.map((poll) => poll.outcome)).toEqual(['error', 'error'])
  expect(result.polls.flatMap((poll) => poll.readings)).toEqual([])
  await saveSourceResult(store, 'control/results/settled.json', result)
  const serialized = JSON.stringify(result),
    saved = await store.read('control/results/settled.json')
  await expect(buffered!.json()).rejects.toBeInstanceOf(SchemaError)
  await expect(c.ctx.http('https://example.test/late')).rejects.toBeInstanceOf(SchemaError)
  await expect(c.ctx.budget.take('datagovmy-weather')).rejects.toBeInstanceOf(SchemaError)
  await clock.advance(30000)
  expect(calls).toBe(2)
  expect(JSON.stringify(result)).toBe(serialized)
  expect(await store.read('control/results/settled.json')).toEqual(saved)
  expect(structuredClone(await loadSourceResult(store, 'control/results/settled.json'))).toEqual(result)
})

test('fetch settlement closes admission and drains detached preflight work before returning', async () => {
  const clock = new TestClock(),
    store = new MemoryStore()
  let release!: () => void,
    returned = false,
    calls = 0
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  store.read = async () => {
    await held
    return null
  }
  const c = context({
    clock,
    budget: store,
    http: async () => {
      calls++
      return new Response('ok')
    }
  })
  const a = adapter({
    fetch: async (_, ctx) => {
      void ctx.budget.take('datagovmy-weather')
      throw new SchemaError('fetch failed')
    }
  })
  const execution = executeAdapter(a, [source()], () => c, { ...options(), clock }).then((result) => {
    returned = true
    return result
  })
  await flush()
  expect(returned).toBe(false)
  await expect(c.ctx.http('https://example.test/late')).rejects.toBeInstanceOf(SchemaError)
  await clock.advance(20000)
  const result = await execution,
    serialized = JSON.stringify(result)
  expect(result.requests[0]).toMatchObject({ httpStatus: null, latencyMs: 20000, error: { type: 'rate_limited' } })
  release()
  await flush()
  expect(calls).toBe(0)
  expect(JSON.stringify(result)).toBe(serialized)
})

test('draining a timed-out parallel request preserves its own timeout and rejects late response mutation', async () => {
  const clock = new TestClock()
  let release!: (response: Response) => void,
    returned = false
  const held = new Promise<Response>((resolve) => {
    release = resolve
  })
  const c = context({
    clock,
    http: async (url) => (String(url).endsWith('/bad') ? new Response('', { status: 500 }) : held)
  })
  const a = adapter({
    fetch: async (_, ctx) => Promise.all([ctx.http('https://example.test/bad'), ctx.http('https://example.test/held')])
  })
  const execution = executeAdapter(a, [source()], () => c, { ...options(), clock }).then((result) => {
    returned = true
    return result
  })
  await flush()
  await clock.advance(19999)
  expect(returned).toBe(false)
  await clock.advance(1)
  const result = await execution,
    serialized = JSON.stringify(result)
  expect(result.requests.map((request) => request.error?.type)).toEqual(['http', 'timeout'])
  expect(result.requests[1]).toMatchObject({ httpStatus: null, latencyMs: 20000, body: null })
  expect(result.polls.flatMap((poll) => poll.readings)).toEqual([])
  release(new Response('late', { status: 201 }))
  await flush()
  expect(JSON.stringify(result)).toBe(serialized)
})
