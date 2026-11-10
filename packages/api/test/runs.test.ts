// #151: c-run-orchestrator's `/v1` operations on the #79 §7 test database, through the mounted app with f-api's harness:
// "Ask for a call" (POST, budgeted for guests, GST-8), the run list and a run with its trace (CAL-1, CAL-5), a
// cross-organisation 404 and a denial below each statement (§7).
import { randomUUID } from 'node:crypto'
import type { BudgetGate, Page, Principal, Run } from '@skyclause/contracts'
import { budgetGate, createBundle, projectPack, run, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { bundleScene, callDraft, runOf, windowOf, type Scene } from '@skyclause/db/test/bundles/scene'
import { makeOrganization, makeProject, makeRun, makeRunStep } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WithTenant } from '../src/tenancy'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

// d-guest-rules' BudgetGate (#181) isn't built: a double stands in, counting each consume.
vi.mock('@skyclause/db', async (original) => ({
  ...(await original<object>()),
  budgetGate: { consume: vi.fn() }
}))
const consume = vi.mocked((budgetGate as BudgetGate).consume)

const A = 'runs-a'
const B = 'runs-b'
const { v1 } = createTestApi({ deps: testDeps({ withTenant: withTenant as unknown as WithTenant }) })
const inOrg = <T>(slug: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(slug).id, principal: systemPrincipal('test') }, fn)
const editor = () => asSession({ org: A, role: 'editor' })
const json = async <T>(response: Promise<Response>) => (await (await response).json()) as T
const send = (as: Principal, projectId: string, body: unknown, key: string = randomUUID()) =>
  apiRequest(v1, {
    as,
    method: 'POST',
    path: `/v1/projects/${projectId}/runs`,
    org: as.kind === 'session' ? A : undefined,
    body,
    idempotencyKey: key
  })
const read = (as: Principal, path: string) =>
  apiRequest(v1, { as, method: 'GET', path, org: as.kind === 'session' ? A : undefined })

/** A project of `slug` with its Sky pack enabled and one window. */
async function skyProject(slug: string) {
  return inOrg(slug, async (tx) => {
    const scene = await bundleScene(tx)
    await tx.update(projectPack).set({ enabled: true }).where(eq(projectPack.projectId, scene.projectId))
    const w = await windowOf(tx, scene, new Date('2026-11-09T07:30:00Z'), new Date('2026-11-09T09:00:00Z'))
    return { ...scene, windowId: w.id }
  })
}

let a: Scene & { windowId: string }
let b: Scene & { windowId: string }
beforeAll(async () => {
  for (const slug of [A, B]) await makeOrganization({ id: testOrg(slug).id, slug })
  a = await skyProject(A)
  b = await skyProject(B)
})
beforeEach(() => {
  consume.mockReset()
  consume.mockResolvedValue({ ok: true })
})

describe('POST /v1/projects/{id}/runs', () => {
  test('a member’s request answers 202 with the queued run; a replay of its key answers the same', async () => {
    const as = editor()
    const key = randomUUID()
    const first = await send(as, a.projectId, { pack: 'sky', window_ids: [a.windowId] }, key)
    expect(first.status).toBe(202)
    const body = (await first.json()) as Run
    expect(body).toMatchObject({
      project_id: a.projectId,
      pack: 'sky',
      trigger: 'request',
      dedupe_key: `request:${key}`,
      status: 'queued',
      window_ids: [a.windowId],
      // Null until the run's snapshot and shadow steps set them.
      sheet_version_id: null,
      snapshot_id: null,
      verdict_hash: null,
      model: null,
      fallback_used: false
    })
    const again = await send(as, a.projectId, { pack: 'sky', window_ids: [a.windowId] }, key)
    expect(again.status).toBe(202)
    expect(await again.json()).toEqual(body)
    const [row] = await inOrg(A, (tx) => tx.select().from(run).where(eq(run.id, body.id)))
    expect(row!.requestedBy).toEqual({ kind: 'session', account_id: (as as { accountId: string }).accountId })
    // A member's request is budgeted once, by the run's own step before drafting (#181).
    expect(consume).not.toHaveBeenCalled()
    await inOrg(A, (tx) => tx.update(run).set({ status: 'drafted' }).where(eq(run.id, body.id)))
  })

  test('GST-8: a guest’s 21st request in a day answers 429 budget-exhausted with the reset time in MYT', async () => {
    const guest = asSession({ org: A, role: 'viewer', guest: true })
    let used = 0
    consume.mockImplementation(async () =>
      ++used <= 20 ? { ok: true } : { ok: false, resetsAt: '2026-11-08T16:00:00Z' }
    )
    for (let i = 0; i < 20; i++) {
      const ok = await send(guest, a.projectId, { pack: 'sky', window_ids: [a.windowId] })
      expect(ok.status).toBe(202)
    }
    const refused = await send(guest, a.projectId, { pack: 'sky', window_ids: [a.windowId] })
    expect(refused.status).toBe(429)
    // The harness clock reads 2026-11-08T02:00Z: 14 hours to the next 00:00 MYT.
    expect(refused.headers.get('Retry-After')).toBe(String(14 * 3600))
    expect(await refused.json()).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/budget-exhausted',
      status: 429,
      resets_at: '2026-11-08T16:00:00Z',
      detail: 'No runs are left today. The budget resets at 9 November 2026, 00:00 MYT.'
    })
    expect(consume).toHaveBeenCalledTimes(21)
    expect(consume.mock.calls[0]![2]).toBe('run')
    await inOrg(A, (tx) => tx.update(run).set({ status: 'drafted' }).where(eq(run.projectId, a.projectId)))
  })

  test('422 for a window outside the project, a disabled pack, or an archived project', async () => {
    const outside = await send(editor(), a.projectId, { pack: 'sky', window_ids: [b.windowId] })
    expect(outside.status).toBe(422)
    expect(await outside.json()).toMatchObject({ errors: [{ in: 'body', pointer: '/window_ids/0' }] })

    const crowd = await send(editor(), a.projectId, { pack: 'crowd' })
    expect(crowd.status).toBe(422)
    expect(await crowd.json()).toMatchObject({ errors: [{ in: 'body', pointer: '/pack' }] })

    const archived = await inOrg(A, async (tx) => {
      const p = await makeProject(tx, { archivedAt: new Date() })
      await tx.insert(projectPack).values({ orgId: tx.orgId!, projectId: p.id, pack: 'sky', enabled: true })
      return p
    })
    const refused = await send(editor(), archived.id, { pack: 'sky' })
    expect(refused.status).toBe(422)
    expect(await refused.json()).toMatchObject({ detail: 'The project is archived, so it starts no runs.' })
  })

  test('a key another organisation’s run already holds answers 422 idempotency-mismatch', async () => {
    const key = randomUUID()
    await inOrg(B, (tx) => makeRun(tx, { projectId: b.projectId, dedupeKey: `request:${key}`, status: 'drafted' }))
    const clash = await send(editor(), a.projectId, { pack: 'sky' }, key)
    expect(clash.status).toBe(422)
    expect(await clash.json()).toMatchObject({ type: 'https://docs.skyclause.m1ku.tech/problems/idempotency-mismatch' })
  })
})

describe('POST /v1/projects/{id}/runs: keys', () => {
  test('a key reused for another project of the organisation answers 422 idempotency-mismatch', async () => {
    const other = await skyProject(A)
    const key = randomUUID()
    expect((await send(editor(), other.projectId, { pack: 'sky' }, key)).status).toBe(202)
    const reused = await send(editor(), a.projectId, { pack: 'sky' }, key)
    expect(reused.status).toBe(422)
    expect(await reused.json()).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/idempotency-mismatch'
    })
  })

  test('a guest’s key that already has a run spends no budget', async () => {
    const key = randomUUID()
    const first = await json<Run>(
      send(asSession({ org: A, role: 'viewer', guest: true }), a.projectId, { pack: 'sky' }, key)
    )
    // Another guest credential sends the same key past the idempotency store, whose records are per credential.
    const again = await json<Run>(
      send(asSession({ org: A, role: 'viewer', guest: true }), a.projectId, { pack: 'sky' }, key)
    )
    expect(again.id).toBe(first.id)
    expect(consume).toHaveBeenCalledTimes(1)
    await inOrg(A, (tx) => tx.update(run).set({ status: 'drafted' }).where(eq(run.id, first.id)))
  })
})

describe('GET /v1/projects/{id}/runs and /v1/runs/{id}', () => {
  let normal: { runId: string; bundleId: string }
  let budget: string
  beforeAll(async () => {
    const site = {
      'site.rain_60m_mm': {
        name: 'site.rain_60m_mm',
        value: 0,
        unit: 'mm',
        state: 'fresh',
        since: null,
        ageS: 300,
        sourceIds: [],
        readingIds: [],
        observedAt: '2026-11-02T22:40:00Z'
      }
    }
    normal = await inOrg(A, async (tx) => {
      const scene = await bundleScene(tx, { snapshot: { site } })
      const w = await windowOf(tx, scene, new Date('2026-11-03T01:00:00Z'), new Date('2026-11-03T03:00:00Z'))
      const r = await runOf(tx, scene, new Date('2026-11-02T22:45:00Z'))
      await tx.update(run).set({ trigger: 'schedule', triggerRef: '06:45' }).where(eq(run.id, r.id))
      for (const step of ['snapshot', 'shadow', 'budget', 'draft', 'validate', 'compare', 'persist']) {
        await makeRunStep(tx, { runId: r.id, step, status: 'done', output: {} })
      }
      const made = await createBundle(tx, {
        runId: r.id,
        pack: 'sky',
        draftOnly: false,
        calls: [callDraft({ windowId: w.id })],
        triggeredAt: r.triggeredAt
      })
      return { runId: r.id, bundleId: made.bundleId }
    })
    budget = (
      await inOrg(A, (tx) =>
        makeRun(tx, { projectId: a.projectId, status: 'no_draft', reason: 'budget', verdictHash: 'verdicts' })
      )
    ).id
  })

  test('CAL-1 and CAL-5: an all-Normal 06:45 run names its trigger, project and pack; its trace reads "Normal; N inputs fresh"', async () => {
    const response = await read(editor(), `/v1/runs/${normal.runId}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Run & Record<string, unknown>
    expect(body).toMatchObject({
      id: normal.runId,
      trigger: 'schedule',
      trigger_ref: '06:45',
      pack: 'sky',
      status: 'drafted',
      bundle_id: normal.bundleId,
      triggered_at: '2026-11-02T22:45:00Z',
      trace: {
        text: 'Normal; 1 inputs fresh',
        inputs: [{ name: 'site.rain_60m_mm', state: 'fresh', age_s: 300 }]
      }
    })
    expect((body.trace as { steps: Array<{ step: string }> }).steps.map((s) => s.step)).toEqual([
      'snapshot',
      'shadow',
      'budget',
      'draft',
      'validate',
      'compare',
      'persist'
    ])
  })

  test('a run over budget reads "No draft: budget" and keeps its shadow verdict', async () => {
    const body = await json<Run & { trace: { text: string } }>(read(editor(), `/v1/runs/${budget}`))
    expect(body).toMatchObject({ status: 'no_draft', reason: 'budget', verdict_hash: 'verdicts', bundle_id: null })
    expect(body.trace.text).toBe('No draft: budget')
  })

  test('the project’s runs, newest first, a page at a time', async () => {
    const first = await json<Page<Run>>(
      apiRequest(v1, {
        as: editor(),
        method: 'GET',
        path: `/v1/projects/${a.projectId}/runs`,
        org: A,
        query: { limit: '2' }
      })
    )
    expect(first.data).toHaveLength(2)
    expect(first.data.every((r) => r.project_id === a.projectId)).toBe(true)
    expect(first.data[0]!.id > first.data[1]!.id).toBe(true) // UUIDv7: newest first
    const rest = await json<Page<Run>>(
      apiRequest(v1, {
        as: editor(),
        method: 'GET',
        path: `/v1/projects/${a.projectId}/runs`,
        org: A,
        query: { limit: '200', cursor: first.next_cursor! }
      })
    )
    expect(rest.data.map((r) => r.id)).not.toContain(first.data[0]!.id)
    expect(rest.data.length).toBeGreaterThan(0)
  })
})

describe('§7: a cross-organisation 404 and a denial below the statement', () => {
  test('createRun: 404 for another organisation’s project; 403 for a Viewer', async () => {
    await crossOrgCase('createRun', {
      app: v1,
      as: editor(),
      org: A,
      params: { id: b.projectId },
      body: { pack: 'sky' }
    }).run()
    expect((await send(asSession({ org: A, role: 'viewer' }), a.projectId, { pack: 'sky' })).status).toBe(403)
  })

  test('listRuns and getRun: 404 for another organisation’s rows; 403 for a key without read', async () => {
    const other = await inOrg(B, (tx) => makeRun(tx, { projectId: b.projectId, status: 'drafted' }))
    const mine = await inOrg(A, (tx) => makeRun(tx, { projectId: a.projectId, status: 'drafted' }))
    await crossOrgCase('listRuns', { app: v1, as: editor(), org: A, params: { id: b.projectId } }).run()
    await crossOrgCase('getRun', { app: v1, as: editor(), org: A, params: { id: other.id } }).run()
    const key = asApiKey({ org: A, role: 'owner', scopes: ['draft'] })
    expect((await read(key, `/v1/projects/${a.projectId}/runs`)).status).toBe(403)
    expect((await read(key, `/v1/runs/${mine.id}`)).status).toBe(403)
  })
})
