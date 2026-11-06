// The `camera_frame` device post (#59): the phone camera page posts one JPEG with two
// contrast ratios every 10 minutes of daylight, and this stores three `readings` rows,
// a `probation` row for labelling and the JPEG in Drive. Pure except for the sheet and
// Drive ports, so tests use fakes.
import { toMytIso } from '../../shared/time.ts'
import type { PostBody, PostResult } from '../../shared/device-post.ts'
import { validateReading } from './readings.ts'
import type { Cell, Row } from './schema.ts'

export const CAMERA_FRAME_KIND = 'camera_frame'
export const CAMERA_CONFIG_KIND = 'camera_config'
export const CAMERA_SOURCE_ID = 'cam-1'
export const RETENTION_DAYS = 183

// What the camera page posts. `buffered` is true for a re-sent buffered frame; the phone
// keeps its capture time as source time.
export interface CameraFrameBody extends PostBody {
  device_id: string
  capture_id: string
  device_time: string
  ratio_near: unknown
  ratio_far: unknown
  flag: unknown
  distance_km: unknown
  buffered: unknown
  jpeg_b64: unknown
}

// The sheet reads and writes the handler needs, built from `SHEET_ID` in gas.ts.
export interface CameraFrameStore {
  sourceRow(sourceId: string): Row<'sources'> | null
  appendSource(row: Row<'sources'>): void
  updateSourceDistance(sourceId: string, distanceKm: number): void
  deviceRow(deviceId: string): Row<'devices'> | null
  appendDevice(row: Row<'devices'>): void
  touchDevice(deviceId: string, receivedAt: string): void
  knownCapture(captureId: string): boolean
  appendPoll(row: Row<'polls'>): void
  appendReadings(rows: Row<'readings'>[]): void
  appendProbation(row: Row<'probation'>): void
}

export interface CameraDrive {
  saveFrame(framesRootId: string, day: string, captureId: string, jpegB64: string): string
  dayFolders(framesRootId: string): { id: string; name: string }[]
  folderFiles(folderId: string): { id: string }[]
  trashFile(fileId: string): void
  trashFolder(folderId: string): void
}

export interface CameraFrameDeps {
  now: () => Date
  newPollId: () => string
  dayStart: string | null
  dayEnd: string | null
  framesRootId: string
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const HHMM = /^(\d{2}):(\d{2})$/

function minutesOf(value: string | null): number | null {
  if (value === null) return null
  const match = HHMM.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

// The MYT calendar day and minute of day for an ISO instant.
function mytDayAndMinute(iso: string): { day: string; minute: number } {
  const myt = toMytIso(new Date(iso))
  return { day: myt.slice(0, 10), minute: Number(myt.slice(11, 13)) * 60 + Number(myt.slice(14, 16)) }
}

// The `sources` default row the ticket writes on the first post.
export function cameraSourceRow(): Row<'sources'> {
  return {
    source_id: CAMERA_SOURCE_ID,
    kind: 'camera',
    cadence_min: 10,
    stale_after_min: 20,
    freshness: 'observed',
    probation: true
  }
}

function problemsIn(post: CameraFrameBody, deps: CameraFrameDeps): string | null {
  if (typeof post.capture_id !== 'string' || !post.capture_id) return 'capture_id is missing'
  if (
    typeof post.device_time !== 'string' ||
    !ISO_WITH_OFFSET.test(post.device_time) ||
    Number.isNaN(Date.parse(post.device_time))
  )
    return 'device_time must be ISO 8601 with an explicit offset'
  if (typeof post.ratio_near !== 'number' || !Number.isFinite(post.ratio_near)) return 'ratio_near must be a number'
  if (typeof post.ratio_far !== 'number' || !Number.isFinite(post.ratio_far)) return 'ratio_far must be a number'
  if (post.flag !== 'visible' && post.flag !== 'obscured') return 'flag must be visible or obscured'
  if (typeof post.distance_km !== 'number' || !Number.isFinite(post.distance_km)) return 'distance_km must be a number'
  if (typeof post.buffered !== 'boolean') return 'buffered must be a boolean'
  if (typeof post.jpeg_b64 !== 'string' || !post.jpeg_b64) return 'jpeg_b64 is missing'
  if (post.device_id !== CAMERA_SOURCE_ID) return `device_id must be ${CAMERA_SOURCE_ID}`
  const start = minutesOf(deps.dayStart)
  const end = minutesOf(deps.dayEnd)
  if (start === null || end === null) return 'the camera daylight window is not configured'
  const { minute } = mytDayAndMinute(post.device_time)
  if (minute < start || minute > end) return 'outside daylight'
  return null
}

// Every reading the handler appends, with the poll envelope stamped on.
function readingRows(post: CameraFrameBody, receivedAt: string, latencyMs: number, pollId: string): Row<'readings'>[] {
  const note = post.buffered
    ? JSON.stringify({ capture_id: post.capture_id, buffered: true })
    : JSON.stringify({ capture_id: post.capture_id })
  const base = {
    source_kind: 'camera',
    source_id: CAMERA_SOURCE_ID,
    observed_at: post.device_time,
    received_at: receivedAt,
    http_status: 200,
    latency_ms: latencyMs,
    poll_id: pollId,
    revision: 1,
    note
  } as const
  return [
    {
      ...base,
      reading_id: `${CAMERA_SOURCE_ID}:contrast_near:${post.device_time}`,
      metric: 'contrast_near',
      value: post.ratio_near as number,
      unit: 'ratio'
    },
    {
      ...base,
      reading_id: `${CAMERA_SOURCE_ID}:contrast_far:${post.device_time}`,
      metric: 'contrast_far',
      value: post.ratio_far as number,
      unit: 'ratio'
    },
    {
      ...base,
      reading_id: `${CAMERA_SOURCE_ID}:flag:${post.device_time}`,
      metric: 'flag',
      value: post.flag as string,
      unit: ''
    }
  ]
}

// The `camera_frame` handler: one `polls` row per post, three `readings` rows, one
// `probation` row and the JPEG in Drive. A repeated `capture_id` reports
// `duplicate: true` and writes nothing; a post that fails the checks writes one
// `polls` row with outcome `error`. SIG-1: every appended reading passes validateReading.
export function handleCameraFrame(
  body: PostBody,
  store: CameraFrameStore,
  drive: CameraDrive,
  deps: CameraFrameDeps
): PostResult {
  const receivedAtDate = deps.now()
  const receivedAt = toMytIso(receivedAtDate)
  const post = body as CameraFrameBody
  const sourceId = typeof post.device_id === 'string' && post.device_id ? post.device_id : CAMERA_SOURCE_ID
  const fail = (error: string): PostResult => {
    const deviceTime =
      typeof post.device_time === 'string' && !Number.isNaN(Date.parse(post.device_time))
        ? Date.parse(post.device_time)
        : null
    store.appendPoll({
      poll_id: deps.newPollId(),
      source_kind: 'camera',
      source_id: sourceId,
      started_at: receivedAt,
      received_at: receivedAt,
      http_status: 200,
      latency_ms: deviceTime === null ? 0 : receivedAtDate.getTime() - deviceTime,
      outcome: 'error',
      new_rows: 0,
      error,
      raw_file_id: ''
    })
    return { ok: false, error }
  }

  const problem = problemsIn(post, deps)
  if (problem) return fail(problem)
  if (store.knownCapture(post.capture_id)) return { ok: true, duplicate: true }

  const latencyMs = receivedAtDate.getTime() - Date.parse(post.device_time)
  const readings = readingRows(post, receivedAt, latencyMs, deps.newPollId())
  for (const row of readings) {
    const rowProblems = validateReading(row)
    if (rowProblems.length > 0) return fail(rowProblems.join('; '))
  }

  if (!store.sourceRow(CAMERA_SOURCE_ID)) store.appendSource(cameraSourceRow())
  if (!store.deviceRow(CAMERA_SOURCE_ID))
    store.appendDevice({ device_id: CAMERA_SOURCE_ID, kind: 'camera', last_row_at: receivedAt })

  const { day } = mytDayAndMinute(post.device_time)
  const fileId = drive.saveFrame(deps.framesRootId, day, post.capture_id, post.jpeg_b64 as string)

  const pollId = String(readings[0]?.poll_id ?? deps.newPollId())
  store.appendPoll({
    poll_id: pollId,
    source_kind: 'camera',
    source_id: CAMERA_SOURCE_ID,
    started_at: receivedAt,
    received_at: receivedAt,
    http_status: 200,
    latency_ms: latencyMs,
    outcome: 'ok',
    new_rows: readings.length,
    error: '',
    raw_file_id: ''
  })
  store.appendReadings(readings)
  store.appendProbation({
    capture_id: post.capture_id,
    frame_file_id: fileId,
    device_time: post.device_time,
    phone_flag: post.flag as string
  })
  store.touchDevice(CAMERA_SOURCE_ID, receivedAt)
  if (store.sourceRow(CAMERA_SOURCE_ID)?.distance_km !== post.distance_km)
    store.updateSourceDistance(CAMERA_SOURCE_ID, post.distance_km as number)
  return { ok: true, duplicate: false }
}

// `doGet?kind=camera_config`: the daylight window the page may post in.
export function cameraConfig(dayStart: string | null, dayEnd: string | null): { day_start: string; day_end: string } {
  return { day_start: dayStart ?? '', day_end: dayEnd ?? '' }
}

// The sheet and Drive reads the retention job needs.
export interface RetentionStore {
  probationFrames(): { frame_file_id: Cell; device_time: Cell }[]
  dayFolders(): { id: string; name: string }[]
  folderFiles(folderId: string): { id: string }[]
  trashFile(fileId: string): void
  trashFolder(folderId: string): void
}

export interface RetentionDeps {
  now: () => Date
  semesterEndsOn: string | null
  log: (line: string) => void
  error: (line: string) => void
}

const SEMESTER_DAY = /^\d{4}-\d{2}-\d{2}$/

function semesterOf(value: string | null): string | null {
  if (value === null || !SEMESTER_DAY.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== (month ?? 1) - 1 || date.getUTCDate() !== day)
    return null
  return value
}

// The daily retention job (AUD-5, NFR-14): trash every frame once today is past
// `SEMESTER_ENDS_ON`, and any frame whose `device_time` is more than 183 days old.
// Empty day folders go too; `readings` and `probation` rows stay. Logs one line per
// run, even at zero. Without a usable `SEMESTER_ENDS_ON`, logs an error and still
// applies the 183-day cap.
export function runCameraRetention(store: RetentionStore, deps: RetentionDeps): { deleted: number } {
  const today = toMytIso(deps.now()).slice(0, 10)
  const cap = toMytIso(new Date(deps.now().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)).slice(0, 10)
  const semester = semesterOf(deps.semesterEndsOn)
  if (semester === null)
    deps.error(
      `camera retention: SEMESTER_ENDS_ON is missing or invalid (${deps.semesterEndsOn ?? 'unset'}); applying the 183-day cap`
    )
  const pastSemester = semester !== null && today > semester
  let deleted = 0
  for (const frame of store.probationFrames()) {
    const fileId = String(frame.frame_file_id ?? '')
    const deviceTime = String(frame.device_time ?? '')
    if (!fileId || Number.isNaN(Date.parse(deviceTime))) continue
    if (pastSemester || toMytIso(new Date(deviceTime)).slice(0, 10) < cap) {
      store.trashFile(fileId)
      deleted += 1
    }
  }
  for (const folder of store.dayFolders()) {
    if (store.folderFiles(folder.id).length === 0) store.trashFolder(folder.id)
  }
  deps.log(`Retention ${today}: deleted ${deleted} frames (semester ends ${semester ?? 'unset'}, cap ${cap})`)
  return { deleted }
}
