import { describe, expect, test } from 'bun:test'
import {
  CADENCE_MS,
  captureHeight,
  contrast,
  daylight,
  dayStartMs,
  deviceTime,
  dueMark,
  formatDayMyt,
  formatHmMyt,
  framePostBody,
  maskLowerThird,
  nextMarkMs,
  parseCameraConfig,
  parsePostResponse,
  processCapture,
  ratios,
  retryDelayMs,
  setupProblems,
  setupValid,
  sortFrames,
  statusCopy,
  uuidv7,
  validHours,
  validRegion,
  type CameraFrame,
  type CameraSetup,
  type PixelImage
} from './camera.ts'

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b] = paint(x, y)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  return { data, width, height }
}

const whole = (img: PixelImage) => ({ x: 0, y: 0, width: 1, height: 1 })
const upper = { x: 0, y: 0, width: 1, height: 2 / 3 }

// 2026-11-06 in MYT: 07:15 is 2026-11-05T23:15:00Z, 19:00 is 2026-11-06T11:00:00Z.
const START = '07:15'
const END = '19:00'
const mark = (hm: string): number => Date.parse(`2026-11-06T${hm}:00+08:00`)

describe('contrast', () => {
  test('a flat region scores zero', () => {
    const img = image(8, 8, () => [120, 120, 120])
    expect(contrast(img, whole(img))).toBe(0)
  })

  test('a black region scores zero', () => {
    const img = image(8, 8, () => [0, 0, 0])
    expect(contrast(img, whole(img))).toBe(0)
  })

  test('a half-black half-white region scores one', () => {
    const img = image(8, 8, (x) => (x < 4 ? [0, 0, 0] : [255, 255, 255]))
    expect(contrast(img, whole(img))).toBeCloseTo(1, 10)
  })

  test('scores only the region, not the frame', () => {
    const img = image(8, 8, (x, y) => (y < 4 ? [200, 200, 200] : x < 4 ? [0, 0, 0] : [255, 255, 255]))
    expect(contrast(img, { x: 0, y: 0, width: 1, height: 0.5 })).toBe(0)
    expect(contrast(img, { x: 0, y: 0.5, width: 1, height: 0.5 })).toBeCloseTo(1, 10)
  })
})

describe('ratios', () => {
  test('divides each region by its reference contrast', () => {
    expect(ratios(0.2, 0.3, 0.4, 0.6)).toEqual({ ratio_near: 0.5, ratio_far: 0.5, flag: 'visible' })
  })

  test('flags obscured below a far ratio of 0.5, visible at it', () => {
    expect(ratios(0.4, 0.199, 0.4, 0.4).flag).toBe('obscured')
    expect(ratios(0.4, 0.2, 0.4, 0.4).flag).toBe('visible')
  })

  test('rejects a reference with no contrast', () => {
    for (const [near, far] of [
      [0, 0.4],
      [0.4, 0]
    ] as Array<[number, number]>)
      expect(() => ratios(0.4, 0.4, near, far)).toThrow()
  })
})

describe('maskLowerThird', () => {
  test('SIG-8: every lower-third pixel is black and the upper two-thirds are untouched', () => {
    const img = image(6, 9, (x, y) => (y < 6 ? [200, 180, 160] : [10, 250, 90]))
    maskLowerThird(img)
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) {
        const i = (y * 6 + x) * 4
        expect([img.data[i], img.data[i + 1], img.data[i + 2]]).toEqual([200, 180, 160])
      }
    for (let y = 6; y < 9; y++)
      for (let x = 0; x < 6; x++) {
        const i = (y * 6 + x) * 4
        expect([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]).toEqual([0, 0, 0, 255])
      }
  })
})

describe('processCapture', () => {
  test('masks before scoring, so the encoded pixels carry no lower third', () => {
    const img = image(12, 12, (x, y) => (y < 8 ? (x < 6 ? [30, 30, 30] : [220, 220, 220]) : [255, 255, 255]))
    const out = processCapture(
      img,
      { x: 0, y: 0, width: 1, height: 2 / 3 },
      { x: 0, y: 0, width: 1, height: 2 / 3 },
      { near: 1, far: 1 }
    )
    for (let y = 8; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        const i = (y * 12 + x) * 4
        expect(img.data[i]!).toBe(0)
        expect(img.data[i + 1]!).toBe(0)
        expect(img.data[i + 2]!).toBe(0)
      }
    expect(out.near).toBeGreaterThan(0)
    expect(out.far).toBeGreaterThan(0)
  })

  test('a hazy far region flags obscured against its clear-day reference', () => {
    const clear = image(12, 12, (x) => (x < 6 ? [40, 40, 40] : [230, 230, 230]))
    const nearRef = contrast(clear, upper)
    const farRef = contrast(clear, upper)
    const hazy = image(12, 12, () => [120, 120, 120])
    const out = processCapture(hazy, upper, upper, { near: nearRef, far: farRef })
    expect(out.flag).toBe('obscured')
  })
})

describe('captureHeight', () => {
  test('a 4:3 frame stays 640 by 480', () => {
    expect(captureHeight(1280, 960)).toBe(480)
  })

  test('other ratios align to JPEG blocks without leaking the horizon', () => {
    expect(captureHeight(1280, 720) % 48).toBe(0)
    expect(captureHeight(640, 480)).toBe(480)
  })

  test('rejects an unreadable frame', () => {
    expect(() => captureHeight(0, 0)).toThrow('camera-not-ready')
  })
})

describe('uuidv7', () => {
  test('writes version 7 ids that sort in generation order', () => {
    const now = Date.now()
    const ids = [uuidv7(now), uuidv7(now), uuidv7(now + 1)]
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('daylight cadence', () => {
  test('daylight holds from the start mark and stops before the end mark', () => {
    expect(daylight(mark('07:15'), START, END)).toBe(true)
    expect(daylight(mark('07:14') + 59_000, START, END)).toBe(false)
    expect(daylight(mark('18:55'), START, END)).toBe(true)
    expect(daylight(mark('19:00'), START, END)).toBe(false)
    expect(daylight(mark('03:00'), START, END)).toBe(false)
  })

  test('dayStartMs pins 07:15 MYT to 23:15Z the day before', () => {
    expect(new Date(dayStartMs(mark('12:00'), START)).toISOString()).toBe('2026-11-05T23:15:00.000Z')
  })

  test('dueMark fires each 10-minute mark from 07:15 to before 19:00', () => {
    expect(dueMark(mark('07:15') + 30_000, START, END)).toBe(mark('07:15'))
    expect(dueMark(mark('18:55') + 30_000, START, END)).toBe(mark('18:55'))
    expect(dueMark(mark('12:35'), START, END)).toBe(mark('12:35'))
  })

  test('dueMark skips a stale mark, a repeated mark and the night', () => {
    expect(dueMark(mark('12:25') + 61_000, START, END)).toBe(null)
    expect(dueMark(mark('12:25'), START, END, mark('12:25'))).toBe(null)
    expect(dueMark(mark('07:15') - 1000, START, END)).toBe(null)
    expect(dueMark(mark('19:00'), START, END)).toBe(null)
    expect(dueMark(mark('12:25'), START, END, mark('12:15'))).toBe(mark('12:25'))
  })

  test('cadence marks sit 10 minutes apart across the day', () => {
    let last = mark('07:15')
    for (let n = 1; n <= 70; n++) {
      const next = nextMarkMs(last, START, END)
      expect(next - last).toBe(CADENCE_MS)
      last = next
    }
    expect(new Date(last).toISOString()).toBe('2026-11-06T10:55:00.000Z')
  })

  test('nextMarkMs waits for the morning start, then wraps past dusk', () => {
    expect(nextMarkMs(mark('07:15') - 60_000, START, END)).toBe(mark('07:15'))
    expect(nextMarkMs(mark('18:55') + 1000, START, END)).toBe(mark('07:15') + 86_400_000)
    expect(nextMarkMs(mark('20:00'), START, END)).toBe(mark('07:15') + 86_400_000)
  })

  test('validHours rejects reversed or malformed hours', () => {
    expect(validHours('19:00', '07:15')).toBe(false)
    expect(validHours('7:15', '19:00')).toBe(false)
    expect(validHours('07:15', '07:15')).toBe(false)
    expect(validHours('07:15', '19:00')).toBe(true)
  })
})

describe('times', () => {
  test('deviceTime stamps MYT with an explicit offset', () => {
    expect(deviceTime(Date.parse('2026-11-06T07:05:00+08:00'))).toBe('2026-11-06T07:05:00+08:00')
  })

  test('formatHmMyt and formatDayMyt read MYT across the UTC midnight boundary', () => {
    const ms = Date.parse('2026-11-05T16:30:00.750Z')
    expect(formatHmMyt(ms)).toBe('00:30')
    expect(formatDayMyt(ms)).toBe('2026-11-06')
  })
})

describe('queue', () => {
  const frame = (capture_id: string, device_time: string): CameraFrame => ({
    capture_id,
    device_time,
    jpeg: 'data:image/jpeg;base64,x',
    distance_km: 2.5,
    ratio_near: 0.9,
    ratio_far: 0.8,
    flag: 'visible',
    buffered: false,
    attempts: 0
  })

  test('uploads run oldest first with original capture times', () => {
    const b = frame('b', '2026-11-06T08:20:00+08:00')
    const a = frame('a', '2026-11-06T08:10:00+08:00')
    const ordered = sortFrames([b, a])
    expect(ordered.map((f) => f.capture_id)).toEqual(['a', 'b'])
    expect(ordered[0]!.device_time).toBe('2026-11-06T08:10:00+08:00')
  })

  test('same-second frames keep capture order through the idempotency key', () => {
    const first = frame('0193aabb-0000-7000-8000-000000000001', '2026-11-06T08:10:00+08:00')
    const second = frame('0193aabb-0000-7000-8000-000000000002', '2026-11-06T08:10:00+08:00')
    expect(sortFrames([second, first]).map((f) => f.capture_id)).toEqual([first.capture_id, second.capture_id])
  })

  test('backoff doubles from 5 seconds to a 5-minute cap', () => {
    expect([0, 1, 2, 6, 7, 20].map(retryDelayMs)).toEqual([5000, 10_000, 20_000, 300_000, 300_000, 300_000])
  })
})

describe('device post', () => {
  const frame: CameraFrame = {
    capture_id: '0193aabb-0000-7000-8000-000000000001',
    device_time: '2026-11-06T08:10:00+08:00',
    jpeg: 'data:image/jpeg;base64,/9j/4AAQ',
    distance_km: 2.5,
    ratio_near: 0.9,
    ratio_far: 0.4,
    flag: 'obscured',
    buffered: true,
    attempts: 1
  }

  test('frames post kind, token, cam-1 and the JPEG without its prefix', () => {
    expect(framePostBody(frame, 'camera-secret')).toEqual({
      kind: 'camera_frame',
      token: 'camera-secret',
      device_id: 'cam-1',
      capture_id: frame.capture_id,
      device_time: frame.device_time,
      ratio_near: 0.9,
      ratio_far: 0.4,
      flag: 'obscured',
      distance_km: 2.5,
      buffered: true,
      jpeg_b64: '/9j/4AAQ'
    })
  })

  test('ok and duplicate remove the frame, an error keeps it queued', () => {
    expect(parsePostResponse('{"ok":true,"duplicate":false}')).toEqual({ ok: true, duplicate: false })
    expect(parsePostResponse('{"ok":true,"duplicate":true}')).toEqual({ ok: true, duplicate: true })
    expect(parsePostResponse('{"ok":false,"error":"bad token"}')).toEqual({ ok: false, error: 'bad token' })
    expect(parsePostResponse('not json')).toEqual({ ok: false, error: 'unreadable response' })
    expect(parsePostResponse('"bare"')).toEqual({ ok: false, error: 'unreadable response' })
    expect(parsePostResponse('{"ok":false}')).toEqual({ ok: false, error: 'upload rejected' })
  })

  test('config parses day hours and rejects anything else', () => {
    expect(parseCameraConfig({ day_start: '07:15', day_end: '19:00' })).toEqual({
      day_start: '07:15',
      day_end: '19:00'
    })
    for (const bad of [null, 'x', {}, { day_start: '19:00', day_end: '07:15' }, { day_start: '07:15' }])
      expect(() => parseCameraConfig(bad)).toThrow('bad-config')
  })
})

describe('status copy', () => {
  const at = Date.parse('2026-11-06T08:20:00+08:00')

  test('matches the proposed copy word for word', () => {
    expect(statusCopy.permissionDenied()).toBe(
      'Camera off: permission denied. Allow camera in Chrome settings, then reload.'
    )
    expect(statusCopy.unsupported()).toBe(
      'Camera not supported here. Use Chrome on Android, or Safari on iOS 16.4 or later.'
    )
    expect(statusCopy.wakeReleased()).toBe(
      'Screen lock released: keep this page in front, then tap to hold the screen on.'
    )
    expect(statusCopy.offline(3, at)).toBe('Offline · 3 frames queued since 08:20 MYT')
    expect(statusCopy.uploadFailed(at, 500)).toBe('Upload failed 08:20 · HTTP 500 · retrying')
    expect(statusCopy.configFailed(at, 0)).toBe('Config failed 08:20 · HTTP 0')
    expect(statusCopy.afterDusk(mark('07:15') + 86_400_000)).toBe('After dusk: not posting until 07:15 MYT')
    expect(statusCopy.posted(at, 0.42, 0.91, 1.25)).toBe('Posted 08:20 MYT · far 0.42 · near 0.91 · 1.3 s round trip')
  })
})

describe('setup validation', () => {
  const setup = (): CameraSetup => ({
    execUrl: 'https://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/exec',
    token: 'camera-secret',
    distanceKm: 2.5,
    start: '07:15',
    end: '19:00',
    near: { x: 0.05, y: 0.05, width: 0.4, height: 0.3 },
    far: { x: 0.01, y: 0.01, width: 0.98, height: 0.6 },
    reference: { jpeg: 'data:image/jpeg;base64,x', near: 0.4, far: 0.5 },
    consent: true
  })

  test('accepts a complete setup', () => {
    expect(setupValid(setup())).toBe(true)
  })

  test('names each missing piece', () => {
    expect(setupProblems({ ...setup(), execUrl: 'https://example.com/x' }).execUrl).toBe(true)
    expect(setupProblems({ ...setup(), token: 'a\nb' }).token).toBe(true)
    expect(setupProblems({ ...setup(), distanceKm: 0 }).distance).toBe(true)
    expect(setupProblems({ ...setup(), start: '19:00', end: '07:15' }).hours).toBe(true)
    expect(setupProblems({ ...setup(), near: { x: 0, y: 0.6, width: 0.2, height: 0.2 } }).regions).toBe(true)
    expect(setupProblems({ ...setup(), reference: null }).reference).toBe(true)
    expect(setupProblems({ ...setup(), consent: false }).consent).toBe(true)
  })

  test('regions stay in the upper two-thirds', () => {
    expect(validRegion({ x: 0, y: 0, width: 1, height: 2 / 3 })).toBe(true)
    expect(validRegion({ x: 0, y: 0.6, width: 0.2, height: 0.2 })).toBe(false)
    expect(validRegion({ x: 0, y: 0, width: 0, height: 0.1 })).toBe(false)
  })
})
