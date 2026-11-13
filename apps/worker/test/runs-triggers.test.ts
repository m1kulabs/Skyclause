// #151: what starts a run (D14, PRJ-8): the `crossing.detected` and `window.*` consumers on the #79 §7 test database,
// through the worker registry's `domain-events` dispatch.
import {
  createBundle,
  emitEvent,
  icsFeed,
  organization,
  run,
  window,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { callDraft, runOf } from '@skyclause/db/test/bundles/scene'
import {
  makeCrossing,
  makeIcsFeed,
  makeOrganization,
  makeProject,
  makeShadowState,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { runScene, T_EVAL, type RunScene } from '@skyclause/db/test/runs/scene'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { dispatchEvent } from '../src/events'
import { registry } from '../src/registry'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) =>
  withTenant({ orgId: org, principal: systemPrincipal('test') }, fn)
const runsOf = (projectId: string, org = orgId) =>
  inOrg((tx) => tx.select().from(run).where(eq(run.projectId, projectId)), org)

/** Emits a crossing on `scope` to `to` and dispatches it; returns the crossing's ID. */
async function cross(
  s: { projectId: string; snapshotId: string },
  scope: { kind: 'site' | 'window' | 'night'; id: string | null },
  to: string | null,
  o: { org?: string; verdictHash?: string } = {}
) {
  const { eventId, crossingId } = await inOrg(async (tx) => {
    const row = await makeCrossing(tx, {
      snapshotId: s.snapshotId,
      scopeKind: scope.kind,
      scopeId: scope.id,
      from: 'normal',
      to,
      at: new Date(T_EVAL),
      ...(o.verdictHash ? { verdictHash: o.verdictHash } : {})
    })
    const { id } = await emitEvent(tx, {
      projectId: s.projectId,
      type: 'crossing.detected',
      data: {
        crossing_id: row.id,
        pack: 'sky',
        scope,
        from: 'normal',
        to: to as 'commute_disruption' | null,
        at: T_EVAL,
        snapshot_id: s.snapshotId,
        verdict_hash: row.verdictHash
      }
    })
    return { eventId: id, crossingId: row.id }
  }, o.org)
  await dispatchEvent(registry.events, eventId)
  return crossingId
}

describe('crossing.detected (TRD start rule)', () => {
  let s: RunScene
  beforeAll(async () => {
    s = await inOrg((tx) => runScene(tx))
  })

  test('a window verdict above Normal starts a crossing run for that window', async () => {
    const scene = await inOrg((tx) => runScene(tx))
    const id = await cross(scene, { kind: 'window', id: scene.windowId }, 'commute_disruption')
    expect(await runsOf(scene.projectId)).toMatchObject([
      {
        trigger: 'crossing',
        triggerRef: id,
        dedupeKey: `crossing:${id}`,
        windowIds: [scene.windowId],
        pack: 'sky',
        status: 'queued',
        triggeredAt: new Date(T_EVAL)
      }
    ])
  })

  test('a site-level change starts a run, even back to Normal', async () => {
    const scene = await inOrg((tx) => runScene(tx))
    await cross(scene, { kind: 'site', id: null }, 'normal')
    expect(await runsOf(scene.projectId)).toMatchObject([{ trigger: 'crossing', windowIds: [] }])
  })

  test('No call starts a run inside an open span, not after the span completes', async () => {
    const open = await inOrg((tx) => runScene(tx))
    const done = await inOrg((tx) => runScene(tx))
    for (const [scene, complete] of [
      [open, false],
      [done, true]
    ] as const) {
      const verdictHash = `no-call-${scene.windowId}`
      await inOrg((tx) =>
        makeShadowState(tx, {
          projectId: scene.projectId,
          scopeKind: 'window',
          scopeId: scene.windowId,
          sheetVersionId: scene.sheetVersionId,
          verdictHash,
          verdict: {
            mode: null,
            clauses: [{ key: 'storm_confirmed', result: 'blocked', span: { from: T_EVAL, to: T_EVAL, complete } }]
          }
        })
      )
      await cross(scene, { kind: 'window', id: scene.windowId }, null, { verdictHash })
    }
    expect(await runsOf(open.projectId)).toHaveLength(1)
    expect(await runsOf(done.projectId)).toHaveLength(0)
  })

  test('a fall to Normal starts a run only while an unapproved bundle covers the window', async () => {
    const covered = await inOrg(async (tx) => {
      const scene = await runScene(tx)
      const r = await runOf(tx, scene)
      await createBundle(tx, {
        runId: r.id,
        pack: 'sky',
        draftOnly: false,
        calls: [callDraft({ windowId: scene.windowId, mode: 'commute_disruption' })],
        triggeredAt: r.triggeredAt
      })
      return scene
    })
    const bare = await inOrg((tx) => runScene(tx))
    await cross(covered, { kind: 'window', id: covered.windowId }, 'normal')
    await cross(bare, { kind: 'window', id: bare.windowId }, 'normal')
    expect((await runsOf(covered.projectId)).filter((r) => r.status === 'queued')).toHaveLength(1)
    expect(await runsOf(bare.projectId)).toHaveLength(0)
  })

  test('an archived project and a suspended organisation start no run (PRJ-8)', async () => {
    const archived = await inOrg(async (tx) =>
      runScene(tx, { projectId: (await makeProject(tx, { archivedAt: new Date() })).id })
    )
    await cross(archived, { kind: 'window', id: archived.windowId }, 'commute_disruption')
    expect(await runsOf(archived.projectId)).toEqual([])

    const suspendedOrg = (await makeOrganization()).id
    const suspended = await inOrg((tx) => runScene(tx), suspendedOrg)
    await authDatabase()
      .update(organization)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(organization.id, suspendedOrg))
    await cross(suspended, { kind: 'window', id: suspended.windowId }, 'commute_disruption', { org: suspendedOrg })
    expect(await runsOf(suspended.projectId, suspendedOrg)).toEqual([])
  })

  test('a crossing seen twice gives one run', async () => {
    const id = await cross(s, { kind: 'window', id: s.windowId }, 'commute_disruption')
    const again = await inOrg((tx) =>
      emitEvent(tx, {
        projectId: s.projectId,
        type: 'crossing.detected',
        data: {
          crossing_id: id,
          pack: 'sky',
          scope: { kind: 'window', id: s.windowId },
          from: 'normal',
          to: 'commute_disruption',
          at: T_EVAL,
          snapshot_id: s.snapshotId,
          verdict_hash: 'again'
        }
      })
    )
    await dispatchEvent(registry.events, again.id)
    expect(await runsOf(s.projectId)).toHaveLength(1)
  })
})

describe('window.created, .updated and .cancelled', () => {
  async function windowEvent(
    type: 'window.created' | 'window.updated' | 'window.cancelled',
    w: { id: string; projectId: string },
    via: 'form' | 'ics' | 'api' | 'mcp' | 'guest' | 'share',
    timesChanged = false
  ) {
    const { id } = await inOrg((tx) =>
      emitEvent(tx, {
        projectId: w.projectId,
        type,
        data: { window_id: w.id, via, times_changed: timesChanged, series_id: null }
      })
    )
    await dispatchEvent(registry.events, id)
  }
  const project = () => inOrg((tx) => makeProject(tx))

  test('share-link and MCP declarations start a window run; other declarations and guests start none', async () => {
    const p = await project()
    const share = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'share' }))
    const mcp = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'mcp' }))
    const form = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'app' }))
    const guest = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'guest', guest: true }))
    await windowEvent('window.created', share, 'share')
    await windowEvent('window.created', form, 'form')
    await windowEvent('window.created', guest, 'guest')
    const [queued] = await runsOf(p.id)
    expect(queued).toMatchObject({
      trigger: 'window',
      triggerRef: share.id,
      dedupeKey: `window:${share.id}:${share.updatedAt.toISOString().replace('.000Z', 'Z')}`,
      windowIds: [share.id]
    })
    // The second declaration coalesces into the one queued run.
    await windowEvent('window.created', mcp, 'mcp')
    const rows = await runsOf(p.id)
    expect(rows).toHaveLength(1)
    expect([...rows[0]!.windowIds].sort()).toEqual([share.id, mcp.id].sort())
  })

  test('a time edit starts a run; an edit that keeps the times starts none', async () => {
    const [moved, renamed] = [await project(), await project()]
    const a = await inOrg((tx) => makeWindow(tx, { projectId: moved.id }))
    const b = await inOrg((tx) => makeWindow(tx, { projectId: renamed.id }))
    await windowEvent('window.updated', a, 'form', true)
    await windowEvent('window.updated', b, 'form', false)
    expect(await runsOf(moved.id)).toMatchObject([{ trigger: 'window', windowIds: [a.id] }])
    expect(await runsOf(renamed.id)).toEqual([])
  })

  test('calendar peers wait for the representative and its immutable complete set', async () => {
    const p = await project()
    const feed = await inOrg((tx) => makeIcsFeed(tx, { projectId: p.id, etag: '"old"' }))
    const a = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'ics', icsFeedId: feed.id }))
    const b = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'ics', icsFeedId: feed.id }))
    const ids = [a.id, b.id].sort()
    const revision = '018f0000-0000-7000-8000-000000000001'
    const emit = (windowId: string, representative: boolean) =>
      inOrg((tx) =>
        emitEvent(tx, {
          projectId: p.id,
          type: 'window.updated',
          data: {
            window_id: windowId,
            via: 'ics',
            times_changed: true,
            series_id: null,
            calendar: { feed_id: feed.id, revision, ...(representative ? { window_ids: ids } : {}) }
          }
        })
      )
    const peer = await emit(ids[1]!, false)
    const representative = await emit(ids[0]!, true)
    await dispatchEvent(registry.events, peer.id)
    expect(await runsOf(p.id)).toEqual([])
    await inOrg((tx) => tx.update(icsFeed).set({ etag: '"new"' }).where(eq(icsFeed.id, feed.id)))
    await dispatchEvent(registry.events, representative.id)
    await dispatchEvent(registry.events, representative.id)
    expect(await runsOf(p.id)).toMatchObject([
      { trigger: 'calendar', triggerRef: feed.id, dedupeKey: `calendar:${feed.id}:${revision}`, windowIds: ids }
    ])
  })

  test('representative survives deletion and produces a complete run before peers arrive', async () => {
    const p = await project()
    const feed = await inOrg((tx) => makeIcsFeed(tx, { projectId: p.id }))
    const first = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'ics', icsFeedId: feed.id }))
    const second = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'ics', icsFeedId: feed.id }))
    const ids = [first.id, second.id].sort()
    const revision = '018f0000-0000-7000-8000-000000000002'
    const emit = (windowId: string, representative: boolean) =>
      inOrg((tx) =>
        emitEvent(tx, {
          projectId: p.id,
          type: 'window.cancelled',
          data: {
            window_id: windowId,
            via: 'ics',
            times_changed: false,
            series_id: null,
            calendar: { feed_id: feed.id, revision, ...(representative ? { window_ids: ids } : {}) }
          }
        })
      )
    const rep = await emit(ids[0]!, true)
    const peer = await emit(ids[1]!, false)
    await inOrg((tx) => tx.delete(window).where(eq(window.id, ids[0]!)))
    await dispatchEvent(registry.events, rep.id)
    const [queued] = await runsOf(p.id)
    expect(queued!.windowIds).toEqual(ids)
    await inOrg((tx) => tx.update(run).set({ status: 'running' }).where(eq(run.id, queued!.id)))
    const duplicate = await emit(ids[0]!, true)
    await dispatchEvent(registry.events, peer.id)
    await dispatchEvent(registry.events, duplicate.id)
    const rows = await runsOf(p.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.windowIds).toEqual(ids)
  })

  test('a representative forwards the full maximum calendar set into the first run', async () => {
    const p = await project()
    const feed = await inOrg((tx) => makeIcsFeed(tx, { projectId: p.id }))
    const ids = Array.from({ length: 20_000 }, (_, i) => `018f0000-0000-7000-8000-${i.toString(16).padStart(12, '0')}`)
    const revision = '018f0000-0000-7000-8000-000000000003'
    const event = await inOrg((tx) =>
      emitEvent(tx, {
        projectId: p.id,
        type: 'window.updated',
        data: {
          window_id: ids[0]!,
          via: 'ics',
          times_changed: true,
          series_id: null,
          calendar: { feed_id: feed.id, revision, window_ids: ids }
        }
      })
    )
    await dispatchEvent(registry.events, event.id)
    const [queued] = await runsOf(p.id)
    expect(queued!.windowIds).toEqual(ids)
    expect(queued!.dedupeKey).toBe(`calendar:${feed.id}:${revision}`)
  })

  test('a manual imported time edit starts an ordinary window run', async () => {
    const p = await project()
    const feed = await inOrg((tx) => makeIcsFeed(tx, { projectId: p.id }))
    const w = await inOrg((tx) => makeWindow(tx, { projectId: p.id, via: 'ics', icsFeedId: feed.id }))
    await windowEvent('window.updated', w, 'ics', true)
    expect(await runsOf(p.id)).toMatchObject([{ trigger: 'window', triggerRef: w.id, windowIds: [w.id] }])
  })
})
