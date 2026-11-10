// #151, D45: the run orchestrator's 15-minute batch handlers, on a fake clock: the Sky schedule (CAL-1) and the
// republish of runs left queued, each run on one shared system connection as the batch route runs them.
import { randomUUID } from 'node:crypto'
import { run, setRunPublisher, shareSystemConnection, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectPack, makeRun } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { registry } from '../src/registry'
import { parseSchedule } from '../src/runs'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
afterEach(() => setRunPublisher(null))
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const runsOf = (projectId: string) => inOrg((tx) => tx.select().from(run).where(eq(run.projectId, projectId)))
const myt = (local: string) => new Date(`${local}+08:00`)
const batch = (name: string, now: Date) => shareSystemConnection(() => registry.batch[name]!(now))

/** A project with its Sky pack enabled under `schedule` (unset: the default). */
async function skyProject(o: { schedule?: string; enabled?: boolean; archivedAt?: Date } = {}) {
  return inOrg(async (tx) => {
    const p = await makeProject(tx, o.archivedAt ? { archivedAt: o.archivedAt } : {})
    await makeProjectPack(tx, {
      projectId: p.id,
      pack: 'sky',
      enabled: o.enabled ?? true,
      ...(o.schedule ? { schedule: o.schedule } : {})
    })
    return p
  })
}

describe('runs-sky-schedule', () => {
  test('the default schedule: one run at the first batch at or after 06:45 MYT, Monday to Friday', async () => {
    const p = await skyProject()
    await batch('runs-sky-schedule', myt('2026-11-02T06:30:00')) // Monday, before the slot
    expect(await runsOf(p.id)).toEqual([])
    await batch('runs-sky-schedule', myt('2026-11-02T06:45:00'))
    await batch('runs-sky-schedule', myt('2026-11-02T07:00:00'))
    await batch('runs-sky-schedule', myt('2026-11-07T06:45:00')) // Saturday
    await batch('runs-sky-schedule', myt('2026-11-08T09:00:00')) // Sunday
    expect(await runsOf(p.id)).toMatchObject([
      {
        trigger: 'schedule',
        triggerRef: '06:45',
        pack: 'sky',
        dedupeKey: `schedule:${p.id}:sky:2026-11-02:06:45`,
        triggeredAt: myt('2026-11-02T06:45:00'),
        windowIds: []
      }
    ])
  })

  test('a missed 06:45 batch catches up later that day', async () => {
    const p = await skyProject()
    await batch('runs-sky-schedule', myt('2026-11-03T11:15:00'))
    expect((await runsOf(p.id)).map((r) => r.dedupeKey)).toEqual([`schedule:${p.id}:sky:2026-11-03:06:45`])
  })

  test('a project’s own schedule replaces the default', async () => {
    const p = await skyProject({ schedule: '30 7,12 * * 1,3' })
    await batch('runs-sky-schedule', myt('2026-11-02T06:45:00'))
    expect(await runsOf(p.id)).toEqual([])
    await batch('runs-sky-schedule', myt('2026-11-02T07:30:00'))
    // The 07:30 run has run by 12:30; were it still queued, the 12:30 slot would coalesce into it.
    await inOrg((tx) => tx.update(run).set({ status: 'drafted' }).where(eq(run.projectId, p.id)))
    await batch('runs-sky-schedule', myt('2026-11-02T12:30:00'))
    await batch('runs-sky-schedule', myt('2026-11-03T12:30:00')) // Tuesday is not in the schedule
    expect((await runsOf(p.id)).map((r) => r.triggerRef).sort()).toEqual(['07:30', '12:30'])
  })

  test('no run for a disabled pack, an archived project or an unreadable schedule', async () => {
    const disabled = await skyProject({ enabled: false })
    const archived = await skyProject({ archivedAt: new Date('2026-11-01T00:00:00Z') })
    const unreadable = await skyProject({ schedule: 'weekday mornings' })
    const fine = await skyProject()
    await batch('runs-sky-schedule', myt('2026-11-02T06:45:00'))
    expect(await runsOf(disabled.id)).toEqual([])
    expect(await runsOf(archived.id)).toEqual([])
    expect(await runsOf(unreadable.id)).toEqual([])
    expect(await runsOf(fine.id)).toHaveLength(1)
  })

  test('parseSchedule reads minute and hour lists and weekday ranges', () => {
    expect(parseSchedule('45 6 * * 1-5')).toEqual({ slots: ['06:45'], weekdays: new Set([1, 2, 3, 4, 5]) })
    expect(parseSchedule('0,30 18 * * 0,6')).toEqual({ slots: ['18:00', '18:30'], weekdays: new Set([7, 6]) })
    for (const bad of ['45 6 * *', '45 24 * * 1', '45 6 1 * 1', '45 6 * * 5-1', '*/15 6 * * 1']) {
      expect(parseSchedule(bad)).toBeNull()
    }
  })
})

describe('runs-republish', () => {
  test('publishes runs queued for over 60 s, not newer or running ones', async () => {
    const now = new Date()
    const published: string[] = []
    setRunPublisher(async ({ run_id, org_id }) => {
      expect(org_id).toBe(orgId)
      published.push(run_id)
    })
    const p = await inOrg((tx) => makeProject(tx))
    const old = await inOrg((tx) =>
      makeRun(tx, {
        projectId: p.id,
        createdAt: new Date(now.getTime() - 120_000),
        dedupeKey: `request:${randomUUID()}`
      })
    )
    const fresh = await inOrg((tx) =>
      makeRun(tx, { projectId: p.id, pack: 'crowd', createdAt: new Date(now.getTime() - 10_000) })
    )
    const running = await inOrg((tx) =>
      makeRun(tx, { projectId: p.id, status: 'running', createdAt: new Date(now.getTime() - 600_000) })
    )
    // Running, with its last step just now.
    await batch('runs-republish', now)
    expect(published).toContain(old.id)
    expect(published).not.toContain(fresh.id)
    expect(published).not.toContain(running.id)
  })

  test('publishes a running run with no step for 10 minutes, so it resumes; not one whose last step is recent', async () => {
    const now = new Date()
    const published: string[] = []
    setRunPublisher(async ({ run_id }) => void published.push(run_id))
    const [p1, p2] = [await inOrg((tx) => makeProject(tx)), await inOrg((tx) => makeProject(tx))]
    const stalled = await inOrg((tx) =>
      makeRun(tx, { projectId: p1.id, status: 'running', updatedAt: new Date(now.getTime() - 11 * 60_000) })
    )
    const walking = await inOrg((tx) =>
      makeRun(tx, { projectId: p2.id, status: 'running', updatedAt: new Date(now.getTime() - 60_000) })
    )
    await batch('runs-republish', now)
    expect(published).toContain(stalled.id)
    expect(published).not.toContain(walking.id)
  })

  test('fails the batch without a publisher (D9)', async () => {
    await expect(registry.batch['runs-republish']!(new Date())).rejects.toThrow('no run publisher')
  })
})
