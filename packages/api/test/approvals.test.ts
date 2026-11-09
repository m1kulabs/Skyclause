// #153 c-approval-api: `POST /api/bundles/{id}/approve` on the #79 §7 test database, through the mounted app. The
// evaluator (#133) and clause engine (#131) aren't built, so two doubles stand in for #79 §1's ports: the snapshot
// source sums the stored 5-minute readings of the gauge into its 60-minute total (D12), and the evaluator fires Storm
// confirmed at the default sheet's 31 mm. The readings are a labelled replay of JPS station 75's capture
// (test/fixtures/fixtures.json); every time below is MYT (UTC+8) on 2 November 2026.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { canonicalHash, type IndicatorSnapshot, type IndicatorValue, type Verdict } from '@skyclause/clauses'
import type { Principal, ShadowEvaluator, SnapshotSource } from '@skyclause/contracts'
import {
  approval,
  call,
  createBundle,
  notice,
  reading,
  recordAudit,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import { bundleScene, callDraft, ledgerOf, runOf, windowOf, type Scene } from '@skyclause/db/test/bundles/scene'
import {
  makeIndicatorSnapshot,
  makeMember,
  makeOrganization,
  makeProjectChannel,
  makeReading,
  makeSource,
  makeSubscriber,
  makeUser
} from '@skyclause/db/test/factories/index'
import { expectEvent, expectOneAudit } from '@skyclause/db/test/harness/index'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { setRecheckPorts } from '../src/services/approvals'
import type { WithTenant } from '../src/tenancy'
import { apiRequest, asSession, createTestApi, testDeps, testOrg } from './harness'

const capture: { stationId: string; data: Array<{ timestamp: string; rf: number }> } = JSON.parse(
  readFileSync(new URL('./fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
)
const myt = (local: string) => new Date(`2026-11-02T${local}:00+08:00`)
const GAUGE = 'site.rain_60m_mm'

const A = 'approvals-a'
let clock = myt('15:07')
const deps = testDeps({ withTenant: withTenant as unknown as WithTenant, recordAudit, now: () => clock })
const { api } = createTestApi({ deps })
const inOrg = <T>(slug: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(slug).id, principal: systemPrincipal('test') }, fn)

// The gauge each project's snapshots read, by project.
const gauges = new Map<string, string>()

/** #133's SnapshotSource: the gauge's 60-minute total at `tEval` from the stored readings, persisted when asked. */
const snapshots: SnapshotSource = {
  async take(handle, q) {
    const tx = handle as Tx
    const gauge = gauges.get(q.projectId)!
    const t = new Date(q.tEval)
    const rows = await tx
      .select({ id: reading.id, value: reading.value, observedAt: reading.observedAt })
      .from(reading)
      .where(
        and(
          eq(reading.sourceId, gauge),
          gt(reading.observedAt, new Date(t.getTime() - 3_600_000)),
          lte(reading.observedAt, t)
        )
      )
      .orderBy(asc(reading.observedAt))
    const latest = rows.at(-1)!.observedAt
    const site: Record<string, IndicatorValue> = {
      [GAUGE]: {
        name: GAUGE,
        value: rows.reduce((sum, r) => sum + (r.value ?? 0), 0),
        unit: 'mm',
        state: 'fresh',
        since: null,
        ageS: Math.round((t.getTime() - latest.getTime()) / 1000),
        sourceIds: [gauge],
        readingIds: rows.map((r) => r.id),
        observedAt: latest.toISOString()
      }
    }
    const hash = canonicalHash({ site: { [GAUGE]: { ...site[GAUGE], ageS: null } } })
    const snapshot: IndicatorSnapshot = {
      projectId: q.projectId,
      pack: q.pack,
      tEval: q.tEval,
      inputs: [],
      site,
      series: {},
      nights: [],
      registryHash: 'registry-double',
      hash
    }
    if (!q.persist) return { snapshotId: null, snapshot }
    const row = await makeIndicatorSnapshot(tx, { projectId: q.projectId, pack: q.pack, tEval: t, site, hash })
    return { snapshotId: row.id, snapshot }
  }
}

/** #133's ShadowEvaluator over the default sheet's Storm confirmed (`w.rain_max_60m_mm >= 31.0`) for every window. */
const shadow: ShadowEvaluator = {
  async loadPublished() {
    throw new Error('an approval evaluates the run’s pinned version, not the published one')
  },
  evaluate(sheet, s, windows, tEval) {
    const rain = s.site[GAUGE]!
    const fired = typeof rain.value === 'number' && rain.value >= 31
    const verdict = (id: string): Verdict => ({
      scope: { kind: 'window', id },
      pack: 'sky',
      mode: fired ? 'commute_disruption' : 'normal',
      watch: false,
      noCall: null,
      recommendations: [],
      clauses: [{ key: 'storm_confirmed', result: fired ? 'fired' : 'not_fired', blockedBy: [], inputs: [rain] }],
      openFrom: null
    })
    const verdicts = {
      tEval,
      pack: sheet.pack,
      contentHash: sheet.contentHash,
      snapshotHash: s.hash,
      site: [],
      windows: windows.map((w) => verdict(w.id)),
      nights: [],
      hash: ''
    }
    return { verdicts, verdictHash: canonicalHash(verdicts.windows), explanations: [] }
  }
}
setRecheckPorts({ snapshots, shadow })

/** The engine's verdict as `call.shadow` holds it on the wire (#150's `Verdict`). */
function wire(v: Verdict) {
  return {
    scope: v.scope,
    pack: v.pack,
    mode: v.mode,
    watch: v.watch,
    no_call: null,
    recommendations: v.recommendations,
    clauses: v.clauses.map((c) => ({
      key: c.key,
      result: c.result,
      blocked_by: [],
      inputs: c.inputs.map((i) => ({
        name: i.name,
        value: i.value,
        unit: i.unit,
        state: i.state,
        since: i.since,
        age_s: i.ageS,
        source_ids: i.sourceIds,
        source_url: null,
        reading_ids: i.readingIds,
        observed_at: i.observedAt
      }))
    })),
    open_from: v.openFrom
  }
}

const WORDING = {
  en: {
    language: 'en' as const,
    subject: 'Storm',
    body: 'Heavy rain at the Bukit Jalil gauge; allow time for the LRT.'
  },
  ms: { language: 'ms' as const, subject: 'Ribut', body: 'Hujan lebat di tolok Bukit Jalil; beri masa untuk LRT.' }
}

interface Made {
  scene: Scene
  bundleId: string
  callIds: string[]
  subscribers: { en: string; en2: string; ms: string; unconfirmed: string }
}

/**
 * A project whose gauge holds the capture's readings up to `until`, with its email channel on, four subscribers and
 * a Storm confirmed bundle drafted at 15:05 for the 15:15, 15:30 and 15:45 release waves.
 */
async function draft(o: { station?: string; until?: string; calls?: number } = {}): Promise<Made> {
  return inOrg(A, async (tx) => {
    const scene = await bundleScene(tx, { slaS: 600 })
    const gauge = await makeSource(tx, {
      kind: 'jps_rain',
      externalId: o.station ?? randomUUID(),
      name: capture.stationId,
      url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
    })
    gauges.set(scene.projectId, gauge.id)
    await storeReadings(tx, gauge.id, '13:00', o.until ?? '15:05')
    await makeProjectChannel(tx, { projectId: scene.projectId, channel: 'email', enabled: true })
    const subscriber = (language: string, confirmed = true) =>
      makeSubscriber(tx, { projectId: scene.projectId, language, confirmedAt: confirmed ? myt('09:00') : null })
    const subscribers = {
      en: (await subscriber('en')).id,
      en2: (await subscriber('en')).id,
      ms: (await subscriber('ms')).id,
      unconfirmed: (await subscriber('en', false)).id
    }
    const waves = [
      ['15:15', '15:30'],
      ['15:30', '15:45'],
      ['15:45', '16:00']
    ].slice(0, o.calls ?? 3)
    const windows = []
    for (const [from, to] of waves) windows.push(await windowOf(tx, scene, myt(from!), myt(to!), `Release ${to}`))
    const tEval = myt('15:05').toISOString()
    const taken = await snapshots.take(tx, {
      projectId: scene.projectId,
      pack: 'sky',
      tEval,
      windows: [],
      persist: true
    })
    const sheet = { pack: 'sky' as const, clauses: [], contentHash: 'pinned', registryHash: 'registry-double' }
    const { verdicts } = shadow.evaluate(sheet, taken.snapshot, windows.map(windowOfRow), tEval)
    const r = await runOf(tx, { ...scene, snapshotId: taken.snapshotId! }, myt('15:05'))
    const created = await createBundle(tx, {
      runId: r.id,
      pack: 'sky',
      draftOnly: false,
      calls: windows.map((w, i) =>
        callDraft({
          windowId: w.id,
          mode: 'commute_disruption',
          fired: [{ clause: 'storm_confirmed', inputs: [GAUGE] }],
          recipients: Object.values(subscribers),
          notices: [WORDING.en, WORDING.ms],
          reason: 'Storm confirmed at the gauge.',
          shadow: wire(verdicts.windows[i]!)
        })
      ),
      triggeredAt: r.triggeredAt,
      now: myt('15:05')
    })
    return { scene, bundleId: created.bundleId, callIds: created.callIds, subscribers }
  })
}

function windowOfRow(w: { id: string; startsAt: Date; endsAt: Date }) {
  return {
    id: w.id,
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
    kind: 'commute_wave' as const,
    tz: 'Asia/Kuala_Lumpur'
  }
}

/** The capture's 5-minute readings observed in (`from`, `to`], as the JPS adapter stores them. */
async function storeReadings(tx: Tx, sourceId: string, from: string, to: string) {
  for (const { timestamp, rf } of capture.data) {
    const at = new Date(`${timestamp}+08:00`)
    if (at > myt(from) && at <= myt(to)) {
      await makeReading(tx, { sourceId, metric: 'rain_5m_mm', unit: 'mm', observedAt: at, value: rf })
    }
  }
}

/** An Approver (or `role`) of A signed in at `authenticatedAt`, with a membership row carrying `readsMalay`. */
async function approver(o: { role?: 'approver' | 'admin' | 'owner' | 'editor'; readsMalay?: boolean } = {}) {
  const principal = asSession({ org: A, role: o.role ?? 'approver', authenticatedAt: clock })
  if (principal.kind !== 'session') throw new Error('unreachable')
  await makeUser({ id: principal.accountId })
  await makeMember({
    organizationId: testOrg(A).id,
    userId: principal.accountId,
    role: o.role ?? 'approver',
    readsMalay: o.readsMalay ?? false
  })
  return principal
}

async function bundleRow(made: Made) {
  return inOrg(A, async (tx) => {
    const calls = await tx.select().from(call).where(eq(call.bundleId, made.bundleId)).orderBy(asc(call.expiresAt))
    const notices = await tx.select().from(notice).where(eq(notice.projectId, made.scene.projectId))
    const approvals = await tx.select().from(approval).where(eq(approval.bundleId, made.bundleId))
    return { calls, notices, approvals }
  })
}

function approve(
  as: Principal,
  made: Made,
  body: { review_hash?: string; reconfirm?: boolean; calls: Array<Record<string, unknown>> },
  o: { idempotencyKey?: string; reviewHash?: string } = {}
) {
  return apiRequest(api, {
    as,
    method: 'POST',
    path: `/api/bundles/${made.bundleId}/approve`,
    org: A,
    idempotencyKey: o.idempotencyKey,
    body: { reconfirm: false, ...body, review_hash: body.review_hash ?? o.reviewHash }
  })
}

async function currentHash(made: Made) {
  const { bundle } = await import('@skyclause/db')
  return inOrg(A, async (tx) => (await tx.select().from(bundle).where(eq(bundle.id, made.bundleId)))[0]!.reviewHash)
}

beforeAll(async () => {
  await makeOrganization({ id: testOrg(A).id, slug: A })
})

describe('CAL-6: one approval per bundle with per-call edit and reject', () => {
  test('approving a 3-call bundle with one rejection queues notices for 2 calls; the rejected call stays rejected', async () => {
    clock = myt('15:07')
    const made = await draft()
    const [first, second, third] = made.callIds as [string, string, string]
    const as = await approver({ readsMalay: true })
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [
        { call_id: first, action: 'approve' },
        { call_id: second, action: 'edit', recipients: [made.subscribers.en, made.subscribers.unconfirmed] },
        { call_id: third, action: 'reject' }
      ]
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const body = (await response.json()) as {
      state: string
      approved_by: string
      calls: Array<{ id: string; state: string }>
    }
    expect(body.state).toBe('sending')
    expect(body.approved_by).toBe(as.accountId)
    expect(Object.fromEntries(body.calls.map((c) => [c.id, c.state]))).toEqual({
      [first]: 'sending',
      [second]: 'sending',
      [third]: 'rejected'
    })

    const { notices, approvals } = await bundleRow(made)
    // NTC-8: the unconfirmed subscriber gets no row; the edit left the second call one confirmed recipient.
    const queued = notices.map((n) => [n.callId, n.subscriberId, n.language, n.kind, n.channel, n.status])
    expect(queued).toHaveLength(4)
    expect(queued).toEqual(
      expect.arrayContaining([
        [first, made.subscribers.en, 'en', 'call', 'email', 'queued'],
        [first, made.subscribers.en2, 'en', 'call', 'email', 'queued'],
        [first, made.subscribers.ms, 'ms', 'call', 'email', 'queued'],
        [second, made.subscribers.en, 'en', 'call', 'email', 'queued']
      ])
    )
    expect(approvals.map((a) => [a.callId, a.action, a.actorId]).sort()).toEqual(
      [
        [first, 'approve', as.accountId],
        [second, 'edit', as.accountId],
        [third, 'reject', as.accountId]
      ].sort()
    )
    expect((await ledgerOf(made.scene.projectId)).map((e) => [e.kind, e.refs.call_id])).toEqual([
      ['call_approved', first],
      ['call_edited', second],
      ['call_rejected', third]
    ])
    const event = await expectEvent('bundle.approved', { projectId: made.scene.projectId })
    expect(event.data).toMatchObject({
      bundle_id: made.bundleId,
      state: 'approved',
      sending_call_ids: [first, second],
      rejected_call_ids: [third]
    })
    const audit = await expectOneAudit('bundle.approved', { projectId: made.scene.projectId })
    expect(audit).toMatchObject({ actor_id: as.accountId, target_type: 'bundle', target_id: made.bundleId })
    await expectOneAudit('call.edited', { targetId: second })
    await expectOneAudit('call.rejected', { targetId: third })
  })
})
