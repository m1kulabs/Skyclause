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
export interface Setup {
  token: string
  distance_km: number
  start: string
  end: string
  near: Region
  far: Region
  reference: Reference | null
  consent: boolean
  lastMark?: number
  blockedUntil?: number
  rejectedToken?: string
}
export interface Frame {
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

const DAY = 86_400_000
const OFFSET = 8 * 3_600_000
export const CADENCE = 600_000
export const validHours = (start: string, end: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
export const dayStart = (now: number, hhmm: string) =>
  Math.floor((now + OFFSET) / DAY) * DAY - OFFSET + minutes(hhmm) * 60_000
export const daylight = (now: number, start: string, end: string) =>
  validHours(start, end) && now >= dayStart(now, start) && now < dayStart(now, end)
export function nextMark(now: number, start: string, end: string): number {
  const first = dayStart(now, start)
  const next = now < first ? first : first + (Math.floor((now - first) / CADENCE) + 1) * CADENCE
  return next < dayStart(now, end) ? next : first + DAY
}
export const deviceTime = (now: number) => new Date(now + OFFSET).toISOString().replace('Z', '+08:00')

let lastIdTime = 0
let sequence = 0
export function uuid7(now: number): string {
  const timestamp = Math.max(now, lastIdTime)
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

export const validRegion = (r: Region) =>
  Object.values(r).every(Number.isFinite) &&
  r.x >= 0 &&
  r.y >= 0 &&
  r.width > 0 &&
  r.height > 0 &&
  r.x + r.width <= 1 &&
  r.y + r.height <= 2 / 3

export function contrast(image: { data: Uint8ClampedArray; width: number; height: number }, region: Region): number {
  let sum = 0,
    squared = 0,
    count = 0
  const left = Math.floor(region.x * image.width),
    top = Math.floor(region.y * image.height)
  const right = Math.ceil((region.x + region.width) * image.width),
    bottom = Math.ceil((region.y + region.height) * image.height)
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

export function ratios(near: number, far: number, referenceNear: number, referenceFar: number) {
  if (!(referenceNear > 0 && referenceFar > 0)) throw new Error('reference-contrast')
  const ratio_near = near / referenceNear,
    ratio_far = far / referenceFar
  return { ratio_near, ratio_far, flag: ratio_far < 0.5 ? ('obscured' as const) : ('visible' as const) }
}
