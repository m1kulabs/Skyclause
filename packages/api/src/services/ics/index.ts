import { createHash } from 'node:crypto'
import { loadEnv } from '@skyclause/config'
import { HTTP_PROBLEM_STATUS, type CallView } from '@skyclause/contracts'
import { findPublicFeedProject, loadIcsEntries, withPublicReader, type IcsEntry, type Tx } from '@skyclause/db'
import { renderNotice, writeCalendar, type RenderNotice } from '@skyclause/delivery'
import { problemType } from '../../problems'
import { instant } from '../../serialize'

// #154 c-ics-feed: the conditions calendar at `/p/{org}/{project}/calendar.ics` (#79 §4 "Other", public), which
// `apps/web` serves on the marketing host. English only, one entry per call (D20).

export interface CalendarFeed {
  body: string
  /** The body's SHA-256, quoted. */
  etag: string
  /** The latest entry change; null with no entries. */
  lastModified: Date | null
}

const instantOrNull = (date: Date | null) => (date ? instant(date) : null)

/**
 * The call renderNotice gets, from the entry's head call in `public_call`. `public_call` carries no `notices`,
 * `recipients`, `recommendations` or `reason`, so they stay empty: `recipients` are subscriber IDs, never public, and
 * the ICS template (DESIGN "Email notice and ICS entry") reads none of the four.
 */
function callView({ call, uid, sequence }: IcsEntry): CallView {
  return {
    id: call.id,
    bundle_id: call.bundleId,
    window_id: call.windowId,
    night_id: call.nightId,
    mode: call.mode,
    watch: call.watch,
    no_call: call.noCall as CallView['no_call'],
    fired: call.fired as CallView['fired'],
    recommendations: [],
    recipients: [],
    notices: [],
    reason: '',
    state: call.state,
    shadow: call.shadow as CallView['shadow'],
    chosen: call.chosen,
    agrees: call.agrees,
    decision: call.decision,
    expires_at: instant(call.expiresAt),
    triggered_at: instant(call.triggeredAt),
    drafted_at: instant(call.draftedAt),
    approved_at: instantOrNull(call.approvedAt),
    sent_at: instantOrNull(call.sentAt),
    superseded_by_call_id: call.supersededByCallId,
    ics_uid: uid,
    ics_sequence: sequence
  }
}

/**
 * A project's conditions calendar, read as `public_reader`: each entry's SUMMARY and DESCRIPTION are `render`'s subject
 * and text for the `ics` channel in English, its URL the head call's permalink `{origin}/c/{callId}`.
 */
export async function calendarFeed(
  ctx: { principal: null; tx: Tx<null> },
  input: { projectId: string; name: string; origin: string },
  render: RenderNotice = renderNotice
): Promise<CalendarFeed> {
  const entries = await loadIcsEntries(ctx.tx, input.projectId)
  const events = entries.map((entry) => {
    const permalink = `${input.origin}/c/${entry.call.id}`
    const { subject, text } = render(callView(entry), {
      language: 'en',
      channel: 'ics',
      links: { permalink },
      window: { startsAt: instant(entry.start), endsAt: instant(entry.end) },
      sources: entry.sources
    })
    return {
      uid: entry.uid,
      sequence: entry.sequence,
      stamp: entry.changedAt,
      start: entry.start,
      end: entry.end,
      summary: subject,
      description: text,
      url: permalink,
      status: entry.status
    }
  })
  const body = writeCalendar({ name: `${input.name} conditions calendar`, events })
  const changes = entries.map((entry) => entry.changedAt.getTime())
  return {
    body,
    etag: `"${createHash('sha256').update(body).digest('hex')}"`,
    lastModified: changes.length ? new Date(Math.max(...changes)) : null
  }
}

export interface CalendarFeedDeps {
  render: RenderNotice
  /** The permalinks' origin. */
  origin(request: Request): string
}

let marketingOrigin: string | undefined | null = null

const productionDeps: CalendarFeedDeps = {
  render: renderNotice,
  // #158's permalink host, read once on the first request (as production.ts reads the web env). Terraform sets it in
  // both host modes; a local run, which leaves it unset, has one origin.
  origin: (request) => {
    if (marketingOrigin === null) marketingOrigin = loadEnv('web').MARKETING_ORIGIN
    return marketingOrigin ?? new URL(request.url).origin
  }
}

/** One RFC 9457 404 for private, unknown and suspended projects alike, never cached. */
function notFound() {
  return Response.json(
    {
      type: problemType('not-found'),
      title: 'Not found',
      status: HTTP_PROBLEM_STATUS['not-found'],
      detail: 'No public conditions calendar answers here.'
    },
    {
      status: HTTP_PROBLEM_STATUS['not-found'],
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' }
    }
  )
}

/**
 * RFC 9110 §13.1.2 and §13.1.3: If-None-Match by weak comparison, a list or `*`; only without it, If-Modified-Since
 * against Last-Modified at its one-second precision.
 */
function notModified(request: Request, feed: CalendarFeed) {
  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch !== null) {
    return ifNoneMatch.split(',').some((tag) => ['*', feed.etag].includes(tag.trim().replace(/^W\//, '')))
  }
  const since = Date.parse(request.headers.get('If-Modified-Since') ?? '')
  return (
    feed.lastModified !== null && !Number.isNaN(since) && Math.floor(feed.lastModified.getTime() / 1000) * 1000 <= since
  )
}

/**
 * `GET` and `HEAD` `/p/{org}/{project}/calendar.ics`, in one `public_reader` transaction: `public_project` decides
 * visibility, so a private, unknown or `suspended` project is 404 (D20), and the public views give the rest. Polls
 * revalidate every time (`no-cache`) and get 304 while nothing changed.
 */
export async function serveCalendarFeed(
  request: Request,
  params: { org: string; project: string },
  deps: CalendarFeedDeps = productionDeps
): Promise<Response> {
  const feed = await withPublicReader(async (tx) => {
    const found = await findPublicFeedProject(tx, params.org, params.project)
    if (!found || found.suspended) return null
    const input = { projectId: found.id, name: found.name, origin: deps.origin(request) }
    return calendarFeed({ principal: null, tx }, input, deps.render)
  })
  if (!feed) return notFound()
  const headers = new Headers({ ETag: feed.etag, 'Cache-Control': 'no-cache' })
  // RFC 9110 §15.4.5: a 304 carries the validators and caching fields, not the representation's metadata.
  if (notModified(request, feed)) return new Response(null, { status: 304, headers })
  headers.set('Content-Type', 'text/calendar; charset=utf-8')
  if (feed.lastModified) headers.set('Last-Modified', feed.lastModified.toUTCString())
  return new Response(request.method === 'HEAD' ? null : feed.body, { headers })
}
