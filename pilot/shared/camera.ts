// The phone camera page's pure logic (issue #60): contrast scoring, masking, daylight cadence, queue
// ordering, config parsing and status copy. No DOM here so `bun test` covers it; `pilot/camera/app.ts`
// wires it to video, canvas, IndexedDB and the wake lock.
import { toMytIso } from './time.ts'

export const DEVICE_ID = 'cam-1'
export const FRAME_KIND = 'camera_frame'
export const CONFIG_KIND = 'camera_config'
export const CADENCE_MS = 10 * 60 * 1000
export const DEFAULT_DAY_START = '07:15'
export const DEFAULT_DAY_END = '19:00'
export const JPEG_WIDTH = 640
// A mark counts as due for a minute after it passes; a page woken later waits for the next mark.
export const CAPTURE_GRACE_MS = 60_000
// Upload backoff after a failed attempt, capped at five minutes.
export const RETRY_BASE_MS = 5000
export const RETRY_CAP_MS = 300_000

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface Reference {
  jpeg: string
  near: number
  far: number
}

export interface CameraSetup {
  execUrl: string
  token: string
  distanceKm: number
  start: string
  end: string
  near: Region
  far: Region
  reference: Reference | null
  consent: boolean
  lastMark?: number
  lastConfigDay?: string
}

export interface CameraFrame {
  capture_id: string
  device_time: string
  jpeg: string
  distance_km: number
  ratio_near: number
  ratio_far: number
  flag: 'visible' | 'obscured'
  buffered: boolean
  attempts: number
}

// Raw pixels, structurally satisfied by ImageData.
export interface PixelImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

export const validHours = (start: string, end: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export const dayStartMs = (nowMs: number, hhmm: string): number =>
  Math.floor((nowMs + MYT_OFFSET_MS) / 86_400_000) * 86_400_000 - MYT_OFFSET_MS + minutesOf(hhmm) * 60_000

export const daylight = (nowMs: number, start: string, end: string): boolean =>
  validHours(start, end) && nowMs >= dayStartMs(nowMs, start) && nowMs < dayStartMs(nowMs, end)

// The latest 10-minute mark at or before now that is still inside the daylight window.
function latestMark(nowMs: number, start: string, end: string): number | null {
  const first = dayStartMs(nowMs, start)
  if (nowMs < first) return null
  const mark = first + Math.floor((nowMs - first) / CADENCE_MS) * CADENCE_MS
  return mark < dayStartMs(nowMs, end) ? mark : null
}

// The mark to capture now, if any: due within the grace window and newer than the last capture.
export function dueMark(nowMs: number, start: string, end: string, lastMark?: number): number | null {
  const mark = latestMark(nowMs, start, end)
  if (mark === null || (lastMark !== undefined && mark <= lastMark)) return null
  return nowMs - mark <= CAPTURE_GRACE_MS ? mark : null
}

// The next mark at or after now, wrapping to tomorrow's first mark after dusk.
export function nextMarkMs(nowMs: number, start: string, end: string): number {
  const first = dayStartMs(nowMs, start)
  const last = dayStartMs(nowMs, end)
  if (nowMs < first) return first
  const next = first + (Math.floor((nowMs - first) / CADENCE_MS) + 1) * CADENCE_MS
  return next < last ? next : first + 86_400_000
}

export const deviceTime = (nowMs: number): string => toMytIso(new Date(nowMs))

// `HH:MM` in MYT for status copy. MYT has no daylight saving, so a fixed offset is exact.
export function formatHmMyt(ms: number): string {
  const shifted = new Date(ms + MYT_OFFSET_MS)
  const hh = String(shifted.getUTCHours()).padStart(2, '0')
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// `yyyy-MM-dd` in MYT, for grouping status by day.
export function formatDayMyt(ms: number): string {
  const shifted = new Date(ms + MYT_OFFSET_MS)
  const yyyy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

let lastIdTime = 0
let sequence = 0

// UUIDv7: the idempotency key. Monotonic within a millisecond so same-second frames sort by capture.
export function uuidv7(nowMs: number): string {
  const timestamp = Math.max(nowMs, lastIdTime)
  sequence = timestamp === lastIdTime ? sequence + 1 : 0
  lastIdTime = timestamp
  if (sequence > 4095) {
    lastIdTime++
    sequence = 0
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let time = lastIdTime
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256
    time = Math.floor(time / 256)
  }
  bytes[6] = 0x70 | (sequence >> 8)
  bytes[7] = sequence & 255
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Regions live in the upper two-thirds as fractions of the full frame.
export const validRegion = (r: Region): boolean =>
  Object.values(r).every(Number.isFinite) &&
  r.x >= 0 &&
  r.y >= 0 &&
  r.width > 0 &&
  r.height > 0 &&
  r.x + r.width <= 1 &&
  r.y + r.height <= 2 / 3

// Contrast is the standard deviation of luma divided by mean luma over the region (ticket decision).
export function contrast(image: PixelImage, region: Region): number {
  const left = Math.floor(region.x * image.width)
  const top = Math.floor(region.y * image.height)
  const right = Math.ceil((region.x + region.width) * image.width)
  const bottom = Math.ceil((region.y + region.height) * image.height)
  let sum = 0
  let squared = 0
  let count = 0
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const i = (y * image.width + x) * 4
      const luma = 0.2126 * image.data[i]! + 0.7152 * image.data[i + 1]! + 0.0722 * image.data[i + 2]!
      sum += luma
      squared += luma * luma
      count++
    }
  const mean = sum / count
  return mean > 0 ? Math.sqrt(Math.max(0, squared / count - mean * mean)) / mean : 0
}

export type Flag = 'visible' | 'obscured'

// Each region's contrast now divided by its contrast in the clear-day reference. The flag is
// `obscured` when the far ratio drops below 0.5, `visible` otherwise (ticket decision).
export function ratios(
  near: number,
  far: number,
  referenceNear: number,
  referenceFar: number
): { ratio_near: number; ratio_far: number; flag: Flag } {
  if (!(referenceNear > 0 && referenceFar > 0)) throw new Error('reference-contrast')
  const ratio_near = near / referenceNear
  const ratio_far = far / referenceFar
  return { ratio_near, ratio_far, flag: ratio_far < 0.5 ? 'obscured' : 'visible' }
}

// Paint the lower third black in place, before scoring and before JPEG encoding. Nothing unmasked
// is kept or sent (SIG-8).
export function maskLowerThird(image: PixelImage): void {
  const top = Math.ceil((image.height * 2) / 3)
  for (let y = top; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4
      image.data[i] = 0
      image.data[i + 1] = 0
      image.data[i + 2] = 0
      image.data[i + 3] = 255
    }
}

// Contrast of both regions on already-masked pixels. Capture masks first; scoring never sees the raw frame.
export function scoreMasked(image: PixelImage, near: Region, far: Region): { near: number; far: number } {
  return { near: contrast(image, near), far: contrast(image, far) }
}

// The single choke point for capture and reference: mask first, then score and ratio. The page
// encodes its JPEG from the same masked pixels afterwards.
export function processCapture(
  image: PixelImage,
  near: Region,
  far: Region,
  reference: { near: number; far: number }
): { near: number; far: number; ratio_near: number; ratio_far: number; flag: Flag } {
  maskLowerThird(image)
  const scored = scoreMasked(image, near, far)
  return { ...scored, ...ratios(scored.near, scored.far, reference.near, reference.far) }
}

// Capture height for a 640 px wide JPEG, aligned to JPEG MCU blocks so compression cannot leak
// the horizon into the masked third's first row.
export function captureHeight(srcWidth: number, srcHeight: number): number {
  if (!(srcWidth > 0 && srcHeight > 0)) throw new Error('camera-not-ready')
  return Math.max(48, Math.round(((srcHeight / srcWidth) * JPEG_WIDTH) / 48) * 48)
}

// Oldest first; same-second frames keep capture order through the monotonic idempotency key.
export function sortFrames(frames: readonly CameraFrame[]): CameraFrame[] {
  return [...frames].sort(
    (a, b) => a.device_time.localeCompare(b.device_time) || a.capture_id.localeCompare(b.capture_id)
  )
}

export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.min(attempts, 6))
}

export interface DayConfig {
  day_start: string
  day_end: string
}

export function parseCameraConfig(value: unknown): DayConfig {
  if (typeof value !== 'object' || value === null) throw new Error('bad-config')
  const { day_start, day_end } = value as Record<string, unknown>
  if (typeof day_start !== 'string' || typeof day_end !== 'string' || !validHours(day_start, day_end))
    throw new Error('bad-config')
  return { day_start, day_end }
}

export interface FramePost {
  kind: string
  token: string
  device_id: string
  capture_id: string
  device_time: string
  ratio_near: number
  ratio_far: number
  flag: Flag
  distance_km: number
  buffered: boolean
  jpeg_b64: string
}

// The `camera_frame` device post (#47 "Device posts"). jpeg_b64 carries no data-URL prefix.
export function framePostBody(frame: CameraFrame, token: string): FramePost {
  const { attempts: _attempts, jpeg, ...value } = frame
  return {
    kind: FRAME_KIND,
    token,
    device_id: DEVICE_ID,
    ...value,
    jpeg_b64: jpeg.replace(/^data:image\/jpeg;base64,/, '')
  }
}

export type PostReply = { ok: true; duplicate: boolean } | { ok: false; error: string }

// Reads `{ok, duplicate}` from the `/exec` response after the redirect. An unreadable body keeps
// the frame queued; the owner then checks the deployment on #59.
export function parsePostResponse(text: string): PostReply {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, error: 'unreadable response' }
  }
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'unreadable response' }
  const { ok, duplicate, error } = body as Record<string, unknown>
  if (ok === true) return { ok: true, duplicate: duplicate === true }
  return { ok: false, error: typeof error === 'string' && error ? error : 'upload rejected' }
}

// Status copy, each announced once through `aria-live="polite"`. Times are MYT.
export const statusCopy = {
  permissionDenied: (): string => 'Camera off: permission denied. Allow camera in Chrome settings, then reload.',
  unsupported: (): string => 'Camera not supported here. Use Chrome on Android, or Safari on iOS 16.4 or later.',
  wakeReleased: (): string => 'Screen lock released: keep this page in front, then tap to hold the screen on.',
  offline: (n: number, atMs: number): string => `Offline · ${n} frames queued since ${formatHmMyt(atMs)} MYT`,
  uploadFailed: (atMs: number, status: number): string =>
    `Upload failed ${formatHmMyt(atMs)} · HTTP ${status} · retrying`,
  configFailed: (atMs: number, status: number): string => `Config failed ${formatHmMyt(atMs)} · HTTP ${status}`,
  afterDusk: (untilMs: number): string => `After dusk: not posting until ${formatHmMyt(untilMs)} MYT`,
  posted: (atMs: number, ratio_far: number, ratio_near: number, s: number): string =>
    `Posted ${formatHmMyt(atMs)} MYT · far ${formatDecimal(ratio_far)} · near ${formatDecimal(ratio_near)} · ${formatDecimal(s, 1)} s round trip`,
  setupNeeded: (): string => 'Finish the setup below, then keep this page in front for the next daylight mark.',
  tokenRejected: (): string => 'Token rejected: paste a new device token, then save.',
  saved: (): string => 'Setup saved. Keep this page in front for the next daylight mark.',
  wakeHeld: (): string => 'Screen wake lock held.'
}

function formatDecimal(value: number, places = 2): string {
  const factor = 10 ** places
  return String(Math.round(value * factor) / factor)
}

export interface SetupProblems {
  execUrl: boolean
  token: boolean
  distance: boolean
  hours: boolean
  regions: boolean
  reference: boolean
  consent: boolean
}

// One invalid line covers every setup problem; the form marks the fields.
export function setupProblems(setup: CameraSetup): SetupProblems {
  return {
    execUrl: !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(setup.execUrl.trim()),
    token: !setup.token.trim() || /[\r\n]/.test(setup.token),
    distance: !Number.isFinite(setup.distanceKm) || setup.distanceKm <= 0,
    hours: !validHours(setup.start, setup.end),
    regions: !validRegion(setup.near) || !validRegion(setup.far),
    reference: !setup.reference || !(setup.reference.near > 0 && setup.reference.far > 0),
    consent: !setup.consent
  }
}

export const setupValid = (setup: CameraSetup): boolean =>
  Object.values(setupProblems(setup)).every((problem) => !problem)
