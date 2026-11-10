import { createPollContext } from '../../src/sources/http'
import type { Source, SourceAdapter, ReadingInput } from '@skyclause/sources'
import type { SourceClock, SourceObjectStore } from '../../src/sources/types'

export const source = (id = 'rain-a'): Source => ({
  id,
  kind: 'jps_rain',
  externalId: id,
  name: id,
  lat: null,
  lon: null,
  url: 'https://example.test/rain',
  meta: {}
})
export const reading = (id = 'rain-a'): ReadingInput => ({
  sourceId: id,
  metric: 'rain_5m_mm',
  observedAt: '2026-11-10T00:00:00.000Z',
  value: 2,
  valueJson: null,
  unit: 'mm'
})
export function adapter(overrides: Partial<SourceAdapter<unknown>> = {}): SourceAdapter<unknown> {
  return {
    kind: 'jps_rain',
    apiFamily: 'datagovmy-weather',
    cadence: 60,
    freshness: 'observed',
    licence: { id: null, label: 'test' },
    batch: 'all_bound',
    indicators: [],
    fetch: async (sources, ctx) => (await ctx.http(sources[0]!.url)).json(),
    parse: (_, sources) => sources.map((s) => reading(s.id)),
    ...overrides
  }
}
export class TestClock implements SourceClock {
  time = Date.parse('2026-11-10T00:00:00.000Z')
  elapsed = 0
  sleepers: Array<{ at: number; resolve: () => void; signal?: AbortSignal }> = []
  now = () => new Date(this.time)
  monotonic = () => this.elapsed
  sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve()
      const sleeper = { at: this.elapsed + ms, resolve, signal }
      this.sleepers.push(sleeper)
      signal?.addEventListener(
        'abort',
        () => {
          this.sleepers = this.sleepers.filter((s) => s !== sleeper)
          resolve()
        },
        { once: true }
      )
    })
  async advance(ms: number) {
    this.time += ms
    this.elapsed += ms
    const due = this.sleepers.filter((s) => s.at <= this.elapsed)
    this.sleepers = this.sleepers.filter((s) => s.at > this.elapsed)
    due.forEach((s) => s.resolve())
    await flush()
  }
}
export async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}
export class MemoryStore implements SourceObjectStore {
  objects = new Map<string, { body: Uint8Array; generation: string }>()
  conflicts = 0
  sequence = 0
  async read(path: string) {
    const value = this.objects.get(path)
    return value ? { ...value, body: value.body.slice() } : null
  }
  async write(path: string, body: Uint8Array, expectedGeneration: string) {
    if ((this.objects.get(path)?.generation ?? '0') !== expectedGeneration) {
      this.conflicts++
      throw Object.assign(new Error('precondition'), { code: 412 })
    }
    const generation = String(++this.sequence)
    this.objects.set(path, { body: body.slice(), generation })
    return generation
  }
}
export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

export function context(overrides: Partial<Parameters<typeof createPollContext>[0]> = {}) {
  const clock = new TestClock(),
    store = new MemoryStore()
  let sequence = 0
  return {
    clock,
    store,
    ...createPollContext({
      kind: 'jps_rain',
      family: 'datagovmy-weather',
      sources: [source()],
      storage: { get: async () => null, put: async () => {} },
      budget: store,
      http: async () => new Response('hello'),
      userAgent: 'Skyclause/test',
      periods: async () => [],
      log: () => {},
      clock,
      requestId: () => `req-${++sequence}`,
      ...overrides
    })
  }
}
