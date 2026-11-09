// #151: requestRun (#79 §1) on the #79 §7 test database: one run per trigger, dedupe keys, coalescing into the one
// queued follow-up, the project gate (PRJ-8, D36) and the `runs-requested` publish after commit.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { authDatabase } from '../../src/auth'
import { systemPrincipal, withTenant, type Tx } from '../../src/client'
import { RunRefused, requestRun, setRunPublisher } from '../../src/runs'
import { organization, run } from '../../src/schema'
import { makeOrganization, makeProject, makeRun } from '../factories/index'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
afterEach(() => setRunPublisher(null))

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) =>
  withTenant({ orgId: org, principal: systemPrincipal('test') }, fn)
const AT = '2026-11-02T07:05:00Z'

const crossing = (projectId: string, windowIds: string[] = [], id = randomUUID()) => ({
  projectId,
  pack: 'sky' as const,
  trigger: 'crossing' as const,
  triggerRef: id,
  windowIds,
  dedupeKey: `crossing:${id}`,
  triggeredAt: AT
})

const runsOf = (projectId: string) =>
  inOrg((tx) => tx.select().from(run).where(eq(run.projectId, projectId)).orderBy(run.id))

describe('requestRun', () => {
  test('a trigger gives one queued run naming its trigger, project and pack, published after commit', async () => {
    const published: unknown[] = []
    setRunPublisher(async (m) => void published.push(m))
    const project = await inOrg((tx) => makeProject(tx))
    const r = crossing(project.id)

    const result = await inOrg(async (tx) => {
      const made = await requestRun(tx, r)
      expect(published).toEqual([])
      return made
    })

    const [row] = await runsOf(project.id)
    expect(result).toEqual({ runId: row!.id })
    expect(row).toMatchObject({
      status: 'queued',
      trigger: 'crossing',
      triggerRef: r.triggerRef,
      projectId: project.id,
      pack: 'sky',
      dedupeKey: r.dedupeKey,
      triggeredAt: new Date(AT)
    })
    expect(published).toEqual([{ run_id: row!.id, org_id: orgId }])
  })

  test('a rolled-back request publishes nothing', async () => {
    const published: unknown[] = []
    setRunPublisher(async (m) => void published.push(m))
    const project = await inOrg((tx) => makeProject(tx))
    await expect(
      inOrg(async (tx) => {
        await requestRun(tx, crossing(project.id))
        throw new Error('rolled back')
      })
    ).rejects.toThrow('rolled back')
    expect(published).toEqual([])
    expect(await runsOf(project.id)).toEqual([])
  })

  test('a repeated dedupe key returns the same run', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const r = crossing(project.id)
    const first = await inOrg((tx) => requestRun(tx, r))
    const again = await inOrg((tx) => requestRun(tx, r))
    expect(again).toEqual(first)
    expect(await runsOf(project.id)).toHaveLength(1)
  })

  test('three crossings during a running run leave one queued follow-up with merged window_ids', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const running = await inOrg((tx) => makeRun(tx, { projectId: project.id, status: 'running' }))
    const [w1, w2, w3] = [randomUUID(), randomUUID(), randomUUID()]
    const second = crossing(project.id, [w1, w2])

    const a = await inOrg((tx) => requestRun(tx, crossing(project.id, [w1])))
    const b = await inOrg((tx) => requestRun(tx, second))
    const c = await inOrg((tx) => requestRun(tx, crossing(project.id, [w3])))

    const queued = (await runsOf(project.id)).filter((row) => row.id !== running.id)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ status: 'queued', trigger: 'crossing' })
    expect([...queued[0]!.windowIds].sort()).toEqual([w1, w2, w3].sort())
    expect(a).toEqual({ runId: queued[0]!.id })
    expect(b).toEqual({ runId: queued[0]!.id, coalescedInto: queued[0]!.id })
    expect(c).toEqual({ runId: queued[0]!.id, coalescedInto: queued[0]!.id })
    // A coalesced key, repeated after its run has started, still names that run.
    await inOrg((tx) => tx.update(run).set({ status: 'failed' }).where(eq(run.id, running.id)))
    await inOrg((tx) => tx.update(run).set({ status: 'running' }).where(eq(run.id, queued[0]!.id)))
    expect(await inOrg((tx) => requestRun(tx, second))).toEqual(b)
    expect(await runsOf(project.id)).toHaveLength(2)
  })

  test('Crowd nights are kept and merged like windows', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const [n1, n2] = [randomUUID(), randomUUID()]
    const crowd = (nightIds: string[]) => ({
      projectId: project.id,
      pack: 'crowd' as const,
      trigger: 'schedule' as const,
      nightIds,
      dedupeKey: `schedule:${project.id}:crowd:${randomUUID()}`,
      triggeredAt: AT
    })
    await inOrg((tx) => requestRun(tx, crowd([n1])))
    await inOrg((tx) => requestRun(tx, crowd([n2])))
    const [row] = await runsOf(project.id)
    expect([...row!.nightIds].sort()).toEqual([n1, n2].sort())
  })

  test('concurrent requests for one project and pack leave a single queued run', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const results = await Promise.all(
      Array.from({ length: 10 }, () => inOrg((tx) => requestRun(tx, crossing(project.id, [randomUUID()]))))
    )
    const rows = await runsOf(project.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.windowIds).toHaveLength(10)
    expect(new Set(results.map((r) => r.runId))).toEqual(new Set([rows[0]!.id]))
  })

  test('an archived project and a suspended organisation start nothing (PRJ-8)', async () => {
    const archived = await inOrg((tx) => makeProject(tx, { archivedAt: new Date() }))
    await expect(inOrg((tx) => requestRun(tx, crossing(archived.id)))).rejects.toEqual(new RunRefused('archived'))
    expect(await runsOf(archived.id)).toEqual([])

    const suspendedOrg = (await makeOrganization()).id
    const project = await inOrg((tx) => makeProject(tx), suspendedOrg)
    await authDatabase()
      .update(organization)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(organization.id, suspendedOrg))
    await expect(inOrg((tx) => requestRun(tx, crossing(project.id)), suspendedOrg)).rejects.toEqual(
      new RunRefused('suspended')
    )
    expect(await inOrg((tx) => tx.select().from(run).where(eq(run.projectId, project.id)), suspendedOrg)).toEqual([])
  })
})
