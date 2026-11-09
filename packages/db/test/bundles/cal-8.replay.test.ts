// CAL-8 (replay): "a 2 November bundle drafted at 15:10 for windows ending 15:30 and 15:45, approved at 15:35, sends
// only the 15:45 call and records the 15:30 one as expired." Labelled replay of JPS station 75's capture
// (test/fixtures/fixtures.json) with Storm confirmed fired and an injected clock; the clause engine (#131) isn't built,
// so the fired clause is given, and its input is the capture's 60-minute total. Every time below is MYT (UTC+8).
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { approveGuard, createBundle, expireCall, markSending, transition } from '../../src/bundles/repository'
import { systemPrincipal, withTenant, type Tx } from '../../src/client'
import { call } from '../../src/schema'
import { makeOrganization } from '../factories/index'
import { bundleScene, callDraft, ledgerOf, runOf, windowOf } from './scene'

const capture: { stationId: string; data: Array<{ timestamp: string; rf: number }> } = JSON.parse(
  readFileSync(new URL('../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
)
const myt = (local: string) => new Date(`2026-11-02T${local}:00+08:00`)

// D12: a JPS value at T covers (T−5 min, T], so the 15:00 total sums the readings after 14:00 up to 15:00.
const rain60 = capture.data
  .filter(({ timestamp }) => timestamp > '2026-11-02T14:00:00' && timestamp <= '2026-11-02T15:00:00')
  .reduce((sum, { rf }) => sum + rf, 0)

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('replay') }, fn)

test('replay: the 15:30 call expires unsent and only the 15:45 call reaches sending', async () => {
  expect(rain60).toBe(39)
  const gauge = {
    name: 'site.rain_60m_mm',
    value: rain60,
    unit: 'mm',
    state: 'fresh',
    since: null,
    age_s: 600,
    source_ids: [capture.stationId],
    source_url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
    reading_ids: [],
    observed_at: myt('15:00').toISOString()
  }
  const { scene, early, late } = await inOrg(async (tx) => {
    const scene = await bundleScene(tx, { slaS: 600 })
    return {
      scene,
      early: (await windowOf(tx, scene, myt('15:15'), myt('15:30'), 'Replay · first release wave')).id,
      late: (await windowOf(tx, scene, myt('15:30'), myt('15:45'), 'Replay · second release wave')).id
    }
  })
  const stormConfirmed = (windowId: string) =>
    callDraft({
      windowId,
      mode: 'commute_disruption',
      fired: [{ clause: 'storm_confirmed', inputs: [gauge.name] }],
      shadow: {
        scope: { kind: 'window', id: windowId },
        pack: 'sky',
        mode: 'commute_disruption',
        watch: false,
        no_call: null,
        recommendations: [],
        clauses: [{ key: 'storm_confirmed', result: 'fired', blocked_by: [], inputs: [gauge] }],
        open_from: null
      }
    })

  // 15:05: the crossing at the 15:05 poll; 15:10: the bundle is drafted.
  const drafted = await inOrg(async (tx) => {
    const r = await runOf(tx, scene, myt('15:05'))
    return createBundle(tx, {
      runId: r.id,
      pack: 'sky',
      draftOnly: false,
      calls: [stormConfirmed(early), stormConfirmed(late)],
      triggeredAt: r.triggeredAt,
      now: myt('15:10')
    })
  })
  expect(drafted.state).toBe('needs_review')
  const [first, second] = drafted.callIds as [string, string]

  // 15:30: the first call's expiry-{call_id} task runs (Storm confirmed expires at the window's end).
  expect((await inOrg((tx) => expireCall(tx, first, myt('15:30')))).outcome).toBe('expired')

  // 15:35: the approver approves both; the guard refuses the expired one, so only the 15:45 call is approved and sent.
  const approvedAt = myt('15:35')
  expect(await inOrg((tx) => approveGuard(tx, drafted.bundleId, [first, second], approvedAt))).toEqual({
    ok: false,
    problem: 'call-expired',
    callIds: [first]
  })
  await inOrg(async (tx) => {
    expect(await approveGuard(tx, drafted.bundleId, [second], approvedAt)).toEqual({ ok: true })
    await transition(tx, drafted.bundleId, { bundle: 'approved', calls: { [second]: 'approved' } }, approvedAt)
    await markSending(tx, drafted.bundleId, [second], approvedAt)
  })

  const calls = await inOrg((tx) => tx.select().from(call).where(eq(call.bundleId, drafted.bundleId)))
  const byWindow = Object.fromEntries(calls.map((c) => [c.windowId, c]))
  expect(byWindow[early]).toMatchObject({ state: 'expired', expiresAt: myt('15:30'), approvedAt: null, sentAt: null })
  expect(byWindow[late]).toMatchObject({ state: 'sending', expiresAt: myt('15:45'), approvedAt })
  expect((await ledgerOf(scene.projectId)).map((entry) => [entry.kind, entry.refs.call_id])).toEqual([
    ['call_expired', first]
  ])
})
