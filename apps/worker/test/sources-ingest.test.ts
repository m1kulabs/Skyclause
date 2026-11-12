import { afterEach, expect, test, vi } from 'vitest'
import { ingestSourceResult, drainSourceResults } from '../src/sources/ingest'
import { publishSourceResult } from '../src/sources/pubsub'
import { MemoryStore } from './support/source-adapter'
import type { SourceExecutionResult } from '../src/sources/types'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const body = Buffer.from('{}')
function result(): SourceExecutionResult {
  return {
    operationId: id(1),
    kind: 'jps_rain',
    purpose: 'poll',
    scheduledAt: null,
    requests: [
      {
        requestId: id(2),
        sourceIds: [id(3)],
        url: 'https://example.test',
        startedAt: '2026-11-10T00:00:00.000Z',
        httpStatus: 200,
        latencyMs: 1,
        body,
        bodySha256: createHash('sha256').update(body).digest('hex'),
        error: null
      }
    ],
    polls: [{ sourceId: id(3), requestId: id(2), outcome: 'unchanged', error: null, readings: [] }]
  }
}
test('bad hash and malformed results never reach persistence', async () => {
  const store = new MemoryStore()
  let ref: unknown
  await publishSourceResult(result(), {
    store,
    publish: async (value) => {
      ref = value
    }
  })
  const persist = vi.fn(async () => [])
  const deps = { store, persist, fanout: vi.fn(async () => {}), publish: vi.fn(async () => {}) }
  await expect(ingestSourceResult({ ...(ref as object), sha256: '0'.repeat(64) }, deps)).rejects.toThrow('hash')
  expect(persist).not.toHaveBeenCalled()
})
test('a failed result remains unacked while independent good messages drain', async () => {
  const ack = vi.fn(async () => {}),
    ingest = vi.fn(async (data: unknown) => {
      if (data === 'bad') throw new Error('bad result')
    })
  await expect(
    drainSourceResults({
      pull: async () => [
        { ackId: 'bad', data: 'bad' },
        { ackId: 'good', data: 'good' }
      ],
      ack,
      ingest
    })
  ).rejects.toThrow('bad')
  expect(ack).toHaveBeenCalledWith(['good'])
})

import { parseSourceResult } from '../src/sources/ingest'
import { sourceSubscription } from '../src/sources/pubsub'
const serialized = () => {
  const r = result()
  return { ...r, requests: r.requests.map((r) => ({ ...r, body: Buffer.from(r.body!).toString('base64') })) }
}
test.each(['operation', 'kind', 'path'])('result reference %s is checked before persistence', async (field) => {
  const store = new MemoryStore()
  let ref: unknown
  await publishSourceResult(result(), {
    store,
    publish: async (value) => {
      ref = value
    }
  })
  const input = { ...(ref as Record<string, unknown>) }
  if (field === 'operation') input.operation_id = id(99)
  if (field === 'kind') input.kind = 'apims'
  if (field === 'path') input.object_path = '../elsewhere'
  const persist = vi.fn(async () => [])
  await expect(
    ingestSourceResult(input, { store, persist, fanout: async () => {}, publish: async () => {} })
  ).rejects.toThrow()
  expect(persist).not.toHaveBeenCalled()
})
test.each(['body', 'status', 'metric', 'source', 'duplicate', 'internal'])(
  'durable schema rejects invalid %s',
  (field) => {
    const r = serialized()
    if (field === 'body') r.requests[0]!.body = 'YQ=='
    if (field === 'status') r.requests[0]!.httpStatus = 0
    if (field === 'internal') r.polls[0]!.error = { type: 'internal', message: 'bug' }
    if (field === 'duplicate') r.polls.push(r.polls[0]!)
    if (field === 'source') r.polls[0]!.sourceId = id(88)
    if (field === 'metric') {
      r.polls[0]!.outcome = 'ok'
      r.polls[0]!.readings = [
        { sourceId: id(3), metric: 'wrong', observedAt: '2026-11-10T00:00:00Z', value: 1, valueJson: null, unit: 'mm' }
      ] as never
    }
    expect(() => parseSourceResult(r)).toThrow()
  }
)
test('REST pull preserves malformed messages for isolated failure and acknowledges only explicit IDs', async () => {
  const calls: Array<{ url: string; body: unknown }> = []
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers({ authorization: 'Bearer test' }),
    http: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(
        String(url).endsWith(':pull')
          ? JSON.stringify({
              receivedMessages: [
                { ackId: 'bad', message: { data: Buffer.from('invalid').toString('base64') } },
                { ackId: 'good', message: { data: Buffer.from('{}').toString('base64') } }
              ]
            })
          : '{}'
      )
    }
  })
  expect(await subscription.pullSourceResults()).toEqual([
    { ackId: 'bad', data: null },
    { ackId: 'good', data: {} }
  ])
  await subscription.ackSourceResults(['good'])
  expect(calls[1]).toEqual({
    url: 'https://pubsub.googleapis.com/v1/projects/project/subscriptions/subscription:acknowledge',
    body: { ackIds: ['good'] }
  })
})
test.each([403, 500])('REST %s failures propagate without pretending an empty pull succeeded', async (status) => {
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers(),
    http: async () => new Response('denied', { status })
  })
  await expect(subscription.pullSourceResults()).rejects.toThrow(String(status))
})

afterEach(() => vi.restoreAllMocks())
function controlledDeadline() {
  const controller = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  const expire = () => controller.abort(new DOMException('Owned wait expired', 'TimeoutError'))
  return { controller, timeout, expire }
}
test('REST pull bounds its wait and an owned expiry drains no messages or acknowledgements', async () => {
  const deadline = controlledDeadline(),
    ingest = vi.fn(async () => {}),
    http = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.signal).toBe(deadline.controller.signal)
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
        deadline.expire()
      })
    })
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers(),
    http
  })
  await expect(
    drainSourceResults({ pull: subscription.pullSourceResults, ack: subscription.ackSourceResults, ingest })
  ).resolves.toBeUndefined()
  expect(deadline.timeout).toHaveBeenCalledExactlyOnceWith(5000)
  expect(ingest).not.toHaveBeenCalled()
  expect(http).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(http.mock.calls[0]![1]?.body))).toEqual({ maxMessages: 100 })
})
test('REST pull native body expiry does not deliver or acknowledge unseen messages', async () => {
  const deadline = controlledDeadline(),
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"receivedMessages":[')
    }),
    ingest = vi.fn(async () => {})
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected local HTTP address')
  const http = vi.fn<typeof fetch>(async (_url, init) => {
    const response = await fetch(`http://127.0.0.1:${address.port}`, init)
    deadline.expire()
    return response
  })
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers(),
    http
  })
  try {
    await expect(
      drainSourceResults({ pull: subscription.pullSourceResults, ack: subscription.ackSourceResults, ingest })
    ).resolves.toBeUndefined()
    expect(http).toHaveBeenCalledTimes(1)
    expect(ingest).not.toHaveBeenCalled()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})
test.each(['abort', 'network', 'http'])(
  'REST body %s failure remains visible without an attributable successful-response expiry',
  async (kind) => {
    const deadline = controlledDeadline(),
      error = kind === 'network' ? new TypeError('body failed') : new DOMException('Body aborted', 'AbortError')
    const subscription = sourceSubscription('project', 'subscription', {
      headers: async () => new Headers(),
      http: async () => {
        const response = new Response(null, { status: kind === 'http' ? 403 : 200 })
        vi.spyOn(response, 'text').mockImplementation(async () => {
          if (kind !== 'abort') deadline.expire()
          throw error
        })
        return response
      }
    })
    await expect(subscription.pullSourceResults()).rejects.toBe(error)
  }
)
test.each(['timeout', 'abort', 'network', 'expired-wrong-reason'])(
  'REST pull preserves a foreign %s failure',
  async (kind) => {
    const deadline = controlledDeadline(),
      error = new DOMException('Foreign failure', kind === 'abort' ? 'AbortError' : 'TimeoutError')
    const subscription = sourceSubscription('project', 'subscription', {
      headers: async () => new Headers(),
      http: async () => {
        if (kind === 'expired-wrong-reason') deadline.expire()
        if (kind === 'network') throw new TypeError('network failed')
        throw error
      }
    })
    if (kind === 'network') await expect(subscription.pullSourceResults()).rejects.toThrow('network failed')
    else await expect(subscription.pullSourceResults()).rejects.toBe(error)
  }
)
test('REST pull preserves credential failures before HTTP', async () => {
  const error = new Error('credentials failed'),
    http = vi.fn<typeof fetch>()
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => {
      throw error
    },
    http
  })
  await expect(subscription.pullSourceResults()).rejects.toBe(error)
  expect(http).not.toHaveBeenCalled()
})
test.each(['{}', '{"receivedMessages":[]}'])('REST successful empty response %s delivers no messages', async (body) => {
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers(),
    http: async () => new Response(body)
  })
  expect(await subscription.pullSourceResults()).toEqual([])
})
test.each(['invalid', 'null', '{"receivedMessages":{}}', '{"receivedMessages":[{"ackId":""}]}'])(
  'REST invalid response %s remains a failure',
  async (body) => {
    const subscription = sourceSubscription('project', 'subscription', {
      headers: async () => new Headers(),
      http: async () => new Response(body)
    })
    await expect(subscription.pullSourceResults()).rejects.toThrow()
  }
)
test.each(['timeout', 'http'])('REST acknowledgement %s failure remains visible', async (kind) => {
  const deadline = controlledDeadline()
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers(),
    http: async () => {
      if (kind === 'http') return new Response('failed', { status: 500 })
      deadline.expire()
      throw deadline.controller.signal.reason
    }
  })
  if (kind === 'http') await expect(subscription.ackSourceResults(['delivered'])).rejects.toThrow('500')
  else await expect(subscription.ackSourceResults(['delivered'])).rejects.toThrow('Owned wait expired')
  expect(deadline.timeout).toHaveBeenCalledExactlyOnceWith(20000)
})
test('REST empty acknowledgements perform no HTTP', async () => {
  const http = vi.fn<typeof fetch>()
  const subscription = sourceSubscription('project', 'subscription', {
    headers: async () => new Headers(),
    http
  })
  await subscription.ackSourceResults([])
  expect(http).not.toHaveBeenCalled()
})

import { repairSourceResults, MAX_PENDING_RESULTS, reserveSourceResult, pendingResult } from '../src/sources/pubsub'
import { encodeObject } from '../src/sources/storage'
test('failed publication repairs immutable bytes and stable identity without a new execution', async () => {
  const store = new MemoryStore(),
    r = result()
  await expect(
    publishSourceResult(r, {
      store,
      publish: async () => {
        throw new Error('PubSub unavailable')
      }
    })
  ).rejects.toThrow('PubSub unavailable')
  const before = [...store.objects.entries()].filter(([path]) => path.startsWith('control/deliveries/'))
  const published: unknown[] = []
  await repairSourceResults({
    store,
    publish: async (ref) => {
      published.push(ref)
    }
  })
  expect(published).toHaveLength(1)
  expect(published[0]).toMatchObject({ operation_id: r.operationId })
  expect([...store.objects.entries()].filter(([path]) => path.startsWith('control/deliveries/'))).toEqual(before)
})
test('a crash before immutable save leaves discoverable intent and repair fails visibly', async () => {
  const store = new MemoryStore(),
    write = store.write.bind(store)
  store.write = async (path, body, generation) => {
    if (path.startsWith('control/deliveries/')) throw new Error('crash before save')
    return write(path, body, generation)
  }
  await expect(
    publishSourceResult(result(), {
      store,
      publish: async () => {
        throw new Error('must not publish')
      }
    })
  ).rejects.toThrow('crash before save')
  expect(await store.read('control/pending-results.json')).not.toBeNull()
  await expect(
    repairSourceResults({
      store,
      publish: async () => {
        throw new Error('must not publish')
      }
    })
  ).rejects.toThrow('missing or corrupt')
})
test('concurrent outbox CAS appends preserve every pending operation and capacity fails closed', async () => {
  const store = new MemoryStore(),
    refs = Array.from({ length: 4 }, (_, n) => ({
      operation_id: id(n + 50),
      kind: 'jps_rain' as const,
      object_path: `control/deliveries/jps_rain/${id(n + 50)}.json`,
      sha256: 'a'.repeat(64)
    }))
  await Promise.all(refs.map((ref) => pendingResult(store, ref, false)))
  expect(JSON.parse(Buffer.from((await store.read('control/pending-results.json'))!.body).toString())).toHaveLength(4)
  expect(store.conflicts).toBeGreaterThan(0)
  const full = Array.from({ length: MAX_PENDING_RESULTS }, (_, n) => ({ ...refs[0]!, operation_id: id(n + 100) }))
  const saved = (await store.read('control/pending-results.json'))!
  await store.write('control/pending-results.json', encodeObject(full), saved.generation)
  await expect(reserveSourceResult(store, id(1), 'jps_rain', new Date())).rejects.toThrow('outbox is full')
  await expect(pendingResult(store, refs[0]!, false)).rejects.toThrow('outbox is full')
  expect(JSON.parse(Buffer.from((await store.read('control/pending-results.json'))!.body).toString())).toHaveLength(
    MAX_PENDING_RESULTS
  )
})

import { SOURCE_RESERVATION_MS } from '../src/sources/pubsub'
test('an in-flight reservation is repair-safe, while expiry reports without reclaiming its slot', async () => {
  const store = new MemoryStore(),
    now = new Date('2026-11-10T00:00:00.000Z'),
    publish = vi.fn(async () => {})
  await reserveSourceResult(store, id(5000), 'jps_rain', now)
  const saved = await store.read('control/pending-results.json')
  await repairSourceResults({ store, publish, now: () => now })
  expect(publish).not.toHaveBeenCalled()
  await expect(
    repairSourceResults({ store, publish, now: () => new Date(now.getTime() + SOURCE_RESERVATION_MS) })
  ).rejects.toThrow('reservation expired')
  expect(await store.read('control/pending-results.json')).toEqual(saved)
  // Retrying the reservation cannot restart its reporting clock.
  await reserveSourceResult(store, id(5000), 'jps_rain', new Date(now.getTime() + SOURCE_RESERVATION_MS))
  expect(await store.read('control/pending-results.json')).toEqual(saved)
})
test('a reserved operation finalizes and repairs the same bytes after other producers fill capacity', async () => {
  const store = new MemoryStore(),
    r = result(),
    now = new Date()
  await reserveSourceResult(store, r.operationId, r.kind, now)
  const existing = JSON.parse(Buffer.from((await store.read('control/pending-results.json'))!.body).toString())
  const saved = (await store.read('control/pending-results.json'))!
  await store.write(
    'control/pending-results.json',
    encodeObject([
      ...existing,
      ...Array.from({ length: MAX_PENDING_RESULTS - 1 }, (_, n) => ({
        operation_id: id(n + 10),
        kind: 'jps_rain',
        object_path: `control/deliveries/jps_rain/${id(n + 10)}.json`,
        reserved_until: new Date(now.getTime() + SOURCE_RESERVATION_MS).toISOString()
      }))
    ]),
    saved.generation
  )
  await expect(
    publishSourceResult(r, {
      store,
      publish: async () => {
        throw new Error('publish failed')
      }
    })
  ).rejects.toThrow('publish failed')
  const published: unknown[] = []
  await repairSourceResults({
    store,
    publish: async (ref) => {
      published.push(ref)
    },
    now: () => now
  })
  expect(published).toHaveLength(1)
  expect(published[0]).toMatchObject({ operation_id: r.operationId })
  expect(JSON.parse(Buffer.from((await store.read('control/pending-results.json'))!.body).toString())).toHaveLength(
    MAX_PENDING_RESULTS
  )
})

test.each(['unchanged', 'error'] as const)(
  'zero-row %s results retain fanout and ack without readings-updated',
  async (outcome) => {
    const store = new MemoryStore(),
      r = result()
    let ref: unknown
    if (outcome === 'error') {
      r.polls[0]!.outcome = 'error'
      r.polls[0]!.error = { type: 'schema', message: 'bad schema' }
      r.requests[0]!.error = r.polls[0]!.error
    }
    await publishSourceResult(r, {
      store,
      publish: async (value) => {
        ref = value
      }
    })
    const fanout = vi.fn(async () => {}),
      publish = vi.fn(async () => {
        throw new Error('unnecessary publication')
      }),
      ack = vi.fn(async () => {})
    await drainSourceResults({
      pull: async () => [{ ackId: 'zero', data: ref }],
      ack,
      ingest: (data) =>
        ingestSourceResult(data, {
          store,
          persist: async () => [
            {
              id: id(800),
              sourceId: id(3),
              kind: r.kind,
              outcome,
              httpStatus: 200,
              newRows: 0,
              purpose: 'poll',
              startedAt: new Date(r.requests[0]!.startedAt),
              receivedAt: new Date('2026-11-10T02:00:00Z')
            }
          ],
          fanout,
          publish
        })
    })
    expect(fanout).toHaveBeenCalledTimes(1)
    expect(publish).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledWith(['zero'])
    expect(await store.read(`control/receipts/${r.operationId}.json`)).not.toBeNull()
  }
)
