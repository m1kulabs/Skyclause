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
  projectChannel,
  reading,
  recordAudit,
  run,
  saveEvaluatorSnapshot,
  sheetVersion,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  bundleScene,
  callDraft,
  defaultSheet,
  ledgerOf,
  runOf,
  windowOf,
  type Scene
} from '@skyclause/db/test/bundles/scene'
import {
  makeMember,
  makeOrganization,
  makeProjectChannel,
  makeReading,
  makeSheetVersion,
  makeSource,
  makeSubscriber,
  makeUser
} from '@skyclause/db/test/factories/index'
import { expectEvent, expectOneAudit } from '@skyclause/db/test/harness/index'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { setRecheckPorts } from '../src/services/approvals'
import type { WithTenant } from '../src/tenancy'
import {
  apiRequest,
  asApiKey,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg
} from './harness'

const capture: { stationId: string; data: Array<{ timestamp: string; rf: number }> } = JSON.parse(
  readFileSync(new URL('./fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
)
const myt = (local: string) => new Date(`2026-11-02T${local}:00+08:00`)
const GAUGE = 'site.rain_60m_mm'
const gaugeRegistry = [
  { name: GAUGE, celType: 'double' as const, unit: 'mm', scope: 'site' as const, sourceKind: 'jps_rain' as const }
]

const A = 'approvals-a'
const B = 'approvals-b'
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
    const body = {
      projectId: q.projectId,
      pack: q.pack,
      tEval: q.tEval,
      inputs: [],
      site,
      series: {},
      nights: [],
      registryHash: canonicalHash(gaugeRegistry)
    }
    const snapshot: IndicatorSnapshot = { ...body, hash: canonicalHash(body) }
    if (!q.persist) return { snapshotId: null, snapshot }
    return saveEvaluatorSnapshot(tx, { snapshot, registry: gaugeRegistry, windows: q.windows })
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

/** The engine's verdict as `call.shadow` holds it on the wire (#150's `Verdict`), with the gauge's URL. */
function wire(v: Verdict, url: string) {
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
        source_url: url,
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
  /** #499: the waves the draft left out, whose engine verdict fired. */
  missing: string[]
  subscribers: { en: string; en2: string; ms: string; unconfirmed: string }
  gauge: { id: string; externalId: string }
}

type Wording = { language: 'en' | 'ms'; subject: string; body: string }

/**
 * A project whose gauge holds the capture's readings up to `until`, with its email channel on, four subscribers and
 * a Storm confirmed bundle drafted at 15:05 for the 15:15, 15:30 and 15:45 release waves.
 */
async function draft(
  o: {
    org?: string
    station?: string
    until?: string
    calls?: number
    notices?: Wording[]
    /** The agent's mode where it disagrees with the engine's Commute disruption. */
    agentMode?: 'hybrid_recommended' | 'outdoor_limited'
    /** Storm confirmed's wording in the pinned sheet, which is then version 2. */
    wording?: { en?: string; ms?: string }
    draftOnly?: boolean
    /** #499: the next waves after the calls that the draft leaves out, and the mode the run's engine saw for them. */
    missing?: number
    missingMode?: 'outdoor_limited'
  } = {}
): Promise<Made> {
  return inOrg(o.org ?? A, async (tx) => {
    let scene = await bundleScene(tx, { slaS: 600 })
    if (o.wording) {
      const content = defaultSheet('sky') as { clauses: Array<{ key: string; wording: unknown }> }
      const [v1] = await tx.select().from(sheetVersion).where(eq(sheetVersion.id, scene.sheetVersionId))
      const v2 = await makeSheetVersion(tx, {
        sheetId: v1!.sheetId,
        n: 2,
        status: 'published',
        publishedAt: myt('09:00'),
        content: {
          ...content,
          clauses: content.clauses.map((c) => (c.key === 'storm_confirmed' ? { ...c, wording: o.wording } : c))
        }
      })
      scene = { ...scene, sheetVersionId: v2.id }
    }
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
    ].slice(0, (o.calls ?? 3) + (o.missing ?? 0))
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
      draftOnly: o.draftOnly ?? false,
      missing: windows.slice(o.calls ?? 3).map((w, i) => {
        const seen = wire(verdicts.windows[(o.calls ?? 3) + i]!, gauge.url)
        return {
          windowId: w.id,
          nightId: null,
          shadow: o.missingMode ? { ...seen, mode: o.missingMode } : seen,
          recipients: Object.values(subscribers)
        }
      }),
      calls: windows.slice(0, o.calls ?? 3).map((w, i) =>
        callDraft({
          windowId: w.id,
          mode: o.agentMode ?? 'commute_disruption',
          agrees: !o.agentMode,
          fired: [{ clause: 'storm_confirmed', inputs: [GAUGE] }],
          recipients: Object.values(subscribers),
          notices: o.notices ?? [WORDING.en, WORDING.ms],
          reason: 'Storm confirmed at the gauge.',
          shadow: wire(verdicts.windows[i]!, gauge.url)
        })
      ),
      triggeredAt: r.triggeredAt,
      now: myt('15:05')
    })
    return {
      scene,
      bundleId: created.bundleId,
      callIds: created.callIds,
      missing: windows.slice(o.calls ?? 3).map((w) => w.id),
      subscribers,
      gauge: { id: gauge.id, externalId: gauge.externalId }
    }
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
  body: {
    review_hash?: string
    reconfirm?: boolean
    calls: Array<Record<string, unknown>>
    missing?: Array<Record<string, unknown>>
  },
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

async function bundleOf(tx: Tx, made: Made) {
  const { bundle } = await import('@skyclause/db')
  return (await tx.select().from(bundle).where(eq(bundle.id, made.bundleId)))[0]!
}

async function bundleState(made: Made) {
  const { bundle } = await import('@skyclause/db')
  return inOrg(A, async (tx) => (await tx.select().from(bundle).where(eq(bundle.id, made.bundleId)))[0]!.state)
}

async function currentHash(made: Made) {
  const { bundle } = await import('@skyclause/db')
  return inOrg(A, async (tx) => (await tx.select().from(bundle).where(eq(bundle.id, made.bundleId)))[0]!.reviewHash)
}

beforeAll(async () => {
  for (const slug of [A, B]) await makeOrganization({ id: testOrg(slug).id, slug })
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

interface Conflict {
  type: string
  review_hash: string
  changed_inputs: Array<{ call_id: string; before: Record<string, unknown>; after: Record<string, unknown> }>
  changed_verdicts: unknown[]
}

/** Every call approved as drafted. */
const approveAll = (made: Made) => made.callIds.map((call_id) => ({ call_id, action: 'approve' }))

describe('CAL-9: a reading arriving between draft and approval is re-checked', () => {
  test('replay: the 15:10 reading answers 409 inputs-changed naming 0232901RF before and after; the token approves', async () => {
    clock = myt('15:12')
    const made = await draft({ station: capture.stationId, calls: 1 })
    expect(made.gauge.externalId).toBe('0232901RF')
    await inOrg(A, (tx) => storeReadings(tx, made.gauge.id, '15:05', '15:10'))
    const as = await approver()

    const first = await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    expect(first.status).toBe(409)
    const conflict = (await first.json()) as Conflict
    expect(conflict.type).toBe('https://docs.skyclause.m1ku.tech/problems/inputs-changed')
    expect(conflict.changed_verdicts).toEqual([])
    expect(conflict.changed_inputs).toHaveLength(1)
    const [change] = conflict.changed_inputs
    expect(change!.call_id).toBe(made.callIds[0])
    // The gauge's 60-minute totals (D12): (14:05, 15:05] = 44.5 mm and (14:10, 15:10] = 49.5 mm.
    expect(change!.before).toMatchObject({
      name: GAUGE,
      value: 44.5,
      source_ids: [made.gauge.id],
      source_url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
      observed_at: myt('15:05').toISOString()
    })
    expect(change!.after).toMatchObject({
      name: GAUGE,
      value: 49.5,
      source_ids: [made.gauge.id],
      source_url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
      observed_at: myt('15:10').toISOString()
    })
    // The 409 committed its snapshot and moved the bundle to Reconfirm, with nothing approved or queued.
    let rows = await bundleRow(made)
    expect(rows.calls.map((c) => c.state)).toEqual(['drafted'])
    expect(rows.notices).toEqual([])
    expect(await bundleState(made)).toBe('reconfirm')

    const confirmed = await approve(as, made, {
      review_hash: conflict.review_hash,
      reconfirm: true,
      calls: approveAll(made)
    })
    expect(confirmed.status, await confirmed.clone().text()).toBe(200)
    rows = await bundleRow(made)
    expect(rows.calls.map((c) => c.state)).toEqual(['sending'])
    const reconfirm = rows.approvals.filter((a) => a.action === 'reconfirm')
    expect(reconfirm).toHaveLength(1)
    expect(reconfirm[0]!.diff).toMatchObject({ confirmed_snapshot_id: conflict.review_hash.split('.')[1] })
  })

  test('a stale review_hash without a token counts as changed; its token then approves', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver()
    const stale = await approve(as, made, { review_hash: 'not-the-hash-shown', calls: approveAll(made) })
    expect(stale.status).toBe(409)
    const conflict = (await stale.json()) as Conflict
    expect(conflict).toMatchObject({ changed_inputs: [], changed_verdicts: [] })
    expect(conflict.review_hash).toMatch(/^recheck\./)
    const confirmed = await approve(as, made, {
      review_hash: conflict.review_hash,
      reconfirm: true,
      calls: approveAll(made)
    })
    expect(confirmed.status).toBe(200)
  })

  test('a reading after the 409 answers 409 again with a new token', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    await inOrg(A, (tx) => storeReadings(tx, made.gauge.id, '15:05', '15:10'))
    clock = myt('15:12')
    const as = await approver()
    const first = (await (
      await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    ).json()) as Conflict
    await inOrg(A, (tx) => storeReadings(tx, made.gauge.id, '15:10', '15:15'))
    clock = myt('15:16')
    const again = await approve(as, made, { review_hash: first.review_hash, reconfirm: true, calls: approveAll(made) })
    expect(again.status).toBe(409)
    const second = (await again.json()) as Conflict
    expect(second.review_hash).not.toBe(first.review_hash)
    expect(second.changed_inputs[0]!.after).toMatchObject({ value: 54, observed_at: myt('15:15').toISOString() })
    expect((await bundleRow(made)).approvals).toEqual([])
  })

  test('D23: a confirmed change that fails validate answers 422 redraft-required and records the reconfirm', async () => {
    clock = myt('15:12')
    // The wording quotes the 15:05 total, which the 15:12 snapshot no longer holds.
    const made = await draft({
      calls: 1,
      notices: [{ language: 'en', subject: 'Storm', body: 'The gauge read 44.5 mm in the last hour.' }]
    })
    await inOrg(A, (tx) => storeReadings(tx, made.gauge.id, '15:05', '15:10'))
    const as = await approver()
    const conflict = (await (
      await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    ).json()) as Conflict
    const response = await approve(as, made, {
      review_hash: conflict.review_hash,
      reconfirm: true,
      calls: approveAll(made)
    })
    expect(response.status).toBe(422)
    const problem = (await response.json()) as { type: string; reasons: string[] }
    expect(problem.type).toBe('https://docs.skyclause.m1ku.tech/problems/redraft-required')
    expect(problem.reasons.join('\n')).toContain('44.5 is not a quotable number')
    const rows = await bundleRow(made)
    expect(rows.approvals.map((a) => a.action)).toEqual(['reconfirm'])
    expect(rows.calls.map((c) => c.state)).toEqual(['drafted'])
    expect(await bundleState(made)).toBe('reconfirm')
  })

  test('#499: a redraft-required approval drafts nothing for a missing call, which stays unresolved', async () => {
    clock = myt('15:12')
    const made = await draft({
      calls: 1,
      missing: 1,
      notices: [{ language: 'en', subject: 'Storm', body: 'The gauge read 44.5 mm in the last hour.' }]
    })
    await inOrg(A, (tx) => storeReadings(tx, made.gauge.id, '15:05', '15:10'))
    const as = await approver()
    const decide = { calls: approveAll(made), missing: [{ window_id: made.missing[0], action: 'draft' }] }
    const conflict = (await (
      await approve(as, made, { review_hash: await currentHash(made), ...decide })
    ).json()) as Conflict
    const response = await approve(as, made, { review_hash: conflict.review_hash, reconfirm: true, ...decide })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { type: string }).type).toMatch(/redraft-required$/)
    expect((await bundleRow(made)).calls).toHaveLength(1)
    expect((await inOrg(A, (tx) => bundleOf(tx, made))).missing).toMatchObject([{ resolution: null }])
  })
})

describe('#79 §4 and §7: who may approve', () => {
  const body = { review_hash: 'shown', reconfirm: false, calls: [{ call_id: randomUUID(), action: 'approve' }] }
  const attempt = (as: Principal, id = randomUUID()) =>
    apiRequest(api, {
      as,
      method: 'POST',
      path: `/api/bundles/${id}/approve`,
      org: as.kind === 'session' ? A : undefined,
      body
    })

  test('GST-7: API keys, OAuth tokens, guest tokens and share links get 403, each writing one bundle.approve_denied', async () => {
    const principals: Principal[] = [
      asApiKey({ org: A, role: 'owner', scopes: ['read', 'draft', 'admin'] }),
      asOAuth({ org: A, role: 'owner', resource: 'api', scopes: ['read', 'draft'] }),
      asGuestToken({ org: A, scopes: ['read', 'draft'] }),
      asShareLink({ org: A, access: 'reviewer' })
    ]
    for (const principal of principals) {
      const id = randomUUID()
      const response = await attempt(principal, id)
      expect(response.status, principal.kind).toBe(403)
      const row = await expectOneAudit('bundle.approve_denied', { orgId: testOrg(A).id, targetId: id })
      expect(row, principal.kind).toMatchObject({ target_type: 'bundle' })
    }
  })

  test('GST-7: a guest session gets 403 and is logged; an Editor gets 403', async () => {
    const id = randomUUID()
    expect((await attempt(asSession({ org: A, role: 'guest', guest: true, authenticatedAt: clock }), id)).status).toBe(
      403
    )
    await expectOneAudit('bundle.approve_denied', { orgId: testOrg(A).id, targetId: id })
    expect((await attempt(await approver({ role: 'editor' }))).status).toBe(403)
  })

  test('ACC-8: a 13-hour-old session gets 401 reauth-required', async () => {
    const principal = asSession({
      org: A,
      role: 'approver',
      authenticatedAt: new Date(clock.getTime() - 13 * 3_600_000)
    })
    const response = await attempt(principal)
    expect(response.status).toBe(401)
    expect(((await response.json()) as { type: string }).type).toBe(
      'https://docs.skyclause.m1ku.tech/problems/reauth-required'
    )
  })

  test('another organisation’s bundle answers 404', async () => {
    clock = myt('15:07')
    const other = await draft({ org: B, calls: 1 })
    const as = await approver()
    await crossOrgCase('approveBundle', {
      app: api,
      as,
      org: A,
      params: { id: other.bundleId },
      body: { review_hash: 'shown', reconfirm: false, calls: approveAll(other) }
    }).run()
  })
})

describe('idempotency and the outbox', () => {
  test('a repeated Idempotency-Key returns the stored response and writes no second outbox row', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver()
    const body = { review_hash: await currentHash(made), calls: approveAll(made) }
    const key = randomUUID()
    const first = await approve(as, made, body, { idempotencyKey: key })
    expect(first.status).toBe(200)
    const again = await approve(as, made, body, { idempotencyKey: key })
    expect(again.status).toBe(200)
    expect(await again.text()).toBe(await first.text())
    const rows = await bundleRow(made)
    // Three confirmed subscribers, once each; the unconfirmed one gets none (NTC-8).
    expect(rows.notices.map((n) => n.subscriberId).sort()).toEqual(
      [made.subscribers.en, made.subscribers.en2, made.subscribers.ms].sort()
    )
    expect(rows.approvals.map((a) => a.action)).toEqual(['approve'])
    // Without the key, a repeat finds the bundle no longer under review.
    expect((await approve(as, made, body)).status).toBe(422)
  })

  test('with the project’s email channel off, the call sends with no notice rows', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    await inOrg(A, (tx) =>
      tx.update(projectChannel).set({ enabled: false }).where(eq(projectChannel.projectId, made.scene.projectId))
    )
    const as = await approver()
    expect((await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })).status).toBe(
      200
    )
    const rows = await bundleRow(made)
    expect(rows.calls.map((c) => c.state)).toEqual(['sending'])
    expect(rows.notices).toEqual([])
  })
})

describe('CAL-15: required lines and attendance excuses', () => {
  const editTo = (made: Made, wording: Wording) => [{ call_id: made.callIds[0]!, action: 'edit', notices: [wording] }]

  test('an edit excusing attendance in English answers 422 attendance-excuse and approves nothing', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver({ readsMalay: true })
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: editTo(made, { language: 'en', subject: 'Storm', body: 'Heavy rain; attendance is optional today.' })
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/validation-failed',
      reason: 'attendance-excuse',
      call_id: made.callIds[0]
    })
    const rows = await bundleRow(made)
    expect(rows.calls.map((c) => c.state)).toEqual(['drafted'])
    expect(rows.approvals).toEqual([])
  })

  test('an edit excusing attendance in Malay answers 422 attendance-excuse', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver({ readsMalay: true })
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: editTo(made, {
        language: 'ms',
        subject: 'Ribut',
        body: 'Hujan lebat; pelajar tidak perlu hadir hari ini.'
      })
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ reason: 'attendance-excuse', call_id: made.callIds[0] })
  })

  test('a Hybrid recommended edit replaces the wording only: the template keeps the teaching-mode line', async () => {
    // #152: the teaching line is a template line, so no edit removes it; checkRequiredLines still runs on the render.
    clock = myt('15:07')
    const made = await draft({ calls: 1, agentMode: 'hybrid_recommended' })
    const as = await approver({ readsMalay: true })
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [
        {
          call_id: made.callIds[0]!,
          action: 'edit',
          chosen: 'agent',
          notices: [{ language: 'en', subject: 'Storm', body: 'Heavy rain at the gauge; teach online if you can.' }]
        }
      ]
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const [stored] = (await bundleRow(made)).calls
    expect(stored).toMatchObject({ state: 'sending', mode: 'hybrid_recommended', chosen: 'agent' })
    expect(stored!.notices).toEqual([
      { language: 'en', subject: 'Storm', body: 'Heavy rain at the gauge; teach online if you can.' },
      WORDING.ms
    ])
  })
})

describe('LOC-5: Malay model notices need a Malay reader', () => {
  test('a non-reader’s approval sends the call in English and records the fallback', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver({ readsMalay: false })
    const response = await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      calls: Array<{ notices: Wording[]; recipient_counts: { by_language: { en: number; ms: number } } }>
    }
    // The bundle shows the call as English only, with every recipient counted in English (LOC-4).
    expect(body.calls[0]!.notices).toEqual([WORDING.en])
    expect(body.calls[0]!.recipient_counts.by_language).toEqual({ en: 3, ms: 0 })
    const rows = await bundleRow(made)
    expect(rows.notices.find((n) => n.subscriberId === made.subscribers.ms)!.language).toBe('en')
    expect(rows.approvals[0]!.diff).toMatchObject({ language_fallback: { to: 'en', reason: 'malay-reader-required' } })
    const [entry] = await ledgerOf(made.scene.projectId)
    expect(entry!.body).toMatchObject({ language_fallback: 'en', notices: { en: 3, ms: 0 } })
  })

  test('a non-reader’s edit to Malay text answers 422 malay-reader-required', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver({ readsMalay: false })
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [{ call_id: made.callIds[0]!, action: 'edit', notices: [{ ...WORDING.ms, body: 'Hujan lebat.' }] }]
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/malay-reader-required',
      call_id: made.callIds[0]
    })
  })
})

describe('CAL-4 and D23: a pick per disagreeing window', () => {
  test('a disagreeing call without a pick answers 422', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1, agentMode: 'outdoor_limited' })
    const as = await approver()
    const response = await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ call_id: made.callIds[0] })
  })

  test('a shadow pick sends the engine’s call worded by its clause, placeholders filled from the snapshot', async () => {
    clock = myt('15:07')
    const made = await draft({
      calls: 1,
      agentMode: 'outdoor_limited',
      wording: {
        en: 'Storm confirmed: {site.rain_60m_mm.value} {site.rain_60m_mm.unit} by {site.rain_60m_mm.observed_at} at gauge {site.rain_60m_mm.station}.'
      }
    })
    const as = await approver({ readsMalay: true })
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [{ call_id: made.callIds[0]!, action: 'approve', chosen: 'shadow' }]
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const rows = await bundleRow(made)
    expect(rows.calls[0]).toMatchObject({
      state: 'sending',
      chosen: 'shadow',
      mode: 'commute_disruption',
      fired: [{ clause: 'storm_confirmed', inputs: [GAUGE] }],
      notices: [
        {
          language: 'en',
          subject: '',
          body: `Storm confirmed: 44.5 mm by 15:05 MYT at gauge ${made.gauge.externalId}.`
        }
      ]
    })
    // The sheet has no Malay wording, so the Malay subscriber's notice is English.
    expect(rows.notices.find((n) => n.subscriberId === made.subscribers.ms)!.language).toBe('en')
    const pick = rows.approvals.find((a) => a.action === 'choose_verdict')!
    expect(pick.diff).toMatchObject({
      before: { chosen: 'agent', mode: 'outdoor_limited' },
      after: { chosen: 'shadow' }
    })
    expect(rows.approvals.map((a) => a.action).sort()).toEqual(['approve', 'choose_verdict'])
  })
})

describe('CAL-7, CAL-8 and the bundle’s state', () => {
  test('replay: approved at 15:35, the 15:30 call expires unsent and only the later calls send', async () => {
    clock = myt('15:35')
    const made = await draft()
    const [early, ...later] = made.callIds as [string, string, string]
    const as = await approver()
    const asked = await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    expect(asked.status).toBe(409)
    expect(await asked.json()).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/call-expired',
      call_id: early
    })
    // The gauge kept reporting, so the 15:35 re-check shows the change first (CAL-9), and the confirm approves.
    await inOrg(A, (tx) => storeReadings(tx, made.gauge.id, '15:05', '15:35'))
    const laterCalls = later.map((call_id) => ({ call_id, action: 'approve' }))
    const changed = await approve(as, made, { review_hash: await currentHash(made), calls: laterCalls })
    expect(changed.status).toBe(409)
    const { review_hash } = (await changed.json()) as Conflict
    const response = await approve(as, made, { review_hash, reconfirm: true, calls: laterCalls })
    expect(response.status, await response.clone().text()).toBe(200)
    const rows = await bundleRow(made)
    expect(rows.calls.map((c) => [c.id, c.state])).toEqual([
      [early, 'expired'],
      [later[0], 'sending'],
      [later[1], 'sending']
    ])
    expect(rows.notices.every((n) => n.callId !== early)).toBe(true)
    expect((await ledgerOf(made.scene.projectId)).map((e) => [e.kind, e.refs.call_id])).toEqual([
      ['call_expired', early],
      ['call_approved', later[0]],
      ['call_approved', later[1]]
    ])
  })

  test('a superseded bundle answers 409 bundle-superseded with the newer call', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const newer = await inOrg(A, async (tx) => {
      const [old] = await tx.select().from(call).where(eq(call.id, made.callIds[0]!))
      const [r] = await tx
        .select()
        .from(run)
        .where(eq(run.id, (await bundleOf(tx, made)).runId))
      return createBundle(tx, {
        runId: (await runOf(tx, { ...made.scene, snapshotId: r!.snapshotId! }, myt('15:06'))).id,
        pack: 'sky',
        draftOnly: false,
        calls: [callDraft({ windowId: old!.windowId!, mode: 'commute_disruption', shadow: old!.shadow as never })],
        triggeredAt: myt('15:06'),
        now: myt('15:06')
      })
    })
    const as = await approver()
    const response = await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/bundle-superseded',
      superseded_by_call_id: newer.callIds[0]
    })
  })

  test('D23: a guest window’s draft-only bundle is never approvable', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1, draftOnly: true })
    const as = await approver()
    const response = await approve(as, made, { review_hash: await currentHash(made), calls: approveAll(made) })
    expect(response.status).toBe(422)
    expect((await bundleRow(made)).notices).toEqual([])
  })

  test('every open call needs a decision', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 2 })
    const as = await approver()
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [{ call_id: made.callIds[0]!, action: 'approve' }]
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ call_id: made.callIds[1] })
  })

  test('a call of another bundle answers 422, not a server error', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1 })
    const as = await approver()
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [{ call_id: randomUUID(), action: 'approve' }]
    })
    expect(response.status).toBe(422)
  })
})

describe('#499: a missing call is drafted or dismissed before the bundle is approved', () => {
  const dismiss = (made: Made, reason?: string) => ({
    window_id: made.missing[0],
    action: 'dismiss',
    ...(reason === undefined ? {} : { reason })
  })

  test('approving only the calls, or dismissing without a reason, is refused and writes nothing', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 1, missing: 1 })
    const as = await approver()
    const review_hash = await currentHash(made)
    const unresolved = await approve(as, made, { review_hash, calls: approveAll(made) })
    expect(unresolved.status).toBe(422)
    expect(await unresolved.json()).toMatchObject({ detail: expect.stringMatching(/draft it or dismiss it/) })
    for (const reason of [undefined, '   ']) {
      const bare = await approve(as, made, { review_hash, calls: approveAll(made), missing: [dismiss(made, reason)] })
      expect(bare.status).toBe(422)
    }
    const stranger = await approve(as, made, {
      review_hash,
      calls: approveAll(made),
      missing: [dismiss(made, 'r'), { window_id: randomUUID(), action: 'dismiss', reason: 'r' }]
    })
    expect(stranger.status).toBe(422)
    // A calls-less request that decides nothing is refused the same way.
    expect((await approve(as, made, { review_hash, calls: [] })).status).toBe(422)
    expect((await bundleRow(made)).approvals).toEqual([])
    expect(await bundleState(made)).toBe('needs_review')
  })

  test('a dismissal with a reason approves a calls-less bundle, with an approval row, a ledger entry and an audit event', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 0, missing: 1 })
    const as = await approver()
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [],
      missing: [dismiss(made, ' Gauge reads high after maintenance ')]
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const body = (await response.json()) as { state: string; missing: Array<Record<string, unknown>> }
    expect(body.state).toBe('approved')
    expect(body.missing).toEqual([
      expect.objectContaining({
        window_id: made.missing[0],
        resolution: 'dismissed',
        reason: 'Gauge reads high after maintenance',
        resolved_by: as.accountId,
        resolved_at: '2026-11-02T07:07:00Z'
      })
    ])
    const { calls, notices, approvals } = await bundleRow(made)
    expect([calls, notices]).toEqual([[], []])
    expect(approvals.map((a) => [a.action, a.callId, a.diff])).toEqual([
      ['reject', null, { window_id: made.missing[0], reason: 'Gauge reads high after maintenance' }]
    ])
    // The ledger can be public, so it holds the dismissal but not its free-text reason.
    expect(await ledgerOf(made.scene.projectId)).toEqual([
      {
        kind: 'call_rejected',
        refs: { bundle_id: made.bundleId, window_id: made.missing[0] },
        body: { pack: 'sky', mode: 'commute_disruption', watch: false, approver_role: 'approver', missing: true }
      }
    ])
    expect(await expectOneAudit('call.rejected', { targetId: made.missing[0] })).toMatchObject({
      actor_id: as.accountId,
      target_type: 'window',
      after: { missing: true, bundle_id: made.bundleId, reason: 'Gauge reads high after maintenance' }
    })
    expect(await expectOneAudit('bundle.approved', { targetId: made.bundleId })).toMatchObject({
      after: expect.objectContaining({ sending_call_ids: [], drafted_call_ids: [], dismissed: [made.missing[0]] })
    })
  })

  test('a draft adds the engine’s call, worded by its clause, sent to the window’s confirmed subscribers', async () => {
    clock = myt('15:07')
    const made = await draft({
      calls: 1,
      missing: 1,
      wording: { en: 'Storm confirmed: {site.rain_60m_mm.value} {site.rain_60m_mm.unit} at the gauge.' }
    })
    const as = await approver()
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: approveAll(made),
      missing: [{ window_id: made.missing[0], action: 'draft' }]
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const body = (await response.json()) as { state: string; missing: Array<{ call_id: string; resolution: string }> }
    expect(body.state).toBe('sending')
    const rows = await bundleRow(made)
    const drafted = rows.calls.find((c) => c.windowId === made.missing[0])!
    expect(body.missing).toEqual([expect.objectContaining({ resolution: 'drafted', call_id: drafted.id })])
    expect(drafted).toMatchObject({
      state: 'sending',
      chosen: 'shadow',
      agrees: true,
      mode: 'commute_disruption',
      fired: [{ clause: 'storm_confirmed', inputs: [GAUGE] }],
      notices: [{ language: 'en', subject: '', body: 'Storm confirmed: 44.5 mm at the gauge.' }],
      // Storm confirmed expires at the wave's end (CAL-8).
      expiresAt: myt('15:45')
    })
    // NTC-8: the three confirmed subscribers, the unconfirmed one left out.
    expect(
      rows.notices
        .filter((n) => n.callId === drafted.id)
        .map((n) => n.subscriberId)
        .sort()
    ).toEqual([made.subscribers.en, made.subscribers.en2, made.subscribers.ms].sort())
    // No agent call was there to choose against, so no choose_verdict row.
    expect(rows.approvals.filter((a) => a.callId === drafted.id).map((a) => a.action)).toEqual(['approve'])
    expect((await ledgerOf(made.scene.projectId)).find((e) => e.refs.call_id === drafted.id)).toMatchObject({
      kind: 'call_approved',
      body: { chosen: 'shadow', missing: true }
    })
    expect(await expectOneAudit('bundle.approved', { targetId: made.bundleId })).toMatchObject({
      after: expect.objectContaining({
        sending_call_ids: [made.callIds[0], drafted.id],
        drafted_call_ids: [drafted.id]
      })
    })
  })

  test('a draft whose engine call changed since the run answers 422 redraft-required and adds no call', async () => {
    clock = myt('15:07')
    const made = await draft({ calls: 0, missing: 1, missingMode: 'outdoor_limited' })
    const as = await approver()
    const response = await approve(as, made, {
      review_hash: await currentHash(made),
      calls: [],
      missing: [{ window_id: made.missing[0], action: 'draft' }]
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { type: string }).type).toMatch(/redraft-required$/)
    expect((await bundleRow(made)).calls).toEqual([])
    expect(await bundleState(made)).toBe('needs_review')
  })

  test('a dismissal approves a bundle whose only call is overdue; the call expires unsent (CAL-8)', async () => {
    clock = myt('15:35')
    const made = await draft({ calls: 1, missing: 1, until: '15:35' })
    const as = await approver()
    const decide = { calls: [], missing: [dismiss(made, 'Storm call drafted by hand')] }
    // The 15:35 re-check shows the overdue call's input moved (CAL-9); the confirm then approves.
    const changed = await approve(as, made, { review_hash: await currentHash(made), ...decide })
    expect(changed.status).toBe(409)
    const { review_hash } = (await changed.json()) as Conflict
    const response = await approve(as, made, { review_hash, reconfirm: true, ...decide })
    expect(response.status, await response.clone().text()).toBe(200)
    expect((await response.json()) as { state: string }).toMatchObject({ state: 'approved' })
    expect((await bundleRow(made)).calls.map((c) => c.state)).toEqual(['expired'])
    expect((await ledgerOf(made.scene.projectId)).map((e) => e.kind)).toEqual(['call_expired', 'call_rejected'])
  })

  test('a request that decides no call and no missing call is refused, even when every call is overdue', async () => {
    clock = myt('15:35')
    const made = await draft({ calls: 1 })
    const response = await approve(await approver(), made, { review_hash: await currentHash(made), calls: [] })
    expect(response.status).toBe(422)
    expect(await bundleState(made)).toBe('needs_review')
  })

  /** A newer run of `made`'s project, at 15:06, whose draft dropped the call for its first wave. */
  async function droppedAfter(made: Made): Promise<Made> {
    return inOrg(A, async (tx) => {
      const [old] = await tx.select().from(call).where(eq(call.id, made.callIds[0]!))
      const [parent] = await tx
        .select()
        .from(run)
        .where(eq(run.id, (await bundleOf(tx, made)).runId))
      const r = await runOf(tx, { ...made.scene, snapshotId: parent!.snapshotId! }, myt('15:06'))
      const created = await createBundle(tx, {
        runId: r.id,
        pack: 'sky',
        draftOnly: false,
        calls: [],
        missing: [{ windowId: old!.windowId, nightId: null, shadow: old!.shadow, recipients: old!.recipients }],
        triggeredAt: r.triggeredAt,
        now: myt('15:06')
      })
      return { ...made, bundleId: created.bundleId, callIds: [], missing: [old!.windowId!] }
    })
  }

  for (const order of ['older first', 'newer first'] as const) {
    test(`a newer run that drops the call supersedes the older one: approving both, ${order}, sends the wave once`, async () => {
      clock = myt('15:07')
      const older = await draft({ calls: 1 })
      const newer = await droppedAfter(older)
      const as = await approver()
      const attempts = {
        older: async () => approve(as, older, { review_hash: await currentHash(older), calls: approveAll(older) }),
        newer: async () =>
          approve(as, newer, {
            review_hash: await currentHash(newer),
            calls: [],
            missing: [{ window_id: newer.missing[0], action: 'draft' }]
          })
      }
      const answers: Record<string, Response> = {}
      for (const which of order === 'older first' ? (['older', 'newer'] as const) : (['newer', 'older'] as const)) {
        answers[which] = await attempts[which]()
      }
      expect(answers.newer!.status, await answers.newer!.clone().text()).toBe(200)
      expect(answers.older!.status).toBe(409)
      expect(await answers.older!.json()).toMatchObject({
        type: 'https://docs.skyclause.m1ku.tech/problems/bundle-superseded',
        successor_bundle_id: newer.bundleId
      })
      const drafted = (await bundleRow(newer)).calls
      expect(drafted).toHaveLength(1)
      // One notice set: the drafted call's, to the three confirmed subscribers; none for the superseded call.
      const { notices, calls } = await bundleRow(older)
      expect(calls.map((c) => c.state)).toEqual(['superseded'])
      expect(notices.map((n) => n.callId)).toEqual([drafted[0]!.id, drafted[0]!.id, drafted[0]!.id])
    })
  }

  test('a draft for a wave already over is refused; dismissing it is still possible', async () => {
    clock = myt('15:46')
    const made = await draft({ calls: 0, missing: 1, until: '15:45' })
    const as = await approver()
    const review_hash = await currentHash(made)
    const late = await approve(as, made, {
      review_hash,
      calls: [],
      missing: [{ window_id: made.missing[0], action: 'draft' }]
    })
    expect(late.status).toBe(422)
    expect((await bundleRow(made)).calls).toEqual([])
    const dismissed = await approve(as, made, { review_hash, calls: [], missing: [dismiss(made, 'Wave has passed')] })
    expect(dismissed.status, await dismissed.clone().text()).toBe(200)
  })
})
