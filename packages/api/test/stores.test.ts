import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { postgresIdempotency, postgresRateLimits } from '../src/postgres-stores'
import type { IdempotencyStore, RateLimitStore } from '../src/stores'
import { memoryIdempotencyStore, memoryRateLimitStore } from './harness'

// One contract for both: the in-memory stores the tests use must behave as the Postgres ones production runs.
describe.each<[string, () => { idempotency: IdempotencyStore; rateLimits: RateLimitStore }]>([
  ['in-memory', () => ({ idempotency: memoryIdempotencyStore(), rateLimits: memoryRateLimitStore() })],
  ['Postgres', () => ({ idempotency: postgresIdempotency, rateLimits: postgresRateLimits })]
])('%s stores', (_, stores) => {
  const now = new Date('2026-11-09T02:00:00Z')
  const day = 86_400_000
  const record = (requestHash: string, at = now) => ({
    scope: `org:${randomUUID()}`,
    route: 'POST /v1/projects/:id/windows',
    key: randomUUID(),
    requestHash,
    expiresAt: new Date(at.getTime() + day),
    response: null
  })
  const response = { status: 201, contentType: 'application/json', location: '/v1/windows/w-1', body: '{"id":"w-1"}' }

  it('reserves a key once, holds it pending, then replays the completed response', async () => {
    const { idempotency } = stores()
    const first = record('hash-a')
    expect(await idempotency.reserve(first, now)).toBeNull()
    expect(await idempotency.reserve({ ...first, requestHash: 'hash-b' }, now)).toMatchObject({
      requestHash: 'hash-a',
      response: null
    })
    await idempotency.complete(first, response)
    expect(await idempotency.reserve(first, now)).toMatchObject({ requestHash: 'hash-a', response })
  })

  it('releases only a pending key it reserved, with its own request hash', async () => {
    const { idempotency } = stores()
    const first = record('hash-a')
    await idempotency.reserve(first, now)
    await idempotency.release({ ...first, requestHash: 'hash-other' })
    expect(await idempotency.reserve(first, now)).toMatchObject({ requestHash: 'hash-a' })
    await idempotency.release(first)
    expect(await idempotency.reserve(first, now)).toBeNull()

    await idempotency.complete(first, response)
    await idempotency.release(first)
    expect(await idempotency.reserve(first, now)).toMatchObject({ response })
  })

  it('frees a key after 24 hours, for a request with another body', async () => {
    const { idempotency } = stores()
    const first = record('hash-a')
    await idempotency.reserve(first, now)
    await idempotency.complete(first, response)
    const later = new Date(now.getTime() + day)
    const retry = { ...first, requestHash: 'hash-b', expiresAt: new Date(later.getTime() + day) }
    expect(await idempotency.reserve(retry, later)).toBeNull()
    expect(await idempotency.reserve(retry, later)).toMatchObject({ requestHash: 'hash-b', response: null })
  })

  it('counts hits in a fixed window and opens a new one when it ends', async () => {
    const { rateLimits } = stores()
    const bucket = `ip:${randomUUID()}`
    const hit = (offsetS: number) =>
      rateLimits.hit({ bucket, windowS: 60, now: new Date(now.getTime() + offsetS * 1000) })
    expect(await hit(0)).toEqual({ count: 1, resetAt: new Date('2026-11-09T02:01:00Z') })
    expect(await hit(59)).toEqual({ count: 2, resetAt: new Date('2026-11-09T02:01:00Z') })
    expect(await hit(60)).toEqual({ count: 1, resetAt: new Date('2026-11-09T02:02:00Z') })
  })
})
