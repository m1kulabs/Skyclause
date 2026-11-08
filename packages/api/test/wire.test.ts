import { Hono } from 'hono'
import { expect, it, vi } from 'vitest'
import { deprecate } from '../src/deprecation'
import { decodeCursor, encodeCursor, page } from '../src/pagination'
import { ApiError } from '../src/problems'
import { instant, toWire } from '../src/serialize'

it('serialises camelCase keys to snake_case and dates to RFC 3339 UTC, deeply', () => {
  expect(
    toWire({
      projectId: 'p-1',
      startsAt: new Date('2026-11-02T06:00:00.000Z'),
      inputs: [{ ageS: 300, observedAt: new Date('2026-11-02T07:05:00.500+00:00'), sourceIds: ['jps-1'] }],
      noCall: null,
      already_snake: 1
    })
  ).toEqual({
    project_id: 'p-1',
    starts_at: '2026-11-02T06:00:00Z',
    inputs: [{ age_s: 300, observed_at: '2026-11-02T07:05:00.500Z', source_ids: ['jps-1'] }],
    no_call: null,
    already_snake: 1
  })
  expect(instant(new Date('2026-11-08T02:00:00+08:00'))).toBe('2026-11-07T18:00:00Z')
})

it('round-trips an opaque cursor and pages with next_cursor while more remain', () => {
  const cursor = encodeCursor({ at: '2026-11-02T06:00:00Z', id: 'w-9' })
  expect(cursor).toMatch(/^[\w-]+$/)
  expect(decodeCursor(cursor)).toEqual({ at: '2026-11-02T06:00:00Z', id: 'w-9' })

  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  expect(page(rows, 2, (row) => ({ id: row.id }))).toEqual({
    data: [{ id: 'a' }, { id: 'b' }],
    next_cursor: encodeCursor({ id: 'b' })
  })
  expect(page(rows.slice(0, 2), 2, (row) => ({ id: row.id }))).toEqual({ data: rows.slice(0, 2), next_cursor: null })
})

it('refuses a cursor it did not make as 422 validation-failed on the cursor', () => {
  for (const bad of ['not base64 !', encodeURIComponent('[]'), Buffer.from('"x"').toString('base64url')]) {
    let thrown: unknown
    try {
      decodeCursor(bad)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({
      status: 422,
      slug: 'validation-failed',
      extra: { errors: [{ in: 'query', pointer: '/cursor' }] }
    })
  }
})

it('sets Deprecation (RFC 9745), Sunset (RFC 8594) and a deprecation Link', async () => {
  const app = new Hono().get('/v1/old', (c) => {
    deprecate(c, {
      deprecatedAt: new Date('2026-11-08T00:00:00Z'),
      sunsetAt: new Date('2027-05-08T00:00:00Z'),
      link: 'https://docs.skyclause.m1ku.tech/changelog#old'
    })
    return c.json({ ok: true })
  })
  const response = await app.request('/v1/old')
  expect(response.headers.get('Deprecation')).toBe('@1794096000')
  expect(response.headers.get('Sunset')).toBe('Sat, 08 May 2027 00:00:00 GMT')
  expect(response.headers.get('Link')).toBe('<https://docs.skyclause.m1ku.tech/changelog#old>; rel="deprecation"')
})

it('refuses a sunset less than six months after the deprecation (SDK-5)', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const app = new Hono().get('/v1/old', (c) => {
    deprecate(c, { deprecatedAt: new Date('2026-11-08T00:00:00Z'), sunsetAt: new Date('2027-03-08T00:00:00Z') })
    return c.json({ ok: true })
  })
  expect((await app.request('/v1/old')).status).toBe(500)
})
