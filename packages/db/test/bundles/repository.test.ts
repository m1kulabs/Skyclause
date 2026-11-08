// #150: createBundle, expireCall, approveGuard, transition, markSending and reviewHash on the #79 §7 test database.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  approveGuard,
  createBundle,
  expireCall,
  markSending,
  reviewHash,
  startOfLocalDay,
  transition
} from '../../src/bundles/repository'
import { systemPrincipal, withTenant, type Tx } from '../../src/client'
import { appendLedger } from '../../src/placeholders/c-ledger-chain'
import { bundle, call } from '../../src/schema'
import { makeNight, makeOrganization } from '../factories/index'
import { asLogin } from '../harness/index'
import { bundleScene, callDraft, runOf, windowOf, type Scene } from './scene'

// c-ledger-chain (#146) is not built: a double records what expireCall appends.
vi.mock('../../src/placeholders/c-ledger-chain', () => ({
  appendLedger: vi.fn(async () => ({ id: crypto.randomUUID(), seq: 1, hash: 'double' }))
}))

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
beforeEach(() => vi.mocked(appendLedger).mockClear())

const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const at = (iso: string) => new Date(iso)
const DRAFTED = at('2026-11-02T07:10:00Z')

async function eventsOf(projectId: string) {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ type: string; data: Record<string, unknown> }>(
      'SELECT type, data FROM domain_event WHERE project_id = $1 ORDER BY seq',
      [projectId]
    )
    return rows
  })
}

async function analyticsOf(projectId: string) {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ name: string; props: Record<string, unknown> }>(
      'SELECT name, props FROM analytics_event WHERE project_id = $1 ORDER BY id',
      [projectId]
    )
    return rows
  })
}

const rowOf = (tx: Tx, id: string) =>
  tx
    .select()
    .from(bundle)
    .where(eq(bundle.id, id))
    .then(([row]) => row!)
const callsOf = (tx: Tx, id: string) => tx.select().from(call).where(eq(call.bundleId, id)).orderBy(call.expiresAt)

/** A scene with two commute waves ending 15:30 and 15:45 MYT on 2 November. */
async function twoWindows(tx: Tx, o: Parameters<typeof bundleScene>[1] = {}) {
  const scene = await bundleScene(tx, o)
  const first = await windowOf(tx, scene, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'))
  const second = await windowOf(tx, scene, at('2026-11-02T07:30:00Z'), at('2026-11-02T07:45:00Z'))
  return { scene, first: first.id, second: second.id }
}

async function draft(
  tx: Tx,
  scene: Scene,
  calls: Parameters<typeof callDraft>[0][],
  o: { draftOnly?: boolean; now?: Date } = {}
) {
  const r = await runOf(tx, scene, at('2026-11-02T07:05:00Z'))
  return createBundle(tx, {
    runId: r.id,
    pack: scene.pack,
    draftOnly: o.draftOnly ?? false,
    calls: calls.map(callDraft),
    triggeredAt: r.triggeredAt,
    now: o.now ?? DRAFTED
  })
}

const storm = {
  mode: 'commute_disruption' as const,
  fired: [{ clause: 'storm_confirmed', inputs: ['site.rain_60m_mm'] }]
}

describe('createBundle closes what would send nothing (CAL-5, D21, D23)', () => {
  test('an all-Normal bundle closes with no SLA, no needs_review event and no ledger entry', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first }, { windowId: second }]))
    expect(made.state).toBe('closed')
    const row = await inOrg((tx) => rowOf(tx, made.bundleId))
    expect(row).toMatchObject({ state: 'closed', slaDueAt: null, needsReviewAt: null, draftOnly: false })
    expect((await eventsOf(scene.projectId)).map((e) => e.type)).toEqual(['bundle.drafted'])
    expect(appendLedger).not.toHaveBeenCalled()
    expect(await analyticsOf(scene.projectId)).toEqual([
      { name: 'bundle_drafted', props: { pack: 'sky', calls: 2, non_normal: 0, disagreements: 0, no_call: false } }
    ])
  })

  test('a Watch-only bundle closes the same way', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) =>
      draft(tx, scene, [{ windowId: first, watch: true, fired: [{ clause: 'storm_watch', inputs: [] }] }])
    )
    expect(made.state).toBe('closed')
    expect((await eventsOf(scene.projectId)).map((e) => e.type)).toEqual(['bundle.drafted'])
  })

  test('a guest-window bundle closes draft-only whatever it proposes', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }], { draftOnly: true }))
    const row = await inOrg((tx) => rowOf(tx, made.bundleId))
    expect(row).toMatchObject({ state: 'closed', draftOnly: true, slaDueAt: null })
    expect((await eventsOf(scene.projectId)).map((e) => e.type)).toEqual(['bundle.drafted'])
  })
})

describe('createBundle waits in Needs review when a call would send', () => {
  test('needs_review_at is now and sla_due_at adds the pack’s sla_s as read at drafting (PRJ-7)', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx, { slaS: 300 }))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    const row = await inOrg((tx) => rowOf(tx, made.bundleId))
    expect(row).toMatchObject({
      state: 'needs_review',
      needsReviewAt: DRAFTED,
      slaDueAt: at('2026-11-02T07:15:00Z')
    })
    const events = await eventsOf(scene.projectId)
    expect(events.map((e) => [e.type, e.data.state, e.data.sla_due_at])).toEqual([
      ['bundle.drafted', 'drafted', '2026-11-02T07:15:00.000Z'],
      ['bundle.needs_review', 'needs_review', '2026-11-02T07:15:00.000Z']
    ])
    expect(events[0]!.data.call_ids).toEqual(made.callIds)
  })

  test('an unset sla_s takes PRJ-7’s default, 10 minutes for Sky', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx, { slaS: null }))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    expect(made.slaDueAt).toEqual(at('2026-11-02T07:20:00Z'))
  })

  test('a No call needs review too', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first, mode: null, noCall: ['site.rain_60m_mm'] }]))
    expect(made.state).toBe('needs_review')
  })
})

describe('expires_at (CAL-8)', () => {
  test('a window’s start by default, its end when a fired clause expires at the end, a night’s arrival start', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const nightId = await inOrg(
      async (tx) => (await makeNight(tx, { projectId: scene.projectId, arrivalStart: at('2026-11-14T10:00:00Z') })).id
    )
    const made = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, mode: 'outdoor_limited', fired: [{ clause: 'storm_watch', inputs: [] }] },
        { windowId: second, ...storm },
        { nightId, mode: 'surge_night', fired: [{ clause: 'surge_night', inputs: [] }] }
      ])
    )
    const calls = await inOrg((tx) => tx.select().from(call).where(eq(call.bundleId, made.bundleId)))
    const byTarget = Object.fromEntries(calls.map((c) => [c.windowId ?? c.nightId, c.expiresAt]))
    expect(byTarget).toEqual({
      [first]: at('2026-11-02T07:15:00Z'),
      [second]: at('2026-11-02T07:45:00Z'),
      [nightId]: at('2026-11-14T10:00:00Z')
    })
  })
})

describe('supersession (CAL-7)', () => {
  test('a newer bundle covering every window supersedes the older one, which links to it', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const older = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, ...storm },
        { windowId: second, ...storm }
      ])
    )
    const newer = await inOrg((tx) =>
      draft(
        tx,
        scene,
        [
          { windowId: first, ...storm },
          { windowId: second, ...storm }
        ],
        { now: at('2026-11-02T07:12:00Z') }
      )
    )
    const row = await inOrg((tx) => rowOf(tx, older.bundleId))
    expect(row).toMatchObject({ state: 'superseded', supersededBy: newer.bundleId })
    const calls = await inOrg((tx) => callsOf(tx, older.bundleId))
    expect(calls.map((c) => [c.state, c.supersededByCallId])).toEqual([
      ['superseded', newer.callIds[0]],
      ['superseded', newer.callIds[1]]
    ])
    const guard = await inOrg((tx) => approveGuard(tx, older.bundleId, older.callIds, DRAFTED))
    expect(guard).toEqual({
      ok: false,
      problem: 'bundle-superseded',
      successor: { bundleId: newer.bundleId, callIds: expect.arrayContaining(newer.callIds) }
    })
    expect((await eventsOf(scene.projectId)).filter((e) => e.type === 'bundle.superseded')).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ bundle_id: older.bundleId, state: 'superseded' }) })
    ])
    expect(await analyticsOf(scene.projectId)).toContainEqual({
      name: 'bundle_closed',
      props: { pack: 'sky', reason: 'superseded' }
    })
  })

  test('a partly superseded bundle refuses only the covered call; its other call stays approvable', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const older = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, ...storm },
        { windowId: second, ...storm }
      ])
    )
    const newer = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    const [covered, other] = await inOrg((tx) => callsOf(tx, older.bundleId))
    expect(await inOrg((tx) => rowOf(tx, older.bundleId))).toMatchObject({ state: 'needs_review', supersededBy: null })
    expect(await inOrg((tx) => approveGuard(tx, older.bundleId, [covered!.id, other!.id], DRAFTED))).toEqual({
      ok: false,
      problem: 'bundle-superseded',
      successor: { bundleId: newer.bundleId, callIds: newer.callIds }
    })
    expect(await inOrg((tx) => approveGuard(tx, older.bundleId, [other!.id], DRAFTED))).toEqual({ ok: true })
  })

  test('another pack’s bundle, and a bundle no longer under review, are left alone', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const older = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    await inOrg((tx) =>
      transition(tx, older.bundleId, { bundle: 'approved', calls: { [older.callIds[0]!]: 'approved' } }, DRAFTED)
    )
    await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    expect(await inOrg((tx) => rowOf(tx, older.bundleId))).toMatchObject({ state: 'approved' })
  })
})

describe('expireCall (the expiry-{call_id} task)', () => {
  test('expires a due open call once, with one call_expired entry; a replay is a no-op', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, ...storm },
        { windowId: second, ...storm }
      ])
    )
    const [early] = await inOrg((tx) => callsOf(tx, made.bundleId))
    expect(await inOrg((tx) => expireCall(tx, early!.id, at('2026-11-02T07:29:00Z')))).toEqual({
      outcome: 'not_due',
      bundleExpired: false
    })
    expect(await inOrg((tx) => expireCall(tx, early!.id, at('2026-11-02T07:30:00Z')))).toEqual({
      outcome: 'expired',
      bundleExpired: false
    })
    expect(await inOrg((tx) => expireCall(tx, early!.id, at('2026-11-02T07:31:00Z')))).toEqual({
      outcome: 'not_open',
      bundleExpired: false
    })
    expect(vi.mocked(appendLedger).mock.calls.map(([, entry]) => entry)).toEqual([
      {
        projectId: scene.projectId,
        kind: 'call_expired',
        refs: { call_id: early!.id, bundle_id: made.bundleId, window_id: first },
        body: { expires_at: '2026-11-02T07:30:00.000Z', mode: 'commute_disruption', watch: false }
      }
    ])
    expect(await inOrg((tx) => rowOf(tx, made.bundleId))).toMatchObject({ state: 'needs_review' })
  })

  test('the last open call takes the bundle with it: bundle.expired and bundle_closed', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, ...storm },
        { windowId: second, ...storm }
      ])
    )
    const [early, late] = await inOrg((tx) => callsOf(tx, made.bundleId))
    await inOrg((tx) => expireCall(tx, early!.id, at('2026-11-02T07:30:00Z')))
    expect(await inOrg((tx) => expireCall(tx, late!.id, at('2026-11-02T07:45:00Z')))).toEqual({
      outcome: 'expired',
      bundleExpired: true
    })
    expect(await inOrg((tx) => rowOf(tx, made.bundleId))).toMatchObject({ state: 'expired' })
    expect((await eventsOf(scene.projectId)).map((e) => e.type)).toEqual([
      'bundle.drafted',
      'bundle.needs_review',
      'bundle.expired'
    ])
    expect(await analyticsOf(scene.projectId)).toContainEqual({
      name: 'bundle_closed',
      props: { pack: 'sky', reason: 'expired' }
    })
  })

  test('a call of a closed bundle never expires, and an unknown call is acknowledged', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first }]))
    expect((await inOrg((tx) => expireCall(tx, made.callIds[0]!, at('2026-11-03T00:00:00Z')))).outcome).toBe('not_open')
    expect((await inOrg((tx) => expireCall(tx, randomUUID()))).outcome).toBe('missing')
    expect(appendLedger).not.toHaveBeenCalled()
  })
})

describe('approveGuard, transition and markSending', () => {
  test('approveGuard refuses an open call past expires_at before its timer runs', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, ...storm },
        { windowId: second, ...storm }
      ])
    )
    const [early, late] = await inOrg((tx) => callsOf(tx, made.bundleId))
    expect(
      await inOrg((tx) => approveGuard(tx, made.bundleId, [early!.id, late!.id], at('2026-11-02T07:35:00Z')))
    ).toEqual({
      ok: false,
      problem: 'call-expired',
      callIds: [early!.id]
    })
  })

  test('markSending sends approved and edited calls and refuses an expired one', async () => {
    const { scene, first, second } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) =>
      draft(tx, scene, [
        { windowId: first, ...storm },
        { windowId: second, ...storm }
      ])
    )
    const [early, late] = await inOrg((tx) => callsOf(tx, made.bundleId))
    await inOrg((tx) => expireCall(tx, early!.id, at('2026-11-02T07:30:00Z')))
    await expect(inOrg((tx) => transition(tx, made.bundleId, { calls: { [early!.id]: 'approved' } }))).rejects.toThrow(
      /expired to approved/
    )
    const approver = randomUUID()
    await inOrg((tx) =>
      transition(
        tx,
        made.bundleId,
        { bundle: 'approved', calls: { [late!.id]: 'edited' }, approvedBy: approver },
        at('2026-11-02T07:35:00Z')
      )
    )
    await expect(
      inOrg((tx) => markSending(tx, made.bundleId, [early!.id], at('2026-11-02T07:35:00Z')))
    ).rejects.toThrow(/expired/)
    await inOrg((tx) => markSending(tx, made.bundleId, [late!.id], at('2026-11-02T07:35:00Z')))
    expect(await inOrg((tx) => rowOf(tx, made.bundleId))).toMatchObject({
      state: 'sending',
      approvedBy: approver,
      approvedAt: at('2026-11-02T07:35:00Z')
    })
    expect((await inOrg((tx) => callsOf(tx, made.bundleId))).map((c) => [c.state, c.approvedAt])).toEqual([
      ['expired', null],
      ['sending', at('2026-11-02T07:35:00Z')]
    ])
  })

  test('transition refuses the moves createBundle and expireCall own', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    await expect(inOrg((tx) => transition(tx, made.bundleId, { bundle: 'expired' }))).rejects.toThrow(/on its own/)
    await expect(
      inOrg((tx) => transition(tx, made.bundleId, { calls: { [made.callIds[0]!]: 'superseded' } }))
    ).rejects.toThrow(/on its own/)
  })
})

describe('review_hash', () => {
  test('is the canonical hash of the snapshot, verdict and calls, recomputed on every call change', async () => {
    const { scene, first } = await inOrg((tx) => twoWindows(tx))
    const made = await inOrg((tx) => draft(tx, scene, [{ windowId: first, ...storm }]))
    const drafted = await inOrg((tx) => rowOf(tx, made.bundleId))
    expect(drafted.reviewHash).toMatch(/^[0-9a-f]{64}$/)
    expect(await inOrg((tx) => reviewHash(tx, made.bundleId))).toBe(drafted.reviewHash)
    await inOrg((tx) => transition(tx, made.bundleId, { calls: { [made.callIds[0]!]: 'rejected' } }))
    const after = await inOrg((tx) => rowOf(tx, made.bundleId))
    expect(after.reviewHash).not.toBe(drafted.reviewHash)
    expect(await inOrg((tx) => reviewHash(tx, made.bundleId))).toBe(after.reviewHash)
  })
})

test('startOfLocalDay is the instant local midnight starts a date in the project’s zone', async () => {
  expect(await inOrg((tx) => startOfLocalDay(tx, '2026-11-02', 'Asia/Kuala_Lumpur'))).toEqual(
    at('2026-11-01T16:00:00Z')
  )
})
