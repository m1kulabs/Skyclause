import { expect, test } from 'vitest'
import { createSourceJobs, type SourceJobPorts } from '../src/sources/jobs'
import { MemoryStore, TestClock, adapter } from './support/source-adapter'
import type { DiscoveredSource } from '@skyclause/sources'

const fresh: DiscoveredSource[] = [
  {
    externalId: 'fresh-source',
    name: 'Fresh catalogue entry',
    lat: null,
    lon: null,
    url: 'https://example.test/source',
    meta: { revision: 'fresh' }
  }
]

function setup(
  adapters: SourceJobPorts['adapters'],
  write: SourceJobPorts['database']['catalogue'],
  store = new MemoryStore()
) {
  const logs: Array<{ message: string; fields?: Record<string, unknown> }> = []
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock: new TestClock(),
    id: () => '00000000-0000-7000-8000-000000000001',
    adapters,
    http: async () => {
      throw new Error('unexpected HTTP')
    },
    userAgent: 'test',
    publish: async () => {
      throw new Error('unexpected publication')
    },
    database: {
      snapshot: async () => {
        throw new Error('unexpected snapshot')
      },
      catalogue: write
    },
    log: (message, fields) => {
      logs.push({ message, fields })
    }
  })
  return { jobs, logs }
}

test('failed discovery preserves its catalogue while a later healthy provider persists', async () => {
  const failure = new Error('listing unavailable')
  const persisted = new Map<string, unknown>([['jps_rain', { existing: true }]])
  const { jobs, logs } = setup(
    [
      adapter({
        kind: 'jps_rain',
        discover: async () => {
          throw failure
        }
      }),
      adapter({ kind: 'apims', discover: async () => fresh })
    ],
    async (a, entries) => {
      persisted.set(a.kind, structuredClone(entries))
    }
  )
  const result = await jobs.catalogueSync().catch((error: unknown) => error)
  expect(result).toBe(failure)
  expect(persisted.get('jps_rain')).toEqual({ existing: true })
  expect(persisted.get('apims')).toEqual([
    {
      externalId: 'fresh-source',
      name: 'Fresh catalogue entry',
      lat: null,
      lon: null,
      url: 'https://example.test/source',
      meta: { revision: 'fresh' }
    }
  ])
  expect(logs).toContainEqual({
    message: 'source.catalogue.failed',
    fields: { adapter: 'jps_rain', error: failure.message }
  })
  expect(logs.some((l) => l.message === 'source.catalogue.complete')).toBe(false)
})

test('a failed slot-plan read does not prevent independent ordinary discovery', async () => {
  const store = new MemoryStore(),
    failure = new Error('plan unavailable')
  store.read = async () => {
    throw failure
  }
  const persisted: string[] = []
  const { jobs } = setup(
    [
      adapter({
        kind: 'apims',
        discover: undefined,
        latestSlot: { seconds: 900, decode: () => ({}), discover: () => [] }
      }),
      adapter({ kind: 'jps_rain', discover: async () => fresh })
    ],
    async (a) => {
      persisted.push(a.kind)
    },
    store
  )
  const result = await jobs.catalogueSync().catch((error: unknown) => error)
  expect(result).toBe(failure)
  expect(persisted).toEqual(['jps_rain'])
})

test('all failed discoveries retain every original error and write nothing', async () => {
  const first = new Error('first unavailable'),
    second = new Error('second unavailable')
  const persisted: string[] = []
  const { jobs } = setup(
    [
      adapter({
        kind: 'jps_rain',
        discover: async () => {
          throw first
        }
      }),
      adapter({
        kind: 'apims',
        discover: async () => {
          throw second
        }
      })
    ],
    async (a) => {
      persisted.push(a.kind)
    }
  )
  const result = await jobs.catalogueSync().catch((error: unknown) => error)
  expect(result).toBeInstanceOf(AggregateError)
  expect((result as AggregateError).errors).toEqual([first, second])
  expect(String(result)).toContain('jps_rain')
  expect(String(result)).toContain('first unavailable')
  expect(String(result)).toContain('apims')
  expect(String(result)).toContain('second unavailable')
  expect(persisted).toEqual([])
})

test.each([false, true])(
  'database failure stops later discovery (earlier provider failure: %s)',
  async (earlyFailure) => {
    const databaseFailure = new Error('database unavailable'),
      visited: string[] = []
    const adapters = [
      ...(earlyFailure
        ? [
            adapter({
              kind: 'jps_rain',
              discover: async () => {
                throw new Error('listing unavailable')
              }
            })
          ]
        : []),
      adapter({
        kind: 'apims',
        discover: async () => {
          visited.push('apims')
          return fresh
        }
      }),
      adapter({
        kind: 'met_forecast',
        discover: async () => {
          visited.push('met_forecast')
          return fresh
        }
      })
    ]
    const { jobs } = setup(adapters, async () => {
      throw databaseFailure
    })
    await expect(jobs.catalogueSync()).rejects.toBe(databaseFailure)
    expect(visited).toEqual(['apims'])
  }
)

test('successful discoveries skip ineligible adapters and report genuine completion', async () => {
  const persisted: string[] = []
  const { jobs, logs } = setup(
    [
      adapter({ kind: 'jps_rain', discover: async () => fresh }),
      adapter({ kind: 'camera', discover: undefined }),
      adapter({ kind: 'apims', discover: async () => [] })
    ],
    async (a) => {
      persisted.push(a.kind)
    }
  )
  await expect(jobs.catalogueSync()).resolves.toBeUndefined()
  expect(persisted).toEqual(['jps_rain', 'apims'])
  expect(logs).toContainEqual({ message: 'source.catalogue.complete', fields: { adapters: 2 } })
  expect(logs.some((l) => l.message === 'source.catalogue.failed')).toBe(false)
})
