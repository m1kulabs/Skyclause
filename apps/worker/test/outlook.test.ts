// #160 c-crowd-outlook: the daily Crowd outlook in the 15-minute batch (D45, PRD CAL-2), on a fake clock, with a
// double of #127's ForecastSource, each batch run on one shared system connection as the batch route runs it.
import type { NightInput } from '@skyclause/clauses'
import { log } from '@skyclause/config'
import { organization, run, shareSystemConnection, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import {
  makeFeatureFlag,
  makeNight,
  makeOrganization,
  makeProject,
  makeProjectPack,
  makeRun
} from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { createOutlookPart, type ListedNights } from '../src/outlook'
import { registry } from '../src/registry'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
  await inOrg((tx) => makeFeatureFlag(tx, { key: 'pack_crowd', enabled: true }))
})
afterEach(() => vi.restoreAllMocks())
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) =>
  withTenant({ orgId: org, principal: systemPrincipal('test') }, fn)
const runsOf = (projectId: string, org = orgId) =>
  inOrg((tx) => tx.select().from(run).where(eq(run.projectId, projectId)), org)
const myt = (local: string) => new Date(`${local}+08:00`)

/** A ForecastSource double: each project's listed nights as `nights` returns them, and every query it was asked. */
function forecastDouble() {
  const listed = new Map<string, Array<{ id: string; date: string }>>()
  const asked: Array<{ projectId: string; from: string; to: string }> = []
  const forecast: ListedNights = {
    nights: async (_tx, q) => {
      asked.push(q)
      return (listed.get(q.projectId) ?? []).map((n) => nightInput(n.id, n.date))
    }
  }
  return { forecast, asked, listed }
}

const nightInput = (id: string, date: string): NightInput => ({
  id,
  date,
  baseline: null,
  uplift: null,
  forecast: null,
  band: null,
  doors: null,
  show: null,
  arrivalStart: `${date}T08:00:00Z`,
  arrivalEnd: null,
  exitStart: null,
  exitEnd: null,
  singleSource: false,
  forecastId: null,
  state: 'insufficient_baseline'
})

const outlook = (forecast: ListedNights | null, now: Date) =>
  shareSystemConnection(() => createOutlookPart(forecast).batch!['crowd-outlook']!(now))

/** A project of `org` with its Crowd pack enabled (unless `enabled` is false). */
async function crowdProject(o: { org?: string; enabled?: boolean; archivedAt?: Date } = {}) {
  return inOrg(async (tx) => {
    const p = await makeProject(tx, o.archivedAt ? { archivedAt: o.archivedAt } : {})
    await makeProjectPack(tx, { projectId: p.id, pack: 'crowd', enabled: o.enabled ?? true })
    return p
  }, o.org)
}

describe('crowd-outlook', () => {
  test('one schedule run at the first batch at or after 07:00 MYT, for the listed nights in [D, D+13]', async () => {
    const p = await crowdProject()
    const nights = await inOrg(async (tx) => [
      await makeNight(tx, { projectId: p.id, date: '2026-11-12' }),
      await makeNight(tx, { projectId: p.id, date: '2026-11-25' })
    ])
    const { forecast, asked, listed } = forecastDouble()
    listed.set(p.id, nights)
    await outlook(forecast, myt('2026-11-12T06:45:00'))
    expect(await runsOf(p.id)).toEqual([])
    await outlook(forecast, myt('2026-11-12T07:00:00'))
    expect(asked).toEqual([{ projectId: p.id, from: '2026-11-12', to: '2026-11-25' }])
    expect(await runsOf(p.id)).toMatchObject([
      {
        pack: 'crowd',
        trigger: 'schedule',
        triggerRef: '07:00',
        dedupeKey: `schedule:${p.id}:crowd:2026-11-12:07:00`,
        triggeredAt: myt('2026-11-12T07:00:00'),
        nightIds: nights.map((n) => n.id),
        windowIds: []
      }
    ])
  })

  test('repeated batches make no second run that day; the next day has its own', async () => {
    const p = await crowdProject()
    const { forecast } = forecastDouble()
    for (const at of ['07:00', '07:15', '23:45']) await outlook(forecast, myt(`2026-11-12T${at}:00`))
    expect(await runsOf(p.id)).toHaveLength(1)
    // Today's run has drafted by tomorrow; were it still queued, tomorrow's outlook would coalesce into it.
    await inOrg((tx) => tx.update(run).set({ status: 'drafted' }).where(eq(run.projectId, p.id)))
    await outlook(forecast, myt('2026-11-13T07:00:00'))
    expect((await runsOf(p.id)).map((r) => r.dedupeKey).sort()).toEqual([
      `schedule:${p.id}:crowd:2026-11-12:07:00`,
      `schedule:${p.id}:crowd:2026-11-13:07:00`
    ])
  })

  test('a missed 07:00 batch catches up later that day, and a day with no listed night still has its run', async () => {
    const p = await crowdProject()
    await outlook(forecastDouble().forecast, myt('2026-11-14T15:30:00'))
    expect(await runsOf(p.id)).toMatchObject([
      { dedupeKey: `schedule:${p.id}:crowd:2026-11-14:07:00`, triggeredAt: myt('2026-11-14T07:00:00'), nightIds: [] }
    ])
  })

  test('once today’s outlook is in a run, its own or coalesced into a queued one, later batches don’t read nights', async () => {
    const p = await crowdProject()
    const queued = await inOrg((tx) => makeRun(tx, { projectId: p.id, pack: 'crowd' }))
    const { forecast, asked, listed } = forecastDouble()
    const n = await inOrg((tx) => makeNight(tx, { projectId: p.id, date: '2026-11-16' }))
    listed.set(p.id, [n])
    await outlook(forecast, myt('2026-11-16T07:00:00'))
    await outlook(forecast, myt('2026-11-16T07:15:00'))
    expect(asked.filter((q) => q.projectId === p.id)).toHaveLength(1)
    expect(await runsOf(p.id)).toMatchObject([
      { id: queued.id, nightIds: [n.id], coalescedKeys: [`schedule:${p.id}:crowd:2026-11-16:07:00`] }
    ])
  })

  test('a ForecastSource failure requests nothing and logs it; the next batch retries', async () => {
    const p = await crowdProject()
    const errors = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failing: ListedNights = {
      nights: async () => {
        throw new Error('forecast unreadable')
      }
    }
    await outlook(failing, myt('2026-11-17T07:00:00'))
    expect(await runsOf(p.id)).toEqual([])
    expect(errors).toHaveBeenCalledWith(
      'ForecastSource failed; no Crowd outlook this batch',
      expect.objectContaining({ project_id: p.id, error: 'Error: forecast unreadable' })
    )
    await outlook(forecastDouble().forecast, myt('2026-11-17T07:15:00'))
    expect(await runsOf(p.id)).toMatchObject([{ dedupeKey: `schedule:${p.id}:crowd:2026-11-17:07:00` }])
  })

  test('the registry’s outlook has no ForecastSource yet: it requests nothing and logs once a batch, naming #127', async () => {
    const [p, q] = [await crowdProject(), await crowdProject()]
    const errors = vi.spyOn(log, 'error').mockImplementation(() => {})
    await shareSystemConnection(() => registry.batch['crowd-outlook']!(myt('2026-11-18T07:00:00')))
    expect(await runsOf(p.id)).toEqual([])
    expect(await runsOf(q.id)).toEqual([])
    expect(errors).toHaveBeenCalledOnce()
    expect(errors).toHaveBeenCalledWith(
      'no ForecastSource: #127 has not set one; no Crowd outlook this batch',
      expect.objectContaining({ project_ids: expect.arrayContaining([p.id, q.id]) })
    )
  })

  test('a project suspended while its nights are read is refused, and the next project still gets its run', async () => {
    const lateOrg = (await makeOrganization()).id
    await inOrg((tx) => makeFeatureFlag(tx, { key: 'pack_crowd', enabled: true }), lateOrg)
    const refused = await crowdProject({ org: lateOrg })
    const next = await crowdProject()
    expect(refused.id < next.id).toBe(true) // the batch works through projects in ID order
    const { forecast } = forecastDouble()
    const suspending: ListedNights = {
      nights: async (tx, q) => {
        if (q.projectId === refused.id) {
          await authDatabase()
            .update(organization)
            .set({ deletionRequestedAt: new Date() })
            .where(eq(organization.id, lateOrg))
        }
        return forecast.nights(tx, q)
      }
    }
    await outlook(suspending, myt('2026-11-19T07:00:00'))
    expect(await runsOf(refused.id, lateOrg)).toEqual([])
    expect(await runsOf(next.id)).toMatchObject([{ dedupeKey: `schedule:${next.id}:crowd:2026-11-19:07:00` }])
  })

  test('no run with pack_crowd off, the pack disabled, or the project archived or suspended', async () => {
    const offOrg = (await makeOrganization()).id
    await inOrg((tx) => makeFeatureFlag(tx, { key: 'pack_crowd', enabled: false }), offOrg)
    const suspendedOrg = (await makeOrganization({ deletionRequestedAt: new Date('2026-11-10T00:00:00Z') })).id
    await inOrg((tx) => makeFeatureFlag(tx, { key: 'pack_crowd', enabled: true }), suspendedOrg)
    const flagOff = await crowdProject({ org: offOrg })
    const suspended = await crowdProject({ org: suspendedOrg })
    const disabled = await crowdProject({ enabled: false })
    const archived = await crowdProject({ archivedAt: new Date('2026-11-01T00:00:00Z') })
    const fine = await crowdProject()
    const { forecast, asked } = forecastDouble()
    await outlook(forecast, myt('2026-11-15T07:00:00'))
    expect(await runsOf(flagOff.id, offOrg)).toEqual([])
    expect(await runsOf(suspended.id, suspendedOrg)).toEqual([])
    expect(await runsOf(disabled.id)).toEqual([])
    expect(await runsOf(archived.id)).toEqual([])
    expect(await runsOf(fine.id)).toHaveLength(1)
    // None of them reads its nights either.
    const skipped = [flagOff.id, suspended.id, disabled.id, archived.id]
    expect(asked.filter((q) => skipped.includes(q.projectId))).toEqual([])
  })
})
