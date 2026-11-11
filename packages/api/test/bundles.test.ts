// #150: c-bundle-lifecycle's `/v1` reads on the #79 §7 test database, through the mounted app with f-api's harness:
// CAL-5's trace line, CAL-12's four instants, filters and paging, the stream's resume, a cross-organisation 404 and a
// denial below `project.view` on each operation.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { EventEnvelope, Page, Principal, Role } from '@skyclause/contracts'
import {
  bundle,
  createBundle,
  dismissMissing,
  emitEvent,
  listenEvents,
  markSending,
  recipientsByLanguage,
  run,
  systemPrincipal,
  transition,
  withTenant,
  type Tx
} from '@skyclause/db'
import { bundleScene, callDraft, runOf, windowOf, type Scene } from '@skyclause/db/test/bundles/scene'
import {
  makeApproval,
  makeBundleAlert,
  makeNotice,
  makeOrganization,
  makeReading,
  makeRunStep,
  makeSource,
  makeSubscriber
} from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import {
  isMember,
  type BundleDetail,
  type BundleView,
  type CallDetail,
  type CallExplanation,
  type CallView
} from '../src/services/bundles'
import type { WithTenant } from '../src/tenancy'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  asSystem,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg
} from './harness'

// The SSE hub (#175) isn't built: a double stands in. c-notice-templates' recipient counts (#152) run for real, spied
// on to see which calls the reads count.
vi.mock('@skyclause/db', async (original) => {
  const db = await original<typeof import('@skyclause/db')>()
  return { ...db, listenEvents: vi.fn(), recipientsByLanguage: vi.fn(db.recipientsByLanguage) }
})

const A = 'bundles-a'
const B = 'bundles-b'
const { v1 } = createTestApi({ deps: testDeps({ withTenant: withTenant as unknown as WithTenant }) })
const as = (role: 'viewer' | 'owner' = 'viewer') => asSession({ org: A, role })
const read = (
  principal: Principal,
  path: string,
  o: { org?: string; query?: Record<string, string>; headers?: Record<string, string> } = {}
) =>
  apiRequest(v1, {
    as: principal,
    method: 'GET',
    path,
    org: principal.kind === 'session' ? (o.org ?? A) : undefined,
    ...o
  })
const json = async <T>(response: Promise<Response>) => (await (await response).json()) as T
const inOrg = <T>(slug: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(slug).id, principal: systemPrincipal('test') }, fn)
const at = (iso: string) => new Date(iso)
const storm = {
  mode: 'commute_disruption' as const,
  fired: [{ clause: 'storm_confirmed', inputs: ['site.rain_60m_mm'] }]
}

/** MYT 15:00 on 2 November: the gauge's 60-minute total, fresh, and the APIMS reading, stale. */
const site = {
  'site.rain_60m_mm': {
    name: 'site.rain_60m_mm',
    value: 39,
    unit: 'mm',
    state: 'fresh',
    since: null,
    ageS: 600,
    sourceIds: [] as string[],
    readingIds: [],
    observedAt: '2026-11-02T07:00:00Z'
  },
  'site.met_warning_in_force': {
    name: 'site.met_warning_in_force',
    value: true,
    unit: '',
    state: 'fresh',
    since: null,
    ageS: 1800,
    sourceIds: [],
    readingIds: [],
    observedAt: '2026-11-02T06:40:00Z'
  },
  'site.api_max': {
    name: 'site.api_max',
    value: 62,
    unit: 'API',
    state: 'stale',
    since: '2026-11-02T05:00:00Z',
    ageS: 8400,
    sourceIds: [],
    readingIds: [],
    observedAt: '2026-11-02T05:00:00Z'
  }
}

interface Made {
  scene: Scene
  windows: [string, string]
  normal: { bundleId: string; callIds: string[] }
  review: { bundleId: string; callIds: string[] }
}
let made: Made
let other: { bundleId: string; callId: string; projectId: string }

async function draftIn(tx: Tx, scene: Scene, calls: Parameters<typeof callDraft>[0][], now: Date) {
  const r = await runOf(tx, scene, at('2026-11-02T07:05:00Z'))
  return createBundle(tx, {
    runId: r.id,
    pack: 'sky',
    draftOnly: false,
    calls: calls.map(callDraft),
    triggeredAt: r.triggeredAt,
    now
  })
}

beforeAll(async () => {
  for (const slug of [A, B]) await makeOrganization({ id: testOrg(slug).id, slug })
  made = await inOrg(A, async (tx) => {
    const gauge = await makeSource(tx, { url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75' })
    site['site.rain_60m_mm'].sourceIds = [gauge.id]
    const scene = await bundleScene(tx, { snapshot: { site } })
    const first = (await windowOf(tx, scene, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'), 'Lecture 3A')).id
    const second = (await windowOf(tx, scene, at('2026-11-02T07:30:00Z'), at('2026-11-02T07:45:00Z'), 'Lab 2')).id
    // LOC-4: two English and one Malay candidate for a call drafted in both languages.
    const recipients: string[] = []
    for (const language of ['en', 'en', 'ms']) {
      recipients.push((await makeSubscriber(tx, { projectId: scene.projectId, language })).id)
    }
    const notices = (['en', 'ms'] as const).map((language) => ({ language, subject: 'Storm', body: 'Allow time.' }))
    const normal = await draftIn(
      tx,
      scene,
      [{ windowId: first }, { windowId: second, watch: true }],
      at('2026-11-02T06:45:00Z')
    )
    const review = await draftIn(
      tx,
      scene,
      [
        { windowId: first, ...storm, recipients, notices },
        { windowId: second, ...storm }
      ],
      at('2026-11-02T07:10:00Z')
    )
    return { scene, windows: [first, second], normal, review }
  })
  other = await inOrg(B, async (tx) => {
    const scene = await bundleScene(tx)
    const w = await windowOf(tx, scene, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'))
    const b = await draftIn(tx, scene, [{ windowId: w.id, ...storm }], at('2026-11-02T07:10:00Z'))
    return { bundleId: b.bundleId, callId: b.callIds[0]!, projectId: scene.projectId }
  })
})

describe('GET /v1/bundles/{id}', () => {
  test('CAL-5: an all-Normal bundle is closed and reads "Normal; N inputs fresh" with each input’s age', async () => {
    const response = await read(as(), `/v1/bundles/${made.normal.bundleId}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as BundleDetail
    expect(body).toMatchObject({
      state: 'closed',
      sla_due_at: null,
      needs_review_at: null,
      draft_only: false,
      trigger: 'crossing',
      sheet_version_id: made.scene.sheetVersionId
    })
    expect(body.summary!.text).toBe('Normal; 2 inputs fresh')
    expect(body.summary!.inputs.map((i) => [i.name, i.age_s])).toEqual([
      ['site.rain_60m_mm', 600],
      ['site.met_warning_in_force', 1800]
    ])
    expect(body.summary!.inputs[0]!.source_url).toBe(
      'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
    )
    expect(body.calls.map((c) => c.recipient_counts)).toEqual([
      { by_language: { en: 0, ms: 0 }, by_channel: { email: 0, push: 0 }, suppressed: 0 },
      { by_language: { en: 0, ms: 0 }, by_channel: { email: 0, push: 0 }, suppressed: 0 }
    ])
  })

  test('a bundle in Needs review carries its SLA, alerts, escalations and recipient counts, and no Normal line', async () => {
    const [first] = made.review.callIds
    await inOrg(A, async (tx) => {
      await makeBundleAlert(tx, {
        bundleId: made.review.bundleId,
        level: 'on_duty',
        acceptedAt: at('2026-11-02T07:10:20Z')
      })
      await makeApproval(tx, {
        bundleId: made.review.bundleId,
        action: 'escalate',
        createdAt: at('2026-11-02T07:20:00Z')
      })
      await makeNotice(tx, { projectId: made.scene.projectId, callId: first, channel: 'email', status: 'suppressed' })
    })
    const body = await json<BundleDetail>(read(as(), `/v1/bundles/${made.review.bundleId}`))
    expect(body).toMatchObject({
      state: 'needs_review',
      sla_due_at: '2026-11-02T07:15:00Z',
      needs_review_at: '2026-11-02T07:10:00Z'
    })
    expect(body.summary).toBeUndefined()
    expect(body.alerts).toEqual([expect.objectContaining({ level: 'on_duty', notified_at: '2026-11-02T07:10:20Z' })])
    expect(body.escalations).toEqual([expect.objectContaining({ at: '2026-11-02T07:20:00Z' })])
    expect(body.calls.find((c) => c.id === first)!.recipient_counts).toEqual({
      by_language: { en: 2, ms: 1 },
      by_channel: { email: 1, push: 0 },
      suppressed: 1
    })
    expect(vi.mocked(recipientsByLanguage).mock.calls.map(([, id]) => id)).toEqual([first])
  })

  test('#499: a bundle with a missing call lists it, unresolved, and has no Normal line; once dismissed it reads why', async () => {
    const { projectId, bundleId, windowId } = await inOrg(A, async (tx) => {
      const scene = await bundleScene(tx)
      const w = await windowOf(tx, scene, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'))
      const r = await runOf(tx, scene, at('2026-11-02T07:05:00Z'))
      const { shadow } = callDraft({ windowId: w.id, ...storm })
      const b = await createBundle(tx, {
        runId: r.id,
        pack: 'sky',
        draftOnly: false,
        calls: [],
        missing: [{ windowId: w.id, nightId: null, shadow, recipients: ['subscriber-1'] }],
        triggeredAt: r.triggeredAt,
        now: at('2026-11-02T07:10:00Z')
      })
      return { projectId: scene.projectId, bundleId: b.bundleId, windowId: w.id }
    })
    const unresolved = {
      window_id: windowId,
      night_id: null,
      shadow: expect.objectContaining({ scope: { kind: 'window', id: windowId }, mode: 'commute_disruption' }),
      recipients: ['subscriber-1'],
      resolution: null,
      call_id: null,
      reason: null,
      resolved_by: null,
      resolved_at: null,
      superseded_by: null
    }
    const body = await json<BundleDetail>(read(as(), `/v1/bundles/${bundleId}`))
    expect(body).toMatchObject({ state: 'needs_review', calls: [], missing: [unresolved] })
    expect(body.summary).toBeUndefined()
    const listed = await json<Page<BundleView>>(read(as(), `/v1/projects/${projectId}/bundles`))
    expect(listed.data).toMatchObject([{ id: bundleId, missing: [unresolved] }])
    // A bundle with no missing call leaves the field out.
    expect(await json<BundleDetail>(read(as(), `/v1/bundles/${made.review.bundleId}`))).not.toHaveProperty('missing')

    const by = '0190f5a0-0000-7000-8000-000000000001'
    await inOrg(A, (tx) =>
      dismissMissing(tx, bundleId, { windowId }, { reason: 'Gauge under repair', by }, at('2026-11-02T07:12:00Z'))
    )
    expect((await json<BundleDetail>(read(as(), `/v1/bundles/${bundleId}`))).missing).toEqual([
      {
        ...unresolved,
        resolution: 'dismissed',
        reason: 'Gauge under repair',
        resolved_by: by,
        resolved_at: '2026-11-02T07:12:00Z'
      }
    ])
  })

  test('a run with no pinned sheet version reads sheet_version_id null', async () => {
    const bundleId = await inOrg(A, async (tx) => {
      const scene = await bundleScene(tx)
      const w = await windowOf(tx, scene, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'))
      const b = await draftIn(tx, scene, [{ windowId: w.id }], at('2026-11-02T07:10:00Z'))
      const [row] = await tx.select({ runId: bundle.runId }).from(bundle).where(eq(bundle.id, b.bundleId))
      await tx.update(run).set({ sheetVersionId: null }).where(eq(run.id, row!.runId))
      return b.bundleId
    })
    expect((await json<BundleDetail>(read(as(), `/v1/bundles/${bundleId}`))).sheet_version_id).toBeNull()
  })
})

describe('GET /v1/projects/{id}/bundles and /calls', () => {
  test('bundles come newest first, filter by state and page with a cursor', async () => {
    const path = `/v1/projects/${made.scene.projectId}/bundles`
    const all = await json<Page<BundleView>>(read(as(), path))
    expect(all.data.map((b) => b.id)).toEqual([made.review.bundleId, made.normal.bundleId])
    const closed = await json<Page<BundleView>>(read(as(), path, { query: { state: 'closed' } }))
    expect(closed.data.map((b) => b.id)).toEqual([made.normal.bundleId])
    const first = await json<Page<BundleView>>(read(as(), path, { query: { limit: '1' } }))
    expect(first.data.map((b) => b.id)).toEqual([made.review.bundleId])
    const next = await json<Page<BundleView>>(read(as(), path, { query: { limit: '1', cursor: first.next_cursor! } }))
    expect(next).toEqual({ data: [expect.objectContaining({ id: made.normal.bundleId })], next_cursor: null })
  })

  test('calls come newest drafted first and filter by window, mode, state and local drafting date', async () => {
    const path = `/v1/projects/${made.scene.projectId}/calls`
    const all = await json<Page<CallView>>(read(as(), path))
    expect(all.data).toHaveLength(4)
    expect(all.data[0]!.drafted_at).toBe('2026-11-02T07:10:00Z')
    const byWindow = await json<Page<CallView>>(read(as(), path, { query: { window_id: made.windows[0] } }))
    expect(byWindow.data.map((c) => c.id)).toEqual([made.review.callIds[0], made.normal.callIds[0]])
    const disrupted = await json<Page<CallView>>(read(as(), path, { query: { mode: 'commute_disruption' } }))
    expect(disrupted.data.map((c) => c.id).sort()).toEqual([...made.review.callIds].sort())
    const local = await json<Page<CallView>>(read(as(), path, { query: { from: '2026-11-02', to: '2026-11-02' } }))
    expect(local.data).toHaveLength(4)
    const before = await json<Page<CallView>>(read(as(), path, { query: { to: '2026-11-01' } }))
    expect(before.data).toEqual([])
  })
})

describe('GET /v1/calls/{id}', () => {
  test('CAL-12: the trigger, drafted, approved and sent instants, null until reached', async () => {
    const [first, second] = made.review.callIds as [string, string]
    const expectedTraceId = await inOrg(A, async (tx) => {
      const [row] = await tx.select({ runId: bundle.runId }).from(bundle).where(eq(bundle.id, made.review.bundleId))
      return row!.runId
    })
    const before = await json<CallDetail>(read(as(), `/v1/calls/${second}`))
    expect(before).toMatchObject({
      triggered_at: '2026-11-02T07:05:00Z',
      drafted_at: '2026-11-02T07:10:00Z',
      approved_at: null,
      sent_at: null,
      ics_uid: null,
      trace_id: expectedTraceId
    })
    await inOrg(A, async (tx) => {
      await transition(
        tx,
        made.review.bundleId,
        { bundle: 'approved', calls: { [first]: 'rejected', [second]: 'approved' } },
        at('2026-11-02T07:12:00Z')
      )
      await markSending(tx, made.review.bundleId, [second], at('2026-11-02T07:12:00Z'))
      await transition(tx, made.review.bundleId, { calls: { [second]: 'sent' } }, at('2026-11-02T07:13:00Z'))
    })
    const after = await json<CallDetail>(read(as(), `/v1/calls/${second}`))
    expect(after).toMatchObject({
      state: 'sent',
      triggered_at: '2026-11-02T07:05:00Z',
      drafted_at: '2026-11-02T07:10:00Z',
      approved_at: '2026-11-02T07:12:00Z',
      sent_at: '2026-11-02T07:13:00Z'
    })
    expect(after.permalink).toBe(`https://api.skyclause.m1ku.tech/c/${second}`)
  })

  test('D33: the permalink is on the marketing origin only when HOST_MODE is multi', async () => {
    const [, second] = made.review.callIds as [string, string]
    try {
      vi.stubEnv('MARKETING_ORIGIN', 'https://skyclause.m1ku.tech')
      vi.stubEnv('HOST_MODE', 'single')
      expect((await json<CallDetail>(read(as(), `/v1/calls/${second}`))).permalink).toBe(
        `https://api.skyclause.m1ku.tech/c/${second}`
      )
      vi.stubEnv('HOST_MODE', 'multi')
      expect((await json<CallDetail>(read(as(), `/v1/calls/${second}`))).permalink).toBe(
        `https://skyclause.m1ku.tech/c/${second}`
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('window titles go to members only', async () => {
    const [first] = made.normal.callIds
    expect((await json<CallDetail>(read(as(), `/v1/calls/${first}`))).window!.title).toBe('Lecture 3A')
    const guest = await json<CallDetail>(read(asGuestToken({ org: A }), `/v1/calls/${first}`))
    expect(guest.window).toMatchObject({ id: made.windows[0], title: '' })
  })
})

describe('GET /v1/calls/{id}/explanation', () => {
  test('the clauses with their CEL and wording, the inputs read, the MET warning verbatim and the trace', async () => {
    const capture = JSON.parse(
      readFileSync(new URL('./fixtures/weather-warning-20261105T1313Z.json', import.meta.url), 'utf8')
    )
    const thunderstorms = capture[2]
    const { callId, readingId } = await inOrg(A, async (tx) => {
      const warnings = await makeSource(tx, { kind: 'met_warning', url: 'https://api.data.gov.my/weather/warning/' })
      // #122 adds the UTC bounds to the stored record; MET publishes MYT without an offset.
      const r = await makeReading(tx, {
        sourceId: warnings.id,
        metric: 'warning',
        unit: null,
        value: null,
        observedAt: at('2026-11-05T13:05:00Z'),
        valueJson: { ...thunderstorms, valid_from_utc: '2026-11-05T13:00:00Z', valid_to_utc: '2026-11-05T17:00:00Z' }
      })
      const gauge = {
        ...site['site.rain_60m_mm'],
        age_s: 600,
        source_ids: [],
        source_url: null,
        reading_ids: [],
        observed_at: '2026-11-02T07:00:00Z'
      }
      const warning = {
        name: 'site.met_warning_in_force',
        value: true,
        unit: '',
        state: 'fresh',
        since: null,
        age_s: 1800,
        source_ids: [warnings.id],
        source_url: null,
        reading_ids: [r.id],
        observed_at: '2026-11-05T13:05:00Z'
      }
      const r2 = await runOf(tx, made.scene, at('2026-11-05T13:06:00Z'))
      await makeRunStep(tx, {
        runId: r2.id,
        step: 'draft',
        status: 'done',
        output: { detail: 'wording drafted' },
        startedAt: at('2026-11-05T13:06:01Z'),
        finishedAt: at('2026-11-05T13:06:03.500Z')
      })
      const w = await windowOf(tx, made.scene, at('2026-11-05T13:30:00Z'), at('2026-11-05T14:00:00Z'))
      const b = await createBundle(tx, {
        runId: r2.id,
        pack: 'sky',
        draftOnly: false,
        triggeredAt: r2.triggeredAt,
        now: at('2026-11-05T13:07:00Z'),
        calls: [
          callDraft({
            windowId: w.id,
            ...storm,
            shadow: {
              scope: { kind: 'window', id: w.id },
              pack: 'sky',
              mode: 'commute_disruption',
              watch: false,
              no_call: null,
              recommendations: [],
              clauses: [
                { key: 'storm_confirmed', result: 'fired', blocked_by: [], inputs: [gauge, warning] },
                { key: 'storm_watch', result: 'fired', blocked_by: [], inputs: [warning] }
              ],
              open_from: null
            }
          })
        ]
      })
      return { callId: b.callIds[0]!, readingId: r.id }
    })
    const body = await json<CallExplanation>(read(as(), `/v1/calls/${callId}/explanation`))
    expect(body.clauses.map((c) => [c.key, c.cel.length > 0])).toEqual([
      ['storm_confirmed', true],
      ['storm_watch', true]
    ])
    expect(body.clauses[0]!.wording.en).toMatch(/Storm confirmed/i)
    expect(body.inputs.map((i) => i.name)).toEqual(['site.rain_60m_mm', 'site.met_warning_in_force'])
    expect(body.warnings).toEqual([
      {
        reading_id: readingId,
        text: thunderstorms.text_bm,
        gloss: thunderstorms.text_en,
        valid_from: '2026-11-05T13:00:00Z',
        valid_to: '2026-11-05T17:00:00Z'
      }
    ])
    expect(body.trace).toEqual([{ step: 'draft', duration_ms: 2500, inputs: [], detail: 'wording drafted' }])
  })
})

describe('GET /v1/projects/{id}/bundles/stream', () => {
  test('resumes after Last-Event-ID without a gap: the hub replays from afterSeq, then live events follow', async () => {
    const { projectId } = made.scene
    const stored = await asLogin('postgres', async (client) => {
      const { rows } = await client.query<EventEnvelope & { seq: number }>(
        `SELECT id, type, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at, org_id, project_id, seq::int AS seq, data
         FROM domain_event WHERE project_id = $1 ORDER BY seq`,
        [projectId]
      )
      return rows
    })
    expect(stored.length).toBeGreaterThanOrEqual(3)
    let live: ((e: EventEnvelope & { seq: number }) => void) | undefined
    vi.mocked(listenEvents).mockImplementation((q, cb) => {
      for (const event of stored.filter((e) => e.seq > (q.afterSeq ?? Infinity))) cb(event)
      live = cb
      return () => {}
    })
    // The client goes away through the request's signal, as a closed connection does.
    const gone = new AbortController()
    const response = await v1.fetch(
      new Request(`https://api.skyclause.m1ku.tech/v1/projects/${projectId}/bundles/stream`, {
        headers: { 'Skyclause-Organization': A, 'Last-Event-ID': '1' },
        signal: gone.signal
      }),
      { principal: as() }
    )
    expect(response.status).toBe(200)
    expect(vi.mocked(listenEvents)).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: testOrg(A).id,
        projectIds: [projectId],
        afterSeq: 1,
        types: expect.arrayContaining(['bundle.drafted', 'bundle.expired'])
      }),
      expect.any(Function)
    )
    const next = await inOrg(A, (tx) =>
      emitEvent(tx, {
        projectId,
        type: 'bundle.escalated',
        data: {
          bundle_id: made.review.bundleId,
          pack: 'sky',
          state: 'escalated',
          call_ids: made.review.callIds,
          sla_due_at: null,
          level: 'next_approver'
        }
      })
    )
    live!({ ...stored[0]!, id: next.id, seq: next.seq, type: 'bundle.escalated' })
    const reader = response.body!.getReader()
    let text = ''
    while (!text.includes(`id: ${next.seq}\n`)) text += new TextDecoder().decode((await reader.read()).value)
    gone.abort()
    expect((await reader.read()).done).toBe(true)
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]))
    expect(ids).toEqual([...stored.map((e) => e.seq).filter((s) => s > 1), next.seq])
    expect(text).toContain(`event: ${stored[1]!.type}\n`)
  })
})

describe('#521: recipients, notices and reasons go to members only', () => {
  const NOTICES = [{ language: 'en' as const, subject: 'Storm over Lecture 3A', body: 'Allow time to reach the hall.' }]
  const REASON = 'Storm confirmed at the gauge'
  const DISMISSED = 'Lab moved indoors'
  let scene: { projectId: string; bundleId: string; callId: string; subscriberId: string; declaredBy: string }
  beforeAll(async () => {
    scene = await inOrg(A, async (tx) => {
      const s = await bundleScene(tx)
      const w = await windowOf(tx, s, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'), 'Lecture 3A')
      const missed = await windowOf(tx, s, at('2026-11-02T07:30:00Z'), at('2026-11-02T07:45:00Z'), 'Lab 2')
      const subscriber = await makeSubscriber(tx, { projectId: s.projectId, language: 'en' })
      const r = await runOf(tx, s, at('2026-11-02T07:05:00Z'))
      const b = await createBundle(tx, {
        runId: r.id,
        pack: 'sky',
        draftOnly: false,
        calls: [callDraft({ windowId: w.id, ...storm, recipients: [subscriber.id], notices: NOTICES, reason: REASON })],
        missing: [
          {
            windowId: missed.id,
            nightId: null,
            shadow: callDraft({ windowId: missed.id, ...storm }).shadow,
            recipients: [subscriber.id]
          }
        ],
        triggeredAt: r.triggeredAt,
        now: at('2026-11-02T07:10:00Z')
      })
      const callId = b.callIds[0]!
      await makeNotice(tx, { projectId: s.projectId, callId, subscriberId: subscriber.id })
      const by = '0190f5a0-0000-7000-8000-000000000002'
      await dismissMissing(
        tx,
        b.bundleId,
        { windowId: missed.id },
        { reason: DISMISSED, by },
        at('2026-11-02T07:12:00Z')
      )
      return {
        projectId: s.projectId,
        bundleId: b.bundleId,
        callId,
        subscriberId: subscriber.id,
        declaredBy: w.declaredBy
      }
    })
  })
  const paths = () => ({
    getBundle: `/v1/bundles/${scene.bundleId}`,
    listProjectBundles: `/v1/projects/${scene.projectId}/bundles`,
    listProjectCalls: `/v1/projects/${scene.projectId}/calls`,
    getCall: `/v1/calls/${scene.callId}`
  })
  const readAll = async (principal: Principal) => {
    const out: Record<string, { text: string; body: Record<string, unknown> }> = {}
    for (const [operationId, path] of Object.entries(paths())) {
      const response = await read(principal, path)
      expect(response.status, operationId).toBe(200)
      const text = await response.text()
      out[operationId] = { text, body: JSON.parse(text) as Record<string, unknown> }
    }
    return out as Record<keyof ReturnType<typeof paths>, { text: string; body: Record<string, unknown> }>
  }
  const blank = { recipients: [], notices: [], reason: '' }

  test('a member reads them all', async () => {
    const seen = await readAll(as())
    const whole = { recipients: [scene.subscriberId], notices: NOTICES, reason: REASON }
    expect(seen.getBundle.body).toMatchObject({
      calls: [whole],
      missing: [{ recipients: [scene.subscriberId], reason: DISMISSED }]
    })
    expect(seen.listProjectBundles.body).toMatchObject({ data: [{ calls: [whole], missing: [{ reason: DISMISSED }] }] })
    expect(seen.listProjectCalls.body).toMatchObject({ data: [whole] })
    expect(seen.getCall.body).toMatchObject({
      ...whole,
      deliveries: [{ recipient_id: scene.subscriberId }],
      window: { title: 'Lecture 3A', declared_by: scene.declaredBy }
    })
  })

  test.each([
    {
      reader: 'a reviewer share link',
      as: () => asShareLink({ org: A, projectId: scene.projectId, access: 'reviewer' })
    },
    { reader: 'a guest token', as: () => asGuestToken({ org: A }) },
    {
      reader: 'a link-bound OAuth grant',
      as: () =>
        asOAuth({ org: A, role: null, resource: 'api', projectIds: [scene.projectId], shareLinkId: randomUUID() })
    },
    { reader: 'a session with the guest role', as: () => asSession({ org: A, role: 'guest' }) },
    { reader: 'a guest’s API key', as: () => asApiKey({ org: A, role: 'guest', scopes: ['read'] }) }
  ])('$reader reads the bundle and its calls without them', async ({ as: reader }) => {
    const seen = await readAll(reader())
    const missing = [{ window_id: expect.any(String), resolution: 'dismissed', recipients: [], reason: null }]
    expect(seen.getBundle.body).toMatchObject({ id: scene.bundleId, calls: [blank], missing })
    expect(seen.listProjectBundles.body).toMatchObject({ data: [{ id: scene.bundleId, calls: [blank], missing }] })
    expect(seen.listProjectCalls.body).toMatchObject({ data: [{ id: scene.callId, ...blank }] })
    expect(seen.getCall.body).toMatchObject({
      id: scene.callId,
      ...blank,
      deliveries: [],
      window: { title: '', declared_by: '' }
    })
    for (const { text } of Object.values(seen)) {
      for (const value of [scene.subscriberId, scene.declaredBy, 'Lecture 3A', NOTICES[0]!.body, REASON, DISMISSED]) {
        expect(text).not.toContain(value)
      }
    }
  })
})

describe('#521 isMember: the PRD columns Owner to Viewer, never Guest, a share link or a link-bound grant', () => {
  const session = (role: Role | null, isGuest = false) =>
    ({ ...asSession({ org: A, role: 'viewer' }), orgId: testOrg(A).id, role, isGuest }) as Principal
  test.each([
    ...(['owner', 'admin', 'approver', 'editor', 'viewer'] as const).flatMap((role) => [
      { who: `a ${role}’s session`, principal: session(role), member: true },
      { who: `a ${role}’s API key`, principal: asApiKey({ org: A, role, scopes: ['read'] }), member: true },
      { who: `a ${role}’s OAuth grant`, principal: asOAuth({ org: A, role }), member: true }
    ]),
    { who: 'a session with the guest role', principal: session('guest'), member: false },
    { who: 'an anonymous guest’s session', principal: session('guest', true), member: false },
    { who: 'a session with no role here', principal: session(null), member: false },
    { who: 'a guest’s API key', principal: asApiKey({ org: A, role: 'guest', scopes: ['read'] }), member: false },
    { who: 'a guest’s OAuth grant', principal: asOAuth({ org: A, role: 'guest' }), member: false },
    {
      who: 'a link-bound OAuth grant',
      principal: asOAuth({ org: A, role: null, shareLinkId: randomUUID() }),
      member: false
    },
    { who: 'a guest token', principal: asGuestToken({ org: A }), member: false },
    { who: 'a reviewer share link', principal: asShareLink({ org: A, access: 'reviewer' }), member: false },
    { who: 'a device', principal: asDevice({ org: A }), member: false },
    { who: 'a system job', principal: asSystem('test'), member: false }
  ])('$who: $member', ({ principal, member }) => {
    expect(isMember(principal)).toBe(member)
  })
})

describe('every operation: a cross-organisation 404 and a denial below project.view (#79 §7)', () => {
  const operations = () => ({
    listProjectBundles: { id: other.projectId },
    streamBundles: { id: other.projectId },
    getBundle: { id: other.bundleId },
    listProjectCalls: { id: other.projectId },
    getCall: { id: other.callId },
    getCallExplanation: { id: other.callId }
  })
  for (const operationId of [
    'listProjectBundles',
    'streamBundles',
    'getBundle',
    'listProjectCalls',
    'getCall',
    'getCallExplanation'
  ]) {
    test(`${operationId} answers 404 for another organisation’s rows and 403 to a key without read`, async () => {
      const params = operations()[operationId as keyof ReturnType<typeof operations>]
      await crossOrgCase(operationId, { app: v1, as: as(), org: A, params }).run()
      const path = {
        listProjectBundles: `/v1/projects/${made.scene.projectId}/bundles`,
        streamBundles: `/v1/projects/${made.scene.projectId}/bundles/stream`,
        getBundle: `/v1/bundles/${made.review.bundleId}`,
        listProjectCalls: `/v1/projects/${made.scene.projectId}/calls`,
        getCall: `/v1/calls/${made.review.callIds[0]}`,
        getCallExplanation: `/v1/calls/${made.review.callIds[0]}/explanation`
      }[operationId]!
      const denied = await read(asApiKey({ org: A, role: 'owner', scopes: ['draft'] }), path)
      expect(denied.status).toBe(403)
    })
  }

  test('an OAuth grant limited to other projects gets 404 for this one', async () => {
    const grant = asOAuth({ org: A, role: 'viewer', projectIds: [other.projectId] })
    expect((await read(grant, `/v1/bundles/${made.review.bundleId}`)).status).toBe(404)
    expect((await read(grant, `/v1/projects/${made.scene.projectId}/calls`)).status).toBe(404)
  })
})
