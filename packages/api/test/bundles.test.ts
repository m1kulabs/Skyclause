// #150: c-bundle-lifecycle's `/v1` reads on the #79 §7 test database, through the mounted app with f-api's harness:
// CAL-5's trace line, CAL-12's four instants, filters and paging, the stream's resume, a cross-organisation 404 and a
// denial below `project.view` on each operation.
import { readFileSync } from 'node:fs'
import type { EventEnvelope, Page, Principal } from '@skyclause/contracts'
import {
  createBundle,
  emitEvent,
  listenEvents,
  markSending,
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
  makeSource
} from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { recipientsByLanguage } from '@skyclause/delivery'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import type { BundleDetail, BundleView, CallDetail, CallExplanation, CallView } from '../src/services/bundles'
import type { WithTenant } from '../src/tenancy'
import {
  apiRequest,
  asApiKey,
  asGuestToken,
  asOAuth,
  asSession,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg
} from './harness'

// The SSE hub (#175) and c-notice-templates' recipient counts (#152) aren't built: doubles stand in for both.
vi.mock('@skyclause/db', async (original) => ({ ...(await original<object>()), listenEvents: vi.fn() }))
vi.mock('@skyclause/delivery', async (original) => ({
  ...(await original<object>()),
  recipientsByLanguage: vi.fn(async () => ({ en: 2, ms: 1 }))
}))

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
        { windowId: first, ...storm, recipients: ['subscriber-1', 'subscriber-2', 'subscriber-3'] },
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
    expect(body).toMatchObject({ state: 'closed', needs_review_at: null, draft_only: false, trigger: 'crossing' })
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

  test('calls come newest drafted first and filter by mode, state and local drafting date', async () => {
    const path = `/v1/projects/${made.scene.projectId}/calls`
    const all = await json<Page<CallView>>(read(as(), path))
    expect(all.data).toHaveLength(4)
    expect(all.data[0]!.drafted_at).toBe('2026-11-02T07:10:00Z')
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
    const [, second] = made.review.callIds as [string, string]
    const before = await json<CallDetail>(read(as(), `/v1/calls/${second}`))
    expect(before).toMatchObject({
      triggered_at: '2026-11-02T07:05:00Z',
      drafted_at: '2026-11-02T07:10:00Z',
      approved_at: null,
      sent_at: null
    })
    await inOrg(A, async (tx) => {
      await transition(
        tx,
        made.review.bundleId,
        { bundle: 'approved', calls: { [second]: 'approved' } },
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
