import { expect, test } from 'vitest'
import { SchemaError } from '@skyclause/sources'
import { executeAdapter } from '../src/sources/execute'
import { adapter, context, reading, source, TestClock } from './support/source-adapter'
const options = () => ({
  operationId: 'operation',
  purpose: 'poll' as const,
  scheduledAt: '2026-11-09T23:59:00.000Z',
  clock: new TestClock(),
  requestId: () => 'no-request'
})
const factory = (sources: ReturnType<typeof source>[]) => context({ sources, http: async () => new Response('{}') })
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
