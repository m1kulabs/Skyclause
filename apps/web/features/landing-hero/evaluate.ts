import type { InputValue, Verdicts } from '@skyclause/contracts/api/shared'
import { serverApiOrigin } from '../../lib/api-origin'
import { toLocalTime, type HeroWindow } from './window-model'

// #88's committed shape (owner d-commons #179 fills it next): verdicts, derived-only strip, the label.
// A future optional `latest_approved_call` is read from the calendar query instead, which #88 commits.
export interface EvaluateData {
  label: string
  evaluated_at: string
  verdicts: Verdicts[]
  strip: InputValue[]
}

export type EvaluateResult =
  | { kind: 'ok'; data: EvaluateData }
  | { kind: 'rate_limited'; retryAfter: string }
  | { kind: 'error'; status: number | null }

export interface LatestCall {
  callId: string
  permalink: string
  at: string
}

/** `null` is no public approved call; `'error'` is a calendar read that failed, never shown as n=0. */
export type LatestCallRead = LatestCall | null | 'error'

export const EVALUATE_PATH = '/v1/public/commons/bukit-jalil/evaluate'

export function evaluateBody(win: HeroWindow) {
  return { date: win.date, start_time: toLocalTime(win.startMin), end_time: toLocalTime(win.endMin) }
}

export function calendarPath(pilot: { org: string; project: string } | null): string {
  if (!pilot) return '/v1/public/commons/bukit-jalil/calendar-entries?limit=1'
  return `/v1/public/${encodeURIComponent(pilot.org)}/${encodeURIComponent(pilot.project)}/calendar-entries?limit=1`
}

export function pilotRefOf(env: string | undefined): { org: string; project: string } | null {
  if (!env) return null
  const [org, project, ...rest] = env.split('/')
  if (!org || !project || rest.length) return null
  return { org, project }
}

/** `Retry-After` as an instant: delta seconds or an HTTP date, read relative to `now`. */
export function retryAfterInstant(header: string | null, now: Date): string {
  if (header && /^\d+$/.test(header)) return new Date(now.getTime() + Number(header) * 1000).toISOString()
  if (header) {
    const parsed = Date.parse(header)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }
  return new Date(now.getTime() + 60_000).toISOString()
}

function isEvaluateData(value: unknown): value is EvaluateData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    typeof data.label === 'string' &&
    typeof data.evaluated_at === 'string' &&
    Array.isArray(data.verdicts) &&
    Array.isArray(data.strip)
  )
}

function withBase(baseUrl: string | undefined, path: string): string {
  return baseUrl ? new URL(path, baseUrl).toString() : path
}

async function postEvaluate(
  win: HeroWindow,
  baseUrl: string | undefined,
  signal?: AbortSignal
): Promise<EvaluateResult> {
  let response: Response
  try {
    response = await fetch(withBase(baseUrl, EVALUATE_PATH), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(evaluateBody(win)),
      signal,
      ...(typeof window === 'undefined' ? { cache: 'no-store' as const } : {})
    })
  } catch {
    return { kind: 'error', status: null }
  }
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfter: retryAfterInstant(response.headers.get('Retry-After'), new Date()) }
  if (!response.ok) return { kind: 'error', status: response.status }
  const body: unknown = await response.json().catch(() => null)
  if (!isEvaluateData(body)) return { kind: 'error', status: response.status }
  return { kind: 'ok', data: body }
}

/** Browser read: same origin, or NEXT_PUBLIC_API_ORIGIN where the deploy splits hosts. */
export function fetchEvaluate(win: HeroWindow, signal?: AbortSignal): Promise<EvaluateResult> {
  const baseUrl = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_API_ORIGIN : undefined
  return postEvaluate(win, baseUrl, signal)
}

interface CalendarEntry {
  call_id: string
  permalink: string
  starts_at: string
}

/** The pilot project's public calendar (LND-3): latest by start, null when unset, private or empty, else 'error'. */
export async function fetchLatestCall(
  pilot: { org: string; project: string } | null,
  baseUrl?: string,
  signal?: AbortSignal
): Promise<LatestCallRead> {
  if (!pilot) return null
  let response: Response
  try {
    response = await fetch(withBase(baseUrl, calendarPath(pilot)), {
      headers: { Accept: 'application/json' },
      signal,
      ...(typeof window === 'undefined' ? { cache: 'no-store' as const } : {})
    })
  } catch {
    return 'error'
  }
  if (response.status === 404) return null
  if (!response.ok) return 'error'
  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return 'error'
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return 'error'
  if (data.length === 0) return null
  const entries = data.filter(
    (entry): entry is CalendarEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as CalendarEntry).call_id === 'string' &&
      typeof (entry as CalendarEntry).permalink === 'string' &&
      typeof (entry as CalendarEntry).starts_at === 'string'
  )
  if (!entries.length) return 'error'
  const latest = [...entries].sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]!
  return { callId: latest.call_id, permalink: latest.permalink, at: latest.starts_at }
}

// Server reads call the same endpoint from the web server (Conventions first-party pattern). With no API origin they
// reject with ApiOriginError and send nothing; a read with no pilot needs no origin.
export async function fetchEvaluateServer(win: HeroWindow): Promise<EvaluateResult> {
  return postEvaluate(win, serverApiOrigin(), AbortSignal.timeout(2000))
}

export async function fetchLatestCallServer(pilot: { org: string; project: string } | null): Promise<LatestCallRead> {
  return fetchLatestCall(pilot, pilot ? serverApiOrigin() : undefined, AbortSignal.timeout(2000))
}
