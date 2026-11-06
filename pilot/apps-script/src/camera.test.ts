// Tests for the `camera_frame` handler and the retention job (#59): daylight writes,
// duplicates, rejects and the 183-day and semester-end caps. Sheets and Drive are fakes;
// SIG-1 coverage is asserted on the rows the handler builds.
import { describe, expect, test } from 'bun:test'
import {
  CAMERA_CONFIG_KIND,
  CAMERA_FRAME_KIND,
  cameraConfig,
  cameraSourceRow,
  handleCameraFrame,
  runCameraRetention,
  type CameraDrive,
  type CameraFrameBody,
  type CameraFrameDeps,
  type CameraFrameStore,
  type RetentionStore
} from './camera.ts'
import { handleGet, handlePost, type GetRoute, type PostRoute } from './router.ts'
import { validateReading } from './readings.ts'
import type { ScriptProperty } from './properties.ts'
import type { PostBody } from '../../shared/device-post.ts'
import type { Row } from './schema.ts'

const RECEIVED = new Date('2026-11-06T10:40:00+08:00')
const DAY_START = '07:15'
const DAY_END = '19:00'

function post(overrides: Partial<Record<string, unknown>> = {}): CameraFrameBody {
  return {
    kind: CAMERA_FRAME_KIND,
    device_id: 'cam-1',
    capture_id: 'cap-1',
    device_time: '2026-11-06T10:00:00+08:00',
    ratio_near: 0.42,
    ratio_far: 0.71,
    flag: 'visible',
    distance_km: 5.9,
    buffered: false,
    jpeg_b64: 'aGVsbG8=',
    ...overrides
  }
}

function fakeStore(): CameraFrameStore & {
  sources: Row<'sources'>[]
  devices: Row<'devices'>[]
  polls: Row<'polls'>[]
  readings: Row<'readings'>[]
  probation: Row<'probation'>[]
} {
  const sources: Row<'sources'>[] = []
  const devices: Row<'devices'>[] = []
  const polls: Row<'polls'>[] = []
  const readings: Row<'readings'>[] = []
  const probation: Row<'probation'>[] = []
  return {
    sources,
    devices,
    polls,
    readings,
    probation,
    sourceRow: (sourceId) => sources.find((row) => row.source_id === sourceId) ?? null,
    appendSource: (row) => void sources.push(row),
    updateSourceDistance: (sourceId, distanceKm) => {
      const row = sources.find((candidate) => candidate.source_id === sourceId)
      if (row) row.distance_km = distanceKm
    },
    deviceRow: (deviceId) => devices.find((row) => row.device_id === deviceId) ?? null,
    appendDevice: (row) => void devices.push(row),
    touchDevice: (deviceId, receivedAt) => {
      const row = devices.find((candidate) => candidate.device_id === deviceId)
      if (row) row.last_row_at = receivedAt
    },
    knownCapture: (captureId) => probation.some((row) => row.capture_id === captureId),
    appendPoll: (row) => void polls.push(row),
    appendReadings: (rows) => void readings.push(...rows),
    appendProbation: (row) => void probation.push(row)
  }
}

function fakeDrive(): CameraDrive & { saved: { day: string; captureId: string }[]; files: Map<string, string> } {
  const saved: { day: string; captureId: string }[] = []
  const files = new Map<string, string>()
  return {
    saved,
    files,
    saveFrame: (_root, day, captureId) => {
      saved.push({ day, captureId })
      const fileId = `file-${captureId}`
      files.set(fileId, day)
      return fileId
    },
    dayFolders: () => [],
    folderFiles: () => [],
    trashFile: () => {},
    trashFolder: () => {}
  }
}

function deps(overrides: Partial<CameraFrameDeps> = {}): CameraFrameDeps {
  let next = 0
  return {
    now: () => RECEIVED,
    newPollId: () => `poll-${(next += 1)}`,
    dayStart: DAY_START,
    dayEnd: DAY_END,
    framesRootId: 'frames-root',
    ...overrides
  }
}

describe('handleCameraFrame', () => {
  test('a daylight post stores one polls row, three readings, one probation row and the JPEG', () => {
    const store = fakeStore()
    const drive = fakeDrive()
    expect(handleCameraFrame(post(), store, drive, deps())).toEqual({ ok: true, duplicate: false })

    expect(store.sources).toEqual([{ ...cameraSourceRow(), distance_km: 5.9 }])
    expect(store.sources[0]).toMatchObject({
      source_id: 'cam-1',
      kind: 'camera',
      cadence_min: 10,
      stale_after_min: 20,
      freshness: 'observed',
      probation: true
    })
    expect(store.devices).toEqual([{ device_id: 'cam-1', kind: 'camera', last_row_at: '2026-11-06T10:40:00+08:00' }])

    expect(store.polls).toHaveLength(1)
    expect(store.polls[0]).toMatchObject({
      source_kind: 'camera',
      source_id: 'cam-1',
      http_status: 200,
      latency_ms: 40 * 60 * 1000,
      outcome: 'ok',
      new_rows: 3,
      error: ''
    })

    expect(store.readings).toHaveLength(3)
    expect(store.readings.map((row) => [row.metric, row.value, row.unit])).toEqual([
      ['contrast_near', 0.42, 'ratio'],
      ['contrast_far', 0.71, 'ratio'],
      ['flag', 'visible', '']
    ])
    for (const row of store.readings) {
      expect(row).toMatchObject({
        source_kind: 'camera',
        source_id: 'cam-1',
        observed_at: '2026-11-06T10:00:00+08:00',
        received_at: '2026-11-06T10:40:00+08:00',
        http_status: 200,
        latency_ms: 40 * 60 * 1000,
        revision: 1
      })
      expect(JSON.parse(String(row.note))).toEqual({ capture_id: 'cap-1' })
    }

    expect(store.probation).toEqual([
      {
        capture_id: 'cap-1',
        frame_file_id: 'file-cap-1',
        device_time: '2026-11-06T10:00:00+08:00',
        phone_flag: 'visible'
      }
    ])
    expect(drive.saved).toEqual([{ day: '2026-11-06', captureId: 'cap-1' }])
  })

  test('every appended reading passes the shared validator (SIG-1)', () => {
    const store = fakeStore()
    handleCameraFrame(post(), store, fakeDrive(), deps())
    handleCameraFrame(post({ capture_id: 'cap-2', flag: 'obscured' }), store, fakeDrive(), deps())
    for (const row of store.readings) expect(validateReading(row)).toEqual([])
  })

  test('a buffered frame keeps its capture time in observed_at and the day folder', () => {
    const store = fakeStore()
    const drive = fakeDrive()
    const received = new Date('2026-11-06T10:40:00+08:00')
    expect(
      handleCameraFrame(
        post({ capture_id: 'cap-buffered', device_time: '2026-11-06T10:00:00+08:00', buffered: true }),
        store,
        drive,
        deps({ now: () => received })
      )
    ).toEqual({ ok: true, duplicate: false })
    expect(store.readings.map((row) => row.observed_at)).toEqual([
      '2026-11-06T10:00:00+08:00',
      '2026-11-06T10:00:00+08:00',
      '2026-11-06T10:00:00+08:00'
    ])
    expect(store.readings.map((row) => JSON.parse(String(row.note)))).toEqual([
      { capture_id: 'cap-buffered', buffered: true },
      { capture_id: 'cap-buffered', buffered: true },
      { capture_id: 'cap-buffered', buffered: true }
    ])
    expect(drive.saved).toEqual([{ day: '2026-11-06', captureId: 'cap-buffered' }])
  })

  test('a re-sent frame answers duplicate: true and writes nothing', () => {
    const store = fakeStore()
    const drive = fakeDrive()
    const first = post()
    expect(handleCameraFrame(first, store, drive, deps())).toEqual({ ok: true, duplicate: false })
    const counts = {
      sources: store.sources.length,
      devices: store.devices.length,
      polls: store.polls.length,
      readings: store.readings.length,
      probation: store.probation.length,
      saved: drive.saved.length
    }
    expect(handleCameraFrame(first, store, drive, deps())).toEqual({ ok: true, duplicate: true })
    expect({
      sources: store.sources.length,
      devices: store.devices.length,
      polls: store.polls.length,
      readings: store.readings.length,
      probation: store.probation.length,
      saved: drive.saved.length
    }).toEqual(counts)
  })

  test('leaves existing sources and devices rows alone, but refreshes last_row_at and distance_km', () => {
    const store = fakeStore()
    store.sources.push({ ...cameraSourceRow(), distance_km: 5.0 })
    store.devices.push({ device_id: 'cam-1', kind: 'camera', last_row_at: '2026-11-05T10:00:00+08:00' })
    handleCameraFrame(post({ distance_km: 5.9 }), store, fakeDrive(), deps())
    expect(store.sources).toHaveLength(1)
    expect(store.sources[0]?.distance_km).toBe(5.9)
    expect(store.devices).toHaveLength(1)
    expect(store.devices[0]?.last_row_at).toBe('2026-11-06T10:40:00+08:00')
  })

  test('keeps distance_km when the posted value matches', () => {
    const store = fakeStore()
    const row = { ...cameraSourceRow(), distance_km: 5.9 }
    store.sources.push(row)
    handleCameraFrame(post({ distance_km: 5.9 }), store, fakeDrive(), deps())
    expect(store.sources).toEqual([row])
  })

  test('a night device_time is rejected as outside daylight, with one error polls row', () => {
    const store = fakeStore()
    const drive = fakeDrive()
    expect(handleCameraFrame(post({ device_time: '2026-11-06T05:00:00+08:00' }), store, drive, deps())).toEqual({
      ok: false,
      error: 'outside daylight'
    })
    expect(store.polls).toHaveLength(1)
    expect(store.polls[0]).toMatchObject({ source_kind: 'camera', source_id: 'cam-1', outcome: 'error', new_rows: 0 })
    expect(store.sources).toEqual([])
    expect(store.readings).toEqual([])
    expect(store.probation).toEqual([])
    expect(drive.saved).toEqual([])
  })

  const bad: [string, Record<string, unknown>][] = [
    ['a missing capture_id', { capture_id: undefined }],
    ['a device_time without an offset', { device_time: '2026-11-06T10:00:00' }],
    ['a non-ISO device_time', { device_time: 'tomorrow at ten' }],
    ['a non-number ratio_near', { ratio_near: 'high' }],
    ['a non-number ratio_far', { ratio_far: null }],
    ['an unknown flag', { flag: 'hazy' }],
    ['a non-number distance_km', { distance_km: 'far' }],
    ['a non-boolean buffered', { buffered: 'yes' }],
    ['a missing jpeg_b64', { jpeg_b64: '' }],
    ['another camera ID', { device_id: 'cam-2' }]
  ]
  for (const [name, override] of bad) {
    test(`rejects ${name}, writing only one error polls row`, () => {
      const store = fakeStore()
      const drive = fakeDrive()
      expect(handleCameraFrame(post(override), store, drive, deps())).toEqual({
        ok: false,
        error: expect.any(String)
      })
      expect(store.polls).toHaveLength(1)
      expect(store.polls[0]).toMatchObject({ outcome: 'error', new_rows: 0 })
      expect(store.sources).toEqual([])
      expect(store.readings).toEqual([])
      expect(store.probation).toEqual([])
      expect(drive.saved).toEqual([])
    })
  }

  test('a missing daylight window is a handler error with one polls row', () => {
    const store = fakeStore()
    expect(handleCameraFrame(post(), store, fakeDrive(), deps({ dayStart: null }))).toEqual({
      ok: false,
      error: 'the camera daylight window is not configured'
    })
    expect(store.polls).toHaveLength(1)
    expect(store.readings).toEqual([])
  })
})

describe('the camera routes through the routers', () => {
  function harness(properties: Partial<Record<ScriptProperty, string>> = { CAMERA_TOKEN: 'camera-secret' }) {
    const store = fakeStore()
    const drive = fakeDrive()
    const getProperty = (name: ScriptProperty) => properties[name] ?? null
    const routes: PostRoute[] = [
      {
        kind: CAMERA_FRAME_KIND,
        tokenProperty: 'CAMERA_TOKEN',
        handle: (body) => handleCameraFrame(body, store, drive, deps())
      }
    ]
    const postDeps = {
      getProperty,
      withLock: <T>(fn: () => T): T => fn()
    }
    const getRoutes: GetRoute[] = [
      {
        param: 'kind',
        value: CAMERA_CONFIG_KIND,
        handle: () => ({ json: cameraConfig(getProperty('CAMERA_DAY_START'), getProperty('CAMERA_DAY_END')) })
      }
    ]
    return { store, drive, routes, postDeps, getRoutes, getProperty }
  }

  const body = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ kind: CAMERA_FRAME_KIND, token: 'camera-secret', ...post(), ...overrides })

  test('a bad token writes nothing', () => {
    const { store, drive, routes, postDeps } = harness()
    expect(handlePost(body({ token: 'guess' }), routes, postDeps)).toEqual({ ok: false, error: 'bad token' })
    expect(store.polls).toEqual([])
    expect(drive.saved).toEqual([])
  })

  test('a malformed body writes nothing', () => {
    const { store, routes, postDeps } = harness()
    expect(handlePost('{kind: camera_frame', routes, postDeps)).toEqual({ ok: false, error: 'malformed body' })
    expect(store.polls).toEqual([])
  })

  test('a repeated capture_id answers duplicate: true and writes nothing more', () => {
    const { store, routes, postDeps } = harness()
    expect(handlePost(body(), routes, postDeps)).toEqual({ ok: true, duplicate: false })
    const polls = store.polls.length
    expect(handlePost(body(), routes, postDeps)).toEqual({ ok: true, duplicate: true })
    expect(store.polls.length).toBe(polls)
  })

  test('a night device_time answers outside daylight with one error polls row', () => {
    const { store, routes, postDeps } = harness()
    expect(handlePost(body({ device_time: '2026-11-06T05:00:00+08:00' }), routes, postDeps)).toEqual({
      ok: false,
      error: 'outside daylight'
    })
    expect(store.polls).toHaveLength(1)
    expect(store.readings).toEqual([])
  })

  test('camera_config serves the daylight window from properties', () => {
    const { getRoutes, getProperty } = harness({ CAMERA_DAY_START: '07:15', CAMERA_DAY_END: '19:00' })
    expect(handleGet({ kind: 'camera_config' }, getRoutes, () => ({}), { getProperty })).toEqual({
      json: { day_start: '07:15', day_end: '19:00' }
    })
  })
})

describe('runCameraRetention', () => {
  function retentionHarness(frames: { frame_file_id: string; device_time: string }[], semesterEndsOn: string | null) {
    const trashedFiles: string[] = []
    const trashedFolders: string[] = []
    const logs: string[] = []
    const errors: string[] = []
    const folders = new Map<string, string[]>()
    const store: RetentionStore = {
      probationFrames: () => frames,
      dayFolders: () => [...folders].map(([id, files]) => ({ id, name: id })),
      folderFiles: (folderId) => (folders.get(folderId) ?? []).map((id) => ({ id })),
      trashFile: (fileId) => {
        trashedFiles.push(fileId)
        for (const files of folders.values()) {
          const at = files.indexOf(fileId)
          if (at >= 0) files.splice(at, 1)
        }
      },
      trashFolder: (folderId) => {
        trashedFolders.push(folderId)
        folders.delete(folderId)
      }
    }
    return {
      store,
      folders,
      trashedFiles,
      trashedFolders,
      logs,
      errors,
      run: (now: string) =>
        runCameraRetention(store, {
          now: () => new Date(now),
          semesterEndsOn,
          log: (line) => void logs.push(line),
          error: (line) => void errors.push(line)
        })
    }
  }

  test('a 184-day-old frame is deleted and a 10-day-old one kept', () => {
    const now = '2026-11-06T03:00:00+08:00'
    const old = new Date(new Date(now).getTime() - 184 * 24 * 60 * 60 * 1000)
    const recent = new Date(new Date(now).getTime() - 10 * 24 * 60 * 60 * 1000)
    const day = (date: Date) => new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const harness = retentionHarness(
      [
        { frame_file_id: 'file-old', device_time: `${day(old)}T10:00:00+08:00` },
        { frame_file_id: 'file-new', device_time: `${day(recent)}T10:00:00+08:00` }
      ],
      '2027-06-30'
    )
    harness.folders.set('2026-05-06', ['file-old'])
    harness.folders.set('2026-10-27', ['file-new'])
    expect(harness.run(now)).toEqual({ deleted: 1 })
    expect(harness.trashedFiles).toEqual(['file-old'])
    expect(harness.trashedFolders).toEqual(['2026-05-06'])
    expect(harness.logs).toHaveLength(1)
    expect(harness.logs[0]).toMatch(/^Retention 2026-11-06: deleted 1 frames \(semester ends 2027-06-30, cap /)
    expect(harness.errors).toEqual([])
  })

  test('after the semester ends every frame is deleted and the count logged', () => {
    const harness = retentionHarness(
      [
        { frame_file_id: 'file-a', device_time: '2026-11-05T10:00:00+08:00' },
        { frame_file_id: 'file-b', device_time: '2026-07-01T10:00:00+08:00' }
      ],
      '2026-11-05'
    )
    harness.folders.set('2026-11-05', ['file-a'])
    harness.folders.set('2026-07-01', ['file-b'])
    expect(harness.run('2026-11-06T03:00:00+08:00')).toEqual({ deleted: 2 })
    expect(harness.trashedFiles).toEqual(['file-a', 'file-b'])
    expect(harness.logs).toEqual(['Retention 2026-11-06: deleted 2 frames (semester ends 2026-11-05, cap 2026-05-07)'])
  })

  test('an empty run still logs zero', () => {
    const harness = retentionHarness([], '2027-06-30')
    expect(harness.run('2026-11-06T03:00:00+08:00')).toEqual({ deleted: 0 })
    expect(harness.logs).toEqual(['Retention 2026-11-06: deleted 0 frames (semester ends 2027-06-30, cap 2026-05-07)'])
  })

  test('a missing semester end logs an error and still applies the 183-day cap', () => {
    const harness = retentionHarness(
      [
        { frame_file_id: 'file-old', device_time: '2026-05-01T10:00:00+08:00' },
        { frame_file_id: 'file-new', device_time: '2026-11-05T10:00:00+08:00' }
      ],
      null
    )
    expect(harness.run('2026-11-06T03:00:00+08:00')).toEqual({ deleted: 1 })
    expect(harness.trashedFiles).toEqual(['file-old'])
    expect(harness.errors).toHaveLength(1)
    expect(harness.errors[0]).toMatch(/SEMESTER_ENDS_ON is missing or invalid/)
    expect(harness.logs).toEqual(['Retention 2026-11-06: deleted 1 frames (semester ends unset, cap 2026-05-07)'])
  })

  test('an invalid semester end logs an error and still applies the 183-day cap', () => {
    const harness = retentionHarness(
      [{ frame_file_id: 'file-new', device_time: '2026-11-05T10:00:00+08:00' }],
      'not a date'
    )
    expect(harness.run('2026-11-06T03:00:00+08:00')).toEqual({ deleted: 0 })
    expect(harness.errors).toHaveLength(1)
    expect(harness.logs).toHaveLength(1)
  })
})
