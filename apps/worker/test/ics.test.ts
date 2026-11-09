// #154 c-ics-feed: the `ics` consumer (#79 §5) through dispatchEvent on emitted events, observed in the feed it
// writes for, `serveCalendarFeed` (renderNotice is #152's, doubled here). Calls come from factories (NFR-15).
import { serveCalendarFeed, type CalendarFeedDeps } from '@skyclause/api'
import { emitEvent, withTenant, type Tx } from '@skyclause/db'
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
import ICAL from 'ical.js'
import { expect, test } from 'vitest'
import { dispatchEvent } from '../src/events'
import { icsPart } from '../src/ics'

const ORIGIN = 'https://skyclause.m1ku.tech'
const DECLARED = { createdAt: new Date('2026-11-01T02:00:00Z'), updatedAt: new Date('2026-11-01T02:00:00Z') }
const deps: CalendarFeedDeps = {
  render: (call) => ({ subject: `${call.mode}`, text: `Call ${call.id}` }),
  origin: () => ORIGIN
}

type EventInput = Parameters<typeof emitEvent>[1]

async function scene(clock: () => Date = () => new Date('2026-11-02T07:10:05Z')) {
  const org = await makeOrganization()
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: org.id, principal: memberOf(org.id) }, fn)
  const project = await inOrg((tx) => makeProject(tx, { public: true }))
  const [consumer] = icsPart(clock).events!
  const deliver = (id: string) => dispatchEvent([consumer!], id)
  const emit = (e: Omit<EventInput, 'projectId'>) =>
    inOrg((tx) => emitEvent(tx, { projectId: project.id, ...e } as EventInput))

  /** A call sent at `sentAt`, and its `call.sent` event, not yet delivered. */
  const sent = async (
    c: { mode: 'commute_disruption' | 'outdoor_limited' | 'normal' | 'surge_night'; sentAt: Date } & (
      { windowId: string } | { nightId: string }
    )
  ) => {
    const call = await inOrg(async (tx) => {
      const run = await makeRun(tx, {
        projectId: project.id,
        pack: 'nightId' in c ? 'crowd' : 'sky',
        status: 'drafted'
      })
      const bundle = await makeBundle(tx, { runId: run.id })
      return makeCall(tx, { ...c, bundleId: bundle.id, state: 'sent', approvedAt: c.sentAt })
    })
    const { id } = await emit({ type: 'call.sent', data: { call_id: call.id, mode: c.mode, outcome: 'sent' } })
    return { call, event: id }
  }

  const feed = async () => {
    const response = await serveCalendarFeed(
      new Request(`${ORIGIN}/p/${org.slug}/${project.slug}/calendar.ics`),
      { org: org.slug, project: project.slug },
      deps
    )
    const body = await response.text()
    const calendar = new ICAL.Component(ICAL.parse(body))
    return {
      body,
      lastModified: response.headers.get('Last-Modified'),
      entries: calendar.getAllSubcomponents('vevent').map((vevent) => ({
        uid: vevent.getFirstPropertyValue('uid'),
        sequence: vevent.getFirstPropertyValue('sequence'),
        url: vevent.getFirstPropertyValue('url'),
        status: vevent.getFirstPropertyValue('status')
      }))
    }
  }

  const window = () =>
    inOrg((tx) =>
      makeWindow(tx, {
        projectId: project.id,
        startsAt: new Date('2026-11-02T07:30:00Z'),
        endsAt: new Date('2026-11-02T07:45:00Z'),
        kind: 'commute_wave',
        ...DECLARED
      })
    )
  return { inOrg, project, deliver, emit, sent, feed, window }
}

test('a superseding sent call keeps the entry’s UID at SEQUENCE 1 (NTC-2, D20)', async () => {
  const { deliver, sent, feed, window } = await scene()
  const w = await window()
  const first = await sent({ mode: 'commute_disruption', windowId: w.id, sentAt: new Date('2026-11-02T07:10:00Z') })
  await deliver(first.event)
  const second = await sent({ mode: 'outdoor_limited', windowId: w.id, sentAt: new Date('2026-11-02T07:20:00Z') })
  await deliver(second.event)
  expect((await feed()).entries).toEqual([
    {
      uid: `call-${first.call.id}@skyclause.m1ku.tech`,
      sequence: 1,
      url: `${ORIGIN}/c/${second.call.id}`,
      status: 'CONFIRMED'
    }
  ])
})

test('call.sent reaches the feed within 60 seconds of sending (NTC-2), with an injected clock', async () => {
  const sentAt = new Date('2026-11-02T07:10:00Z')
  const { deliver, sent, feed, window } = await scene(() => new Date(sentAt.getTime() + 5_000))
  const w = await window()
  const { call, event } = await sent({ mode: 'commute_disruption', windowId: w.id, sentAt })
  expect((await feed()).entries).toEqual([])
  await deliver(event)
  const after = await feed()
  expect(after.entries).toMatchObject([{ uid: `call-${call.id}@skyclause.m1ku.tech`, sequence: 0 }])
  // The entry's DTSTAMP and the feed's Last-Modified are the consumer's write, 5 s after sending.
  expect(after.body).toContain('\r\nDTSTAMP:20261102T071005Z\r\n')
  expect(new Date(after.lastModified!).getTime() - sentAt.getTime()).toBeLessThanOrEqual(60_000)
})

test('deliveries in either order, and redeliveries, agree on the identity', async () => {
  const { deliver, sent, feed, window } = await scene()
  const w = await window()
  const first = await sent({ mode: 'commute_disruption', windowId: w.id, sentAt: new Date('2026-11-02T07:10:00Z') })
  const second = await sent({ mode: 'commute_disruption', windowId: w.id, sentAt: new Date('2026-11-02T07:20:00Z') })
  await deliver(second.event)
  await deliver(first.event)
  await deliver(second.event)
  await deliver(first.event)
  expect((await feed()).entries).toMatchObject([{ uid: `call-${first.call.id}@skyclause.m1ku.tech`, sequence: 1 }])
})

test('window.cancelled raises the entry’s SEQUENCE and the feed renders it CANCELLED', async () => {
  const { deliver, emit, sent, feed, window } = await scene()
  const w = await window()
  const { call, event } = await sent({
    mode: 'commute_disruption',
    windowId: w.id,
    sentAt: new Date('2026-11-02T07:10:00Z')
  })
  await deliver(event)
  await asLogin('postgres', (client) =>
    client.query(`UPDATE "window" SET cancelled_at = '2026-11-02T07:15:00Z' WHERE id = $1`, [w.id])
  )
  const cancelled = await emit({
    type: 'window.cancelled',
    data: { window_id: w.id, via: 'form', times_changed: false, series_id: null }
  })
  await deliver(cancelled.id)
  await deliver(cancelled.id)
  expect((await feed()).entries).toEqual([
    { uid: `call-${call.id}@skyclause.m1ku.tech`, sequence: 1, url: `${ORIGIN}/c/${call.id}`, status: 'CANCELLED' }
  ])
})

test('listing.changed raises a surge night’s SEQUENCE; a cancelled listing renders it CANCELLED', async () => {
  const { inOrg, project, deliver, emit, sent, feed } = await scene()
  const { night, listing } = await inOrg(async (tx) => {
    const night = await makeNight(tx, {
      projectId: project.id,
      arrivalStart: new Date('2026-11-14T10:00:00Z'),
      arrivalEnd: new Date('2026-11-14T12:00:00Z'),
      ...DECLARED
    })
    return { night, listing: await makeListing(tx, { projectId: project.id, nightId: night.id, state: 'listed' }) }
  })
  const { event } = await sent({ mode: 'surge_night', nightId: night.id, sentAt: new Date('2026-11-13T23:00:00Z') })
  await deliver(event)
  expect((await feed()).entries).toMatchObject([
    { uid: `night-${night.id}@skyclause.m1ku.tech`, sequence: 0, status: 'CONFIRMED' }
  ])
  await asLogin('postgres', (client) =>
    client.query(`UPDATE listing SET state = 'cancelled' WHERE id = $1`, [listing.id])
  )
  const changed = await emit({
    type: 'listing.changed',
    data: { listing_id: listing.id, state: 'cancelled', night_id: night.id }
  })
  await deliver(changed.id)
  expect((await feed()).entries).toMatchObject([
    { uid: `night-${night.id}@skyclause.m1ku.tech`, sequence: 1, status: 'CANCELLED' }
  ])
})

test('window.updated raises the SEQUENCE when the window’s times changed, and not otherwise', async () => {
  const { deliver, emit, sent, feed, window } = await scene()
  const w = await window()
  const { event } = await sent({ mode: 'commute_disruption', windowId: w.id, sentAt: new Date('2026-11-02T07:10:00Z') })
  await deliver(event)
  const updated = (times_changed: boolean) =>
    emit({ type: 'window.updated', data: { window_id: w.id, via: 'form', times_changed, series_id: null } })
  await deliver((await updated(false)).id)
  expect((await feed()).entries).toMatchObject([{ sequence: 0, status: 'CONFIRMED' }])
  await deliver((await updated(true)).id)
  expect((await feed()).entries).toMatchObject([{ sequence: 1, status: 'CONFIRMED' }])
})

test('a window whose calls were all Normal has no entry, before or after it is cancelled', async () => {
  const { deliver, emit, sent, feed, window } = await scene()
  const w = await window()
  const { event } = await sent({ mode: 'normal', windowId: w.id, sentAt: new Date('2026-11-02T07:10:00Z') })
  await deliver(event)
  const cancelled = await emit({
    type: 'window.cancelled',
    data: { window_id: w.id, via: 'form', times_changed: false, series_id: null }
  })
  await deliver(cancelled.id)
  expect((await feed()).entries).toEqual([])
})
