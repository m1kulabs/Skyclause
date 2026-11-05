import { describe, expect, test } from 'bun:test'
import type { PostBody } from '../../shared/device-post.ts'
import type { ScriptProperty } from './properties.ts'
import { handleGet, handlePost, type GetRoute, type PostRoute } from './router.ts'

function harness(properties: Partial<Record<ScriptProperty, string>> = { CAMERA_TOKEN: 'camera-secret' }) {
  const events: string[] = []
  const received: PostBody[] = []
  const deps = {
    getProperty: (name: ScriptProperty) => properties[name] ?? null,
    withLock: <T>(fn: () => T): T => {
      events.push('lock')
      try {
        return fn()
      } finally {
        events.push('unlock')
      }
    }
  }
  const routes: PostRoute[] = [
    {
      kind: 'camera_frame',
      tokenProperty: 'CAMERA_TOKEN',
      handle: (body) => {
        events.push('handle')
        received.push(body)
        return { ok: true, duplicate: false }
      }
    }
  ]
  return { events, received, deps, routes }
}

const frame = { kind: 'camera_frame', token: 'camera-secret', device_id: 'cam-1', capture_id: 'c-1' }

describe('handlePost', () => {
  test('runs the kind handler under the script lock, without the token', () => {
    const { events, received, deps, routes } = harness()
    expect(handlePost(JSON.stringify(frame), routes, deps)).toEqual({ ok: true, duplicate: false })
    expect(events).toEqual(['lock', 'handle', 'unlock'])
    expect(received).toEqual([{ kind: 'camera_frame', device_id: 'cam-1', capture_id: 'c-1' }])
  })

  const malformed: [string, string | undefined][] = [
    ['no body', undefined],
    ['an empty body', ''],
    ['a body that is not JSON', '{kind: camera_frame'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['a missing kind', JSON.stringify({ ...frame, kind: undefined })],
    ['a non-string kind', JSON.stringify({ ...frame, kind: 7 })],
    ['a missing token', JSON.stringify({ ...frame, token: undefined })],
    ['a missing device_id', JSON.stringify({ ...frame, device_id: undefined })],
    ['an empty device_id', JSON.stringify({ ...frame, device_id: '' })]
  ]
  for (const [name, body] of malformed) {
    test(`rejects ${name} as malformed, touching nothing`, () => {
      const { events, deps, routes } = harness()
      expect(handlePost(body, routes, deps)).toEqual({ ok: false, error: 'malformed body' })
      expect(events).toEqual([])
    })
  }

  test('rejects an unknown kind, touching nothing', () => {
    const { events, deps, routes } = harness()
    expect(handlePost(JSON.stringify({ ...frame, kind: 'pi_rows' }), routes, deps)).toEqual({
      ok: false,
      error: 'unknown kind'
    })
    expect(events).toEqual([])
  })

  test('rejects a wrong token, touching nothing', () => {
    const { events, deps, routes } = harness()
    expect(handlePost(JSON.stringify({ ...frame, token: 'guess' }), routes, deps)).toEqual({
      ok: false,
      error: 'bad token'
    })
    expect(events).toEqual([])
  })

  test('rejects every token while the token property is unset or empty', () => {
    for (const properties of [{}, { CAMERA_TOKEN: '' }]) {
      const { events, deps, routes } = harness(properties)
      expect(handlePost(JSON.stringify({ ...frame, token: '' }), routes, deps)).toEqual({
        ok: false,
        error: 'bad token'
      })
      expect(events).toEqual([])
    }
  })

  test('turns a handler failure into an error result and releases the lock', () => {
    const { events, deps } = harness()
    const failing: PostRoute[] = [
      {
        kind: 'camera_frame',
        tokenProperty: 'CAMERA_TOKEN',
        handle: () => {
          throw new Error('Drive quota exceeded')
        }
      }
    ]
    expect(handlePost(JSON.stringify(frame), failing, deps)).toEqual({ ok: false, error: 'Drive quota exceeded' })
    expect(events).toEqual(['lock', 'unlock'])
  })

  test('turns a lock timeout into an error result', () => {
    const { deps, routes } = harness()
    const busy = {
      ...deps,
      withLock: () => {
        throw new Error('Lock timeout: another process was holding the lock for too long.')
      }
    }
    expect(handlePost(JSON.stringify(frame), routes, busy)).toEqual({
      ok: false,
      error: 'Lock timeout: another process was holding the lock for too long.'
    })
  })
})

describe('handleGet', () => {
  const getRoutes: GetRoute[] = [
    { param: 'kind', value: 'camera_config', handle: () => ({ json: { day_start: '07:15', day_end: '19:00' } }) },
    { param: 'page', value: 'label', handle: () => ({ html: '<p>label</p>' }) },
    { param: 'kind', value: 'probe_schedule', tokenProperty: 'PI_TOKEN', handle: () => ({ json: { nights: [] } }) }
  ]
  const deps = { getProperty: (name: ScriptProperty) => (name === 'PI_TOKEN' ? 'pi-secret' : null) }
  const health = () => ({ ok: true, sha: 'abc' })

  test('answers health=1 with the health report', () => {
    expect(handleGet({ health: '1' }, getRoutes, health, deps)).toEqual({ json: { ok: true, sha: 'abc' } })
  })

  test('dispatches on page and on kind', () => {
    expect(handleGet({ page: 'label' }, getRoutes, health, deps)).toEqual({ html: '<p>label</p>' })
    expect(handleGet({ kind: 'camera_config' }, getRoutes, health, deps)).toEqual({
      json: { day_start: '07:15', day_end: '19:00' }
    })
  })

  test('rejects an unknown page, kind or empty query', () => {
    for (const params of [{ page: 'admin' }, { kind: 'camera_frame' }, {}] as Record<string, string>[]) {
      expect(handleGet(params, getRoutes, health, deps)).toEqual({ json: { ok: false, error: 'unknown route' } })
    }
  })

  test('checks the token of a route that names one', () => {
    expect(handleGet({ kind: 'probe_schedule', token: 'guess' }, getRoutes, health, deps)).toEqual({
      json: { ok: false, error: 'bad token' }
    })
    expect(handleGet({ kind: 'probe_schedule', token: 'pi-secret' }, getRoutes, health, deps)).toEqual({
      json: { nights: [] }
    })
  })

  test('turns a failure into an error result', () => {
    const broken = () => {
      throw new Error('SHEET_ID is not set')
    }
    expect(handleGet({ health: '1' }, getRoutes, broken, deps)).toEqual({
      json: { ok: false, error: 'SHEET_ID is not set' }
    })
  })
})
