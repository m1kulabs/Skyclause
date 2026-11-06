import { afterEach, expect, test, vi } from 'vitest'
import { cameraOperations, cameraTransport } from '../../features/camera/operations'
import type { Frame } from '../../features/camera/model'

afterEach(() => vi.unstubAllGlobals())
test('device transport uses registry schema, bearer only, stable capture key and API origin', async () => {
  const frame: Frame = {
    capture_id: '019a59e1-8000-7000-8000-000000000001',
    device_time: '2026-11-06T07:15:00+08:00',
    jpeg: 'test-masked-jpeg',
    distance_km: 2,
    ratio_near: 1,
    ratio_far: 0.4,
    flag: 'obscured',
    buffered: true,
    attempts: 2
  }
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('window', { location: { pathname: '/org/project/camera/source' } })
  vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return Response.json({
      source_id: 'source',
      accepted: 0,
      received_at: '2026-11-05T23:35:00Z',
      camera_day_start: '07:15',
      camera_day_end: '19:00'
    })
  })
  const send = cameraTransport('source', 'https://api.example.test')
  await send(frame, 'device-secret')
  await send(frame, 'device-secret')
  for (const { url, init } of calls) {
    expect(url).toBe('https://api.example.test/v1/ingest/source')
    expect(init.credentials).toBe('omit')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer device-secret')
    expect(headers.get('Idempotency-Key')).toBe(frame.capture_id)
    expect(headers.has('Skyclause-Organization')).toBe(false)
    const body = JSON.parse(String(init.body))
    expect(() => cameraOperations.ingestReadings.request.body.parse(body)).not.toThrow()
    expect(body).toMatchObject({
      kind: 'camera_frame',
      device_time: frame.device_time,
      buffered: true,
      capture_id: frame.capture_id,
      jpeg_b64: frame.jpeg
    })
    expect(body).not.toHaveProperty('attempts')
    expect(String(init.body)).not.toContain('device-secret')
  }
  await cameraTransport('source', '')(frame, 'device-secret')
  expect(calls[2]!.url).toBe('/v1/ingest/source')
  vi.stubGlobal('fetch', async () => Response.json({ ok: true, duplicate: true }))
  expect(await send(frame, 'device-secret')).toEqual({ ok: true, duplicate: true })
})
