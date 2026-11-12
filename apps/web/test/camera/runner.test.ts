import { expect, test } from 'vitest'
import { CameraRunner } from '../../features/camera/runner'
import type { Frame, Setup } from '../../features/camera/model'
import type { CameraStore } from '../../features/camera/storage'
import { ApiProblem } from '../../lib/api-fetch'

const setup: Setup = {
  token: 'test-device-token',
  distance_km: 2,
  start: '07:15',
  end: '19:00',
  near: { x: 0, y: 0, width: 0.1, height: 0.1 },
  far: { x: 0.3, y: 0, width: 0.1, height: 0.1 },
  reference: { jpeg: 'test-masked', near: 1, far: 1 },
  consent: true
}
function harness() {
  let now = Date.parse('2026-11-06T07:15:00+08:00'),
    online = false
  let stored: Setup = structuredClone(setup)
  const frames = new Map<string, Frame>(),
    posts: Frame[] = []
  const store: CameraStore = {
    setup: async () => stored,
    saveSetup: async (s) => {
      stored = structuredClone(s)
    },
    frames: async () => [...frames.values()].sort((a, b) => a.capture_id.localeCompare(b.capture_id)),
    put: async (f) => {
      frames.set(f.capture_id, structuredClone(f))
    },
    remove: async (id) => {
      frames.delete(id)
    },
    close() {}
  }
  let failure: ApiProblem | undefined
  let duplicate = false
  let visible = true
  let onPost: (() => Promise<void>) | undefined
  let captures = 0
  const events: string[] = []
  const runner = new CameraRunner({
    store,
    now: () => now,
    online: () => online,
    visible: () => visible,
    capture: async () => {
      captures++
      return { jpeg: 'test-masked', ratio_far: 1, ratio_near: 1, flag: 'visible' }
    },
    post: async (f) => {
      posts.push(structuredClone(f))
      await onPost?.()
      if (failure) throw failure
      if (duplicate) return { ok: true as const, duplicate: true as const }
      return {
        source_id: 'source',
        accepted: 1,
        received_at: new Date(now).toISOString(),
        camera_day_start: '07:25',
        camera_day_end: '18:45'
      }
    },
    emit: (event) => events.push(event.key)
  })
  return {
    runner,
    store,
    frames,
    posts,
    events,
    captures: () => captures,
    time: (iso: string) => {
      now = Date.parse(iso)
    },
    online: () => {
      online = true
    },
    fail: (status: number, type = 'test', extra: Record<string, unknown> = {}) => {
      failure = new ApiProblem(status, { type, ...extra })
    },
    recover: () => {
      failure = undefined
    },
    duplicate: () => {
      duplicate = true
    },
    hide: () => {
      visible = false
    },
    onPost: (callback: () => Promise<void>) => {
      onPost = callback
    }
  }
}

test('SIG-8: three offline marks drain oldest first with original times and buffered true', async () => {
  const h = harness()
  for (const time of ['07:15', '07:25', '07:35']) {
    h.time(`2026-11-06T${time}:00+08:00`)
    await h.runner.step()
  }
  expect(h.frames.size).toBe(3)
  h.online()
  await h.runner.step()
  expect(h.posts.map((f) => f.device_time)).toEqual(
    ['07:15', '07:25', '07:35'].map((time) => `2026-11-06T${time}:00.000+08:00`)
  )
  expect(h.posts.every((f) => f.buffered)).toBe(true)
  expect(h.frames.size).toBe(0)
  expect(await h.store.setup()).toMatchObject({ start: '07:25', end: '18:45' })
})

test('no capture or post outside daylight, including a queue carried past dusk', async () => {
  const h = harness()
  await h.runner.step()
  h.online()
  for (const time of ['2026-11-06T19:00:00+08:00', '2026-11-07T07:14:59+08:00']) {
    h.time(time)
    await h.runner.step()
  }
  expect(h.captures()).toBe(1)
  expect(h.posts).toHaveLength(0)
  expect(h.frames.size).toBe(1)
})

test('401 stops uploads until setup is saved with a new token', async () => {
  const h = harness()
  h.online()
  h.fail(401)
  await h.runner.step()
  h.time('2026-11-06T07:25:00+08:00')
  await h.runner.step()
  expect(h.posts).toHaveLength(1)
  expect(h.events).toContain('tokenRejected')
  expect(h.frames.size).toBe(2)
})

test('422 drops a frame and outside_daylight blocks capture until the next start', async () => {
  const h = harness()
  h.online()
  h.fail(422, 'https://skyclause.test/problems/outside_daylight')
  await h.runner.step()
  h.time('2026-11-06T07:25:00+08:00')
  await h.runner.step()
  expect(h.frames.size).toBe(0)
  expect(h.captures()).toBe(1)
  expect(h.events).toContain('droppedDaylight')
  expect((await h.store.setup())!.blockedUntil).toBe(Date.parse('2026-11-07T07:15:00+08:00'))
})

test('failed upload retains frame, uses backoff and marks retry buffered', async () => {
  const h = harness()
  h.online()
  h.fail(503)
  await h.runner.step()
  await h.runner.step()
  expect(h.posts).toHaveLength(1)
  h.time('2026-11-06T07:15:06+08:00')
  await h.runner.step()
  expect(h.posts).toHaveLength(2)
  expect(h.posts[0]!.buffered).toBe(false)
  expect(h.posts[1]!.buffered).toBe(true)
  expect(h.frames.size).toBe(1)
})

test('duplicate response without daylight fields removes the entry', async () => {
  const h = harness()
  h.online()
  h.duplicate()
  await h.runner.step()
  expect(h.frames.size).toBe(0)
  expect(h.posts[0]!.buffered).toBe(false)
})

test('new token resumes the durable queue; the rejected token stays blocked', async () => {
  const h = harness()
  h.online()
  h.fail(401)
  await h.runner.step()
  h.recover()
  await h.runner.step()
  expect(h.posts).toHaveLength(1)
  await h.store.saveSetup({ ...(await h.store.setup())!, token: 'replacement-device-token' })
  await h.runner.step()
  expect(h.posts).toHaveLength(2)
  expect(h.posts[1]!.buffered).toBe(true)
  expect(h.frames.size).toBe(0)
})

test('other 422 drops only the refused frame, explains it and proceeds in capture order', async () => {
  const h = harness()
  await h.runner.step()
  h.time('2026-11-06T07:25:00+08:00')
  await h.runner.step()
  h.online()
  h.fail(422, 'https://skyclause.test/problems/unmasked')
  await h.runner.step()
  expect(h.posts).toHaveLength(2)
  expect(h.frames.size).toBe(0)
  expect(h.events.filter((key) => key === 'dropped')).toHaveLength(2)
})

test('hidden page neither captures nor uploads queued frames', async () => {
  const h = harness()
  await h.runner.step()
  h.online()
  h.hide()
  h.time('2026-11-06T07:25:00+08:00')
  await h.runner.step()
  expect(h.captures()).toBe(1)
  expect(h.posts).toHaveLength(0)
  expect(h.frames.size).toBe(1)
})

test('a saved capture mark prevents duplicate capture in the same daylight mark', async () => {
  const h = harness()
  await h.runner.step()
  await h.runner.step()
  expect(h.captures()).toBe(1)
  expect((await h.store.setup())!.lastMark).toBe(Date.parse('2026-11-06T07:15:00+08:00'))
})

test('an in-flight reply cannot overwrite a newly saved device token', async () => {
  const h = harness()
  h.online()
  h.onPost(async () => {
    await h.store.saveSetup({ ...(await h.store.setup())!, token: 'new-device-token' })
  })
  await h.runner.step()
  expect((await h.store.setup())!.token).toBe('new-device-token')
})

test('outside_daylight uses a later authoritative start today instead of skipping a whole day', async () => {
  const h = harness()
  h.online()
  h.fail(422, 'validation-failed', { code: 'outside_daylight', camera_day_start: '08:15', camera_day_end: '19:00' })
  await h.runner.step()
  expect((await h.store.setup())!.blockedUntil).toBe(Date.parse('2026-11-06T08:15:00+08:00'))
})
