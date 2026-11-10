// #151: SIG-12's 5-minute case, `crossing_without_bundle`, through a `registerAuditCheck` double (#132) that notifies
// once per opened key and once per recovery, on an injected clock.
import type { RegisterAuditCheck } from '@skyclause/contracts'
import { createBundle, requestRun, run, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { callDraft } from '@skyclause/db/test/bundles/scene'
import { makeCrossing, makeMember, makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { runScene, T_EVAL, type RunScene } from '@skyclause/db/test/runs/scene'
import { eq } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { crossingWithoutBundle } from '../src/runs'

let orgId: string
let adminIds: string[]
beforeAll(async () => {
  orgId = (await makeOrganization()).id
  const owner = await makeMember({ organizationId: orgId, role: 'owner' })
  const admin = await makeMember({ organizationId: orgId, role: 'admin' })
  await makeMember({ organizationId: orgId, role: 'approver' })
  adminIds = [owner.userId, admin.userId].sort()
})
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const after = (minutes: number) => new Date(Date.parse(T_EVAL) + minutes * 60_000).toISOString()

/** The auditor (#132) as a double: runs each registered check per tick, notifying on open and on recovery. */
function auditor() {
  const checks: Array<Parameters<RegisterAuditCheck>[0]> = []
  const register: RegisterAuditCheck = (check) => void checks.push(check)
  register(crossingWithoutBundle)
  const open = new Set<string>()
  const notified: string[] = []
  const tick = async (now: string) => {
    const found = await inOrg((tx) => checks[0]!.run(tx, now))
    const keys = new Set(found.map((f) => f.key))
    for (const key of keys) if (!open.has(key)) notified.push(`opened ${key}`)
    for (const key of open) if (!keys.has(key)) notified.push(`recovered ${key}`)
    open.clear()
    for (const key of keys) open.add(key)
    return found
  }
  return { tick, notified }
}

const crossingOn = (s: RunScene, to: string | null, projectId = s.projectId) =>
  inOrg((tx) =>
    makeCrossing(tx, {
      snapshotId: s.snapshotId,
      projectId,
      scopeKind: 'window',
      scopeId: s.windowId,
      from: 'normal',
      to,
      at: new Date(T_EVAL)
    })
  )

test('a crossing that met the start rule with no bundle after 5 minutes is one finding, cleared by its bundle', async () => {
  const s = await inOrg((tx) => runScene(tx))
  const c = await crossingOn(s, 'commute_disruption')
  const quiet = await crossingOn(await inOrg((tx) => runScene(tx)), 'normal') // recorded only: no run, no finding
  const key = `crossing:${c.id}`
  const a = auditor()

  expect(await a.tick(after(4))).toEqual([])
  const found = await a.tick(after(6))
  expect(found).toEqual([{ key, projectId: s.projectId, accountIds: adminIds, ref: { type: 'crossing', id: c.id } }])
  expect(await a.tick(after(20))).toEqual(found)

  // The held-back run arrives and drafts its bundle.
  await inOrg(async (tx) => {
    const { runId } = await requestRun(tx, {
      projectId: s.projectId,
      pack: 'sky',
      trigger: 'crossing',
      triggerRef: c.id,
      windowIds: [s.windowId],
      dedupeKey: key,
      triggeredAt: T_EVAL
    })
    await tx.update(run).set({ status: 'running', sheetVersionId: s.sheetVersionId }).where(eq(run.id, runId))
    await createBundle(tx, {
      runId,
      pack: 'sky',
      draftOnly: false,
      calls: [callDraft({ windowId: s.windowId, mode: 'commute_disruption' })],
      triggeredAt: new Date(T_EVAL)
    })
  })
  expect(await a.tick(after(21))).toEqual([])
  expect(a.notified).toEqual([`opened ${key}`, `recovered ${key}`])
  expect(a.notified.join()).not.toContain(quiet.id)
})

test('an archived project’s crossing raises no finding (PRJ-8)', async () => {
  const s = await inOrg(async (tx) =>
    runScene(tx, { projectId: (await makeProject(tx, { archivedAt: new Date() })).id })
  )
  const c = await crossingOn(s, 'commute_disruption')
  const found = await auditor().tick(after(6))
  expect(found.map((f) => f.key)).not.toContain(`crossing:${c.id}`)
})
