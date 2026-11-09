// #154 c-ics-feed: `/p/{org}/{project}/calendar.ics` through `serveCalendarFeed`, on the #79 §7 test database, with a
// renderNotice double (#152 renders the real text). Calls come from factories only (NFR-15).
import { createHash } from 'node:crypto'
import type { CallView } from '@skyclause/contracts'
import { assignIcsIdentity, window as windowTable, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeListing,
  makeNight,
  makeOrganization,
  makeProject,
  makeRun,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import type { RenderNotice } from '@skyclause/delivery'
import ICAL from 'ical.js'
import { beforeEach, expect, test } from 'vitest'
import { serveCalendarFeed, type CalendarFeedDeps } from '../src/services/ics'

const ORIGIN = 'https://skyclause.m1ku.tech'
const SENT = new Date('2026-11-02T07:10:00Z')
// Windows and nights are declared before their calls are sent.
const DECLARED = { createdAt: new Date('2026-11-01T02:00:00Z'), updatedAt: new Date('2026-11-01T02:00:00Z') }

let rendered: Array<{ call: CallView; o: Parameters<RenderNotice>[1] }>
beforeEach(() => {
  rendered = []
})

const render: RenderNotice = (call, o) => {
  rendered.push({ call, o })
  return { subject: `${call.mode} ${call.id}`, text: `Approved; see ${o.links.permalink}` }
}
const deps: CalendarFeedDeps = { render, origin: () => ORIGIN }

type Mode = 'normal' | 'commute_disruption' | 'outdoor_limited' | 'surge_night' | null

async function scene(o: { public?: boolean } = {}) {
  const org = await makeOrganization()
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: org.id, principal: memberOf(org.id) }, fn)
  const project = await inOrg((tx) => makeProject(tx, { public: o.public ?? true, name: 'Bukit Jalil' }))
  const request = (headers: Record<string, string> = {}, method = 'GET') =>
    new Request(`${ORIGIN}/p/${org.slug}/${project.slug}/calendar.ics`, { method, headers })
  const get = (headers: Record<string, string> = {}, method = 'GET') =>
    serveCalendarFeed(request(headers, method), { org: org.slug, project: project.slug }, deps)

  /** A class window; a commute wave by default, as on 2 November. */
  const window = (tx: Tx, w: Partial<typeof windowTable.$inferInsert> = {}) =>
    makeWindow(tx, {
      projectId: project.id,
      startsAt: new Date('2026-11-02T07:30:00Z'),
      endsAt: new Date('2026-11-02T07:45:00Z'),
      kind: 'commute_wave',
      ...DECLARED,
      ...w
    })

  /** A night with D19's arrival period and, when known, the exit period, on a listing in `listingState`. */
  const night = async (
    tx: Tx,
    n: {
      listingState: 'proposed' | 'listed' | 'rejected' | 'cancelled' | null
      exitEnd?: Date | null
      state?: 'upcoming' | 'unlisted'
    }
  ) => {
    const exitEnd = n.exitEnd === undefined ? new Date('2026-11-14T16:30:00Z') : n.exitEnd
    const row = await makeNight(tx, {
      projectId: project.id,
      state: n.state ?? 'upcoming',
      arrivalStart: new Date('2026-11-14T10:00:00Z'),
      arrivalEnd: new Date('2026-11-14T12:00:00Z'),
      exitStart: exitEnd ? new Date('2026-11-14T15:00:00Z') : null,
      exitEnd,
      ...DECLARED
    })
    if (n.listingState) await makeListing(tx, { projectId: project.id, nightId: row.id, state: n.listingState })
    return row
  }

  /** A call in its own bundle, and once sent, through the `ics` consumer's write as `call.sent` runs it. */
  const send = async (
    tx: Tx,
    c: {
      mode: Mode
      windowId?: string
      nightId?: string
      pack?: 'sky' | 'crowd'
      sentAt?: Date
      state?: 'sent' | 'approved' | 'failed'
      draftOnly?: boolean
    }
  ) => {
    // Drafted: a project holds one queued run per pack.
    const run = await makeRun(tx, {
      projectId: project.id,
      pack: c.pack ?? (c.nightId ? 'crowd' : 'sky'),
      status: 'drafted'
    })
    const bundle = await makeBundle(tx, { runId: run.id, draftOnly: c.draftOnly ?? false })
    const sentAt = c.sentAt ?? SENT
    const row = await makeCall(tx, {
      bundleId: bundle.id,
      windowId: c.windowId,
      nightId: c.nightId,
      mode: c.mode,
      state: c.state ?? 'sent',
      approvedAt: sentAt,
      sentAt: c.state === 'approved' ? null : sentAt
    })
    await assignIcsIdentity(tx, row.id, sentAt)
    return row
  }
  return { org, project, inOrg, request, get, window, night, send }
}

function events(body: string) {
  const calendar = new ICAL.Component(ICAL.parse(body))
  ICAL.TimezoneService.register(calendar.getFirstSubcomponent('vtimezone')!)
  const read = calendar.getAllSubcomponents('vevent').map((vevent) => {
    const event = new ICAL.Event(vevent)
    return {
      uid: event.uid,
      sequence: event.sequence,
      start: event.startDate.toJSDate().toISOString(),
      end: event.endDate.toJSDate().toISOString(),
      summary: event.summary,
      url: vevent.getFirstPropertyValue('url'),
      status: vevent.getFirstPropertyValue('status')
    }
  })
  ICAL.TimezoneService.reset()
  return read
}

const feed = async (response: Response | Promise<Response>) => events(await (await response).text())

test('a public project’s feed is text/calendar, its ETag the body’s SHA-256, its Last-Modified the entry’s change', async () => {
  const { inOrg, get, window, send } = await scene()
  const call = await inOrg(async (tx) => send(tx, { mode: 'commute_disruption', windowId: (await window(tx)).id }))
  const response = await get()
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
  expect(response.headers.get('Cache-Control')).toBe('no-cache')
  const body = await response.text()
  expect(response.headers.get('ETag')).toBe(`"${createHash('sha256').update(body).digest('hex')}"`)
  expect(response.headers.get('Last-Modified')).toBe('Mon, 02 Nov 2026 07:10:00 GMT')
  expect(events(body)).toEqual([
    {
      uid: `call-${call.id}@skyclause.m1ku.tech`,
      sequence: 0,
      start: '2026-11-02T07:30:00.000Z',
      end: '2026-11-02T07:45:00.000Z',
      summary: `commute_disruption ${call.id}`,
      url: `${ORIGIN}/c/${call.id}`,
      status: 'CONFIRMED'
    }
  ])
  expect(body).toContain('\r\nDTSTAMP:20261102T071000Z\r\n')
  expect(body).toContain('\r\nX-WR-CALNAME:Bukit Jalil conditions calendar\r\n')
  // SUMMARY and DESCRIPTION are renderNotice's, in English for the ICS channel with the permalink (D20).
  expect(body.replaceAll('\r\n ', '')).toContain(`\r\nDESCRIPTION:Approved\\; see ${ORIGIN}/c/${call.id}\r\n`)
  expect(rendered.map(({ call: c, o }) => ({ id: c.id, uid: c.ics_uid, o }))).toEqual([
    {
      id: call.id,
      uid: `call-${call.id}@skyclause.m1ku.tech`,
      o: { language: 'en', channel: 'ics', links: { permalink: `${ORIGIN}/c/${call.id}` } }
    }
  ])
})

test('a matching ETag answers 304, as does an If-Modified-Since at or after Last-Modified (D20)', async () => {
  const { inOrg, get, window, send } = await scene()
  await inOrg(async (tx) => send(tx, { mode: 'commute_disruption', windowId: (await window(tx)).id }))
  const first = await get()
  const etag = first.headers.get('ETag')!
  for (const ifNoneMatch of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
    const again = await get({ 'If-None-Match': ifNoneMatch })
    expect(again.status).toBe(304)
    expect(again.headers.get('ETag')).toBe(etag)
    expect(await again.text()).toBe('')
  }
  expect((await get({ 'If-None-Match': '"other"' })).status).toBe(200)
  expect((await get({ 'If-Modified-Since': 'Mon, 02 Nov 2026 07:10:00 GMT' })).status).toBe(304)
  expect((await get({ 'If-Modified-Since': 'Mon, 02 Nov 2026 07:09:59 GMT' })).status).toBe(200)
  // RFC 9110 §13.1.3: If-Modified-Since is ignored once If-None-Match is present.
  expect((await get({ 'If-None-Match': '"other"', 'If-Modified-Since': 'Tue, 03 Nov 2026 00:00:00 GMT' })).status).toBe(
    200
  )
})

test('HEAD answers the GET’s headers without a body', async () => {
  const { inOrg, get, window, send } = await scene()
  await inOrg(async (tx) => send(tx, { mode: 'outdoor_limited', windowId: (await window(tx)).id }))
  const [full, head] = [await get(), await get({}, 'HEAD')]
  expect(head.status).toBe(200)
  expect(head.headers.get('ETag')).toBe(full.headers.get('ETag'))
  expect(head.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
  expect(await head.text()).toBe('')
})

test('private, unknown and suspended projects answer 404 (PRD IA, D20)', async () => {
  const hidden = await scene({ public: false })
  const missing = await serveCalendarFeed(
    new Request(`${ORIGIN}/p/nobody/nothing/calendar.ics`),
    { org: 'nobody', project: 'nothing' },
    deps
  )
  const suspended = await scene()
  await asLogin('postgres', (client) =>
    client.query('UPDATE auth.organization SET deletion_requested_at = now() WHERE id = $1', [suspended.org.id])
  )
  for (const response of [await hidden.get(), missing, await suspended.get()]) {
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toBe('application/problem+json')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ type: 'https://docs.skyclause.m1ku.tech/problems/not-found' })
  }
})

test('a proposed listing never appears on the conditions calendar (CAL-14)', async () => {
  const { inOrg, get, night, send } = await scene()
  await inOrg(async (tx) => {
    for (const listingState of ['proposed', 'rejected', null] as const) {
      await send(tx, { mode: 'surge_night', nightId: (await night(tx, { listingState })).id })
    }
  })
  expect(await feed(get())).toEqual([])
})

test('no ICS entry exists for any guest-window call (GST-5), nor a draft-only or unsent one', async () => {
  const { inOrg, get, window, send } = await scene()
  await inOrg(async (tx) => {
    await send(tx, { mode: 'commute_disruption', windowId: (await window(tx, { guest: true, via: 'guest' })).id })
    await send(tx, { mode: 'commute_disruption', windowId: (await window(tx)).id, draftOnly: true })
    await send(tx, { mode: 'commute_disruption', windowId: (await window(tx)).id, state: 'approved' })
    await send(tx, { mode: 'commute_disruption', windowId: (await window(tx)).id, state: 'failed' })
  })
  expect(await feed(get())).toEqual([])
})

test('a history of Normal calls only has no entry; a later Normal call cancels the entry at the next SEQUENCE', async () => {
  const { inOrg, get, window, send } = await scene()
  const first = await inOrg(async (tx) => {
    const quiet = (await window(tx, { startsAt: new Date('2026-11-03T01:00:00Z') })).id
    await send(tx, { mode: 'normal', windowId: quiet })
    await send(tx, { mode: 'normal', windowId: quiet, sentAt: new Date('2026-11-02T08:00:00Z') })
    const windowId = (await window(tx)).id
    const call = await send(tx, { mode: 'commute_disruption', windowId })
    const later = await send(tx, { mode: 'normal', windowId, sentAt: new Date('2026-11-02T07:20:00Z') })
    return { call, later }
  })
  expect(await feed(get())).toMatchObject([
    {
      uid: `call-${first.call.id}@skyclause.m1ku.tech`,
      sequence: 1,
      url: `${ORIGIN}/c/${first.later.id}`,
      status: 'CANCELLED'
    }
  ])
})

test('a non-Normal call after a cancelling Normal one confirms the entry again under the same UID', async () => {
  const { inOrg, get, window, send } = await scene()
  const ids = await inOrg(async (tx) => {
    const windowId = (await window(tx)).id
    const first = await send(tx, { mode: 'commute_disruption', windowId })
    await send(tx, { mode: 'normal', windowId, sentAt: new Date('2026-11-02T07:20:00Z') })
    const again = await send(tx, { mode: 'commute_disruption', windowId, sentAt: new Date('2026-11-02T07:25:00Z') })
    return { first: first.id, again: again.id }
  })
  expect(await feed(get())).toMatchObject([
    { uid: `call-${ids.first}@skyclause.m1ku.tech`, sequence: 2, url: `${ORIGIN}/c/${ids.again}`, status: 'CONFIRMED' }
  ])
})

test('a sent No call (no mode) is an entry: only Normal calls make none', async () => {
  const { inOrg, get, window, send } = await scene()
  const call = await inOrg(async (tx) => send(tx, { mode: null, windowId: (await window(tx)).id }))
  expect(await feed(get())).toMatchObject([
    { uid: `call-${call.id}@skyclause.m1ku.tech`, summary: `null ${call.id}`, status: 'CONFIRMED' }
  ])
})

test('a cancelled window renders its entry CANCELLED; the Sky and Crowd calls on one window are two entries', async () => {
  const { inOrg, get, window, send } = await scene()
  const ids = await inOrg(async (tx) => {
    const windowId = (await window(tx, { cancelledAt: new Date('2026-11-02T07:15:00Z') })).id
    const sky = await send(tx, { mode: 'commute_disruption', windowId })
    const crowd = await send(tx, { mode: 'surge_night', windowId, pack: 'crowd' })
    return { sky: sky.id, crowd: crowd.id }
  })
  const entries = await feed(get())
  expect(entries.map(({ uid, status }) => ({ uid, status })).sort((a, b) => (a.uid < b.uid ? -1 : 1))).toEqual(
    [ids.sky, ids.crowd].sort().map((id) => ({ uid: `call-${id}@skyclause.m1ku.tech`, status: 'CANCELLED' }))
  )
})

test('spans: a window’s start and end; a zero-length commute wave ends where it starts (D13)', async () => {
  const { inOrg, get, window, send } = await scene()
  const at = new Date('2026-11-02T07:30:00Z')
  await inOrg(async (tx) => send(tx, { mode: 'commute_disruption', windowId: (await window(tx, { endsAt: at })).id }))
  const response = await get()
  const body = await response.text()
  expect(body).not.toContain('DTEND')
  expect(events(body)).toMatchObject([{ start: '2026-11-02T07:30:00.000Z', end: '2026-11-02T07:30:00.000Z' }])
})

test('a surge night spans the arrival start to the exit end, or to the arrival end while exit times are unknown (D19)', async () => {
  const { inOrg, get, night, send } = await scene()
  const nights = await inOrg(async (tx) => {
    const known = await night(tx, { listingState: 'listed' })
    const pending = await night(tx, { listingState: 'listed', exitEnd: null })
    await send(tx, { mode: 'surge_night', nightId: known.id })
    await send(tx, { mode: 'surge_night', nightId: pending.id })
    return { known: known.id, pending: pending.id }
  })
  const entries = await feed(get())
  expect(entries.find((e) => e.uid === `night-${nights.known}@skyclause.m1ku.tech`)).toMatchObject({
    sequence: 0,
    start: '2026-11-14T10:00:00.000Z',
    end: '2026-11-14T16:30:00.000Z',
    status: 'CONFIRMED'
  })
  expect(entries.find((e) => e.uid === `night-${nights.pending}@skyclause.m1ku.tech`)).toMatchObject({
    end: '2026-11-14T12:00:00.000Z'
  })
})

test('a night without an arrival period is left out, and the rest of the feed still answers', async () => {
  const { project, inOrg, get, window, send } = await scene()
  await inOrg(async (tx) => {
    const unplaced = await makeNight(tx, { projectId: project.id, ...DECLARED })
    await makeListing(tx, { projectId: project.id, nightId: unplaced.id, state: 'listed' })
    await send(tx, { mode: 'surge_night', nightId: unplaced.id })
    await send(tx, { mode: 'commute_disruption', windowId: (await window(tx)).id })
  })
  const response = await get()
  expect(response.status).toBe(200)
  expect((await feed(response)).map((e) => e.uid)).toEqual([expect.stringMatching(/^call-/)])
})

test('a cancelled listing or an unlisted night renders the night’s entry CANCELLED', async () => {
  const { inOrg, get, night, send } = await scene()
  await inOrg(async (tx) => {
    await send(tx, { mode: 'surge_night', nightId: (await night(tx, { listingState: 'cancelled' })).id })
    await send(tx, {
      mode: 'surge_night',
      nightId: (await night(tx, { listingState: 'listed', state: 'unlisted' })).id
    })
  })
  expect((await feed(get())).map((e) => e.status)).toEqual(['CANCELLED', 'CANCELLED'])
})
