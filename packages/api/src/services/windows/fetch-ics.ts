import { assertPublicUrl, safeFetch, type AssertPublicUrl, type SafeFetch } from '@skyclause/config/net'

export type CalendarTransport = { assertPublicUrl: AssertPublicUrl; safeFetch: SafeFetch }
export type Validators = { etag: string | null; lastModified: string | null }
export type FetchResult = { status: 'unchanged' } | ({ status: 'changed'; text: string } & Validators)

export const realCalendarTransport: CalendarTransport = { assertPublicUrl, safeFetch }
export class CalendarHttpError extends Error {
  constructor() {
    super('Calendar request failed.')
    this.name = 'CalendarHttpError'
  }
}
export class CalendarDecodeError extends Error {
  constructor() {
    super('Calendar is not valid UTF-8.')
    this.name = 'CalendarDecodeError'
  }
}

/** Fetches a bounded calendar. A 304 must be checked against the stored document by the caller. */
export async function fetchCalendar(
  url: string,
  validators: Validators,
  transport: CalendarTransport = realCalendarTransport
): Promise<FetchResult> {
  await transport.assertPublicUrl(url, { https: true })
  const headers = new Headers()
  if (validators.etag) headers.set('If-None-Match', validators.etag)
  else if (validators.lastModified) headers.set('If-Modified-Since', validators.lastModified)
  const response = await transport.safeFetch(url, {
    headers,
    https: true,
    redirects: 'follow',
    maxRedirects: 3,
    timeoutMs: 10_000,
    maxBytes: 5 * 1024 * 1024
  })
  if (response.status === 304) return { status: 'unchanged' }
  if (response.status !== 200) throw new CalendarHttpError()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer())
  } catch {
    throw new CalendarDecodeError()
  }
  return {
    status: 'changed',
    text,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  }
}
