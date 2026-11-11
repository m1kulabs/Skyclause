import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { createHash, randomUUID } from 'node:crypto'
import {
  canonicalHash,
  check,
  evaluate,
  snapshotAt,
  type ReadingHistory,
  type SheetInput,
  type Window
} from '@skyclause/clauses'
import skyDefault from '@skyclause/clauses/defaults/sky.json'
import {
  createProjectRecord,
  withTenant,
  run,
  runStep,
  window,
  clauseSheet,
  sheetVersion,
  type Tx
} from '@skyclause/db'
import {
  makeOrganization,
  makeRun,
  makeWindow,
  makeRunStep,
  makeBundle,
  makeCall,
  makeClauseSheet,
  makeSheetVersion
} from '../../db/test/factories'
import { asLogin, expectOneAudit, expectEvent, expectLedgerEntry, refusal, memberOf } from '../../db/test/harness'
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { TEST_REGISTRY } from '../../clauses/test/test-helpers'
import { NotBuiltError as EngineNotBuiltError } from '../../clauses/src/not-built'
import { NotBuiltError, type Principal } from '@skyclause/contracts'
import { wireVerdict } from '../src/services/approvals/recheck'
import * as services from '../src/services/clause-sheets'

let orgId: string
const now = new Date('2026-11-10T00:00:00Z')
const principal = () => ({ ...memberOf(orgId), authenticatedAt: now })
const access = { can: () => true, now }
const inOrg = <T>(fn: (ctx: { tx: Tx; principal: ReturnType<typeof principal> }) => Promise<T>) => {
  const p = principal()
  return withTenant({ orgId, principal: p }, (tx) => fn({ tx, principal: p }))
}
async function project() {
  return inOrg((ctx) =>
    createProjectRecord(
      ctx.tx,
      {
        name: 'Clause services',
        slug: `clauses-${randomUUID().slice(0, 8)}`,
        siteName: 'APU',
        siteLat: 3.0553,
        siteLon: 101.7005,
        packs: ['sky']
      },
      now
    )
  )
}
const raw = (): SheetInput => structuredClone(skyDefault) as SheetInput
beforeAll(async () => {
  orgId = (await makeOrganization({ slug: 'api-clause-services' })).id
})
beforeEach(() =>
  services.setClauseSheetPorts({ registry: { load: async () => TEST_REGISTRY }, snapshots: null, recordedAt: null })
)
afterEach(() => services.setClauseSheetPorts({ registry: null, snapshots: null, recordedAt: null }))

test('missing_teaching_line_saves_but_publish_is_422', async () => {
  const created = await project()
  const id = created.sheets.find((s) => s.pack === 'sky')!.id
  const content = raw()
  content.clauses.find((c) => c.key === 'haze_severe')!.wording = { en: 'Hazardous haze.' }
  const saved = await inOrg((ctx) => services.createClauseSheetDraft(ctx, { id, content, ...access }))
  expect(saved.content).toEqual(content)
  expect(saved.content_hash).toBe(canonicalHash(content))
  expect(saved.publishable).toBe(false)
  expect(saved.check?.issues.some((i) => i.clause_key === 'haze_severe')).toBe(true)
  await expect(
    inOrg((ctx) => services.publishClauseSheet(ctx, { id, draft_id: saved.id, preview_hash: 'invalid', ...access }))
  ).rejects.toMatchObject({ status: 422, slug: 'not-publishable' })
})

test('hard_cel_issues_save_as_nonpublishable', async () => {
  const created = await project()
  const id = created.sheets[0]!.id
  const content = raw()
  content.clauses[0]!.when = 'does_not_exist >'
  expect(check(content, TEST_REGISTRY).ok).toBe(false)
  const saved = await inOrg((ctx) => services.createClauseSheetDraft(ctx, { id, content, ...access }))
  expect(saved.content).toEqual(content)
  expect(saved.check?.ok).toBe(false)
  expect(saved.publishable).toBe(false)
})

test('fresh_initialized_project_publishes_human_version_two_without_runs', async () => {
  const created = await project()
  const id = created.sheets.find((s) => s.pack === 'sky')!.id
  const old = await inOrg((ctx) => services.getClauseSheetVersion(ctx, { id, n: 1, ...access }))
  const saved = await inOrg((ctx) => services.createClauseSheetDraft(ctx, { id, content: raw(), ...access }))
  const preview = await inOrg((ctx) =>
    services.getClauseSheetPublishPreview(ctx, { id, draft_id: saved.id, ...access })
  )
  expect(preview.replay).toMatchObject({ label: 'replay', calls_evaluated: 0, calls_changed: 0 })
  const published = await inOrg((ctx) =>
    services.publishClauseSheet(ctx, { id, draft_id: saved.id, preview_hash: preview.preview_hash, ...access })
  )
  expect(published.n).toBe(2)
  expect(await inOrg((ctx) => services.getClauseSheetVersion(ctx, { id, n: 1, ...access }))).toEqual(old)
})

const tEval = '2026-11-02T07:05:00Z'
function capturedHistory(): ReadingHistory {
  const bytes = readFileSync(
    new URL('../../clauses/test/fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url)
  )
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95'
  )
  const captured = JSON.parse(bytes.toString('utf8')) as { data: Array<{ timestamp: string; rf: number }> }
  return {
    sources: [
      {
        id: '0232901RF',
        kind: 'jps_rain',
        cadenceS: 300,
        staleAfterS: 600,
        freshness: 'observed',
        probation: false,
        meta: {}
      }
    ],
    polls: [],
    readings: captured.data
      .filter((r) => r.timestamp.startsWith('2026-11-02T'))
      .map((r) => {
        const observedAt = new Date(`${r.timestamp}+08:00`).toISOString().replace('.000Z', 'Z')
        return {
          id: `0232901RF:rain_5m_mm:${observedAt}`,
          sourceId: '0232901RF',
          metric: 'rain_5m_mm',
          observedAt,
          receivedAt: new Date(Date.parse(observedAt) + 300000).toISOString().replace('.000Z', 'Z'),
          value: r.rf,
          valueText: null,
          valueJson: null,
          itemKey: observedAt,
          revision: 1
        }
      })
  }
}
const rainSheet = (): SheetInput => ({
  pack: 'sky',
  clauses: raw().clauses.filter((c) => ['storm_confirmed', 'flash_flood_risk', 'silent_input'].includes(c.key))
})
async function recorded() {
  return inOrg(async (ctx) => {
    const sheet = await makeClauseSheet(ctx.tx)
    const v1 = await makeSheetVersion(ctx.tx, {
      sheetId: sheet.id,
      status: 'published',
      n: 1,
      content: rainSheet(),
      contentHash: canonicalHash(rainSheet())
    })
    sheet.liveVersionId = v1.id
    await ctx.tx.update(clauseSheet).set({ liveVersionId: v1.id }).where(eq(clauseSheet.id, sheet.id))
    const w = await makeWindow(ctx.tx, {
      projectId: sheet.projectId,
      kind: 'commute_wave',
      startsAt: new Date('2026-11-02T07:30:00Z'),
      endsAt: new Date('2026-11-02T07:30:00Z')
    })
    const windows: Window[] = [
      {
        id: w.id,
        startsAt: w.startsAt.toISOString().replace('.000Z', 'Z'),
        endsAt: w.endsAt.toISOString().replace('.000Z', 'Z'),
        kind: w.kind,
        tz: w.tz
      }
    ]
    // A labelled captured-gauge replay pins the three rainfall clauses, exactly as the engine replay test.
    const checked = check(rainSheet(), TEST_REGISTRY).sheet!
    const snapshot = snapshotAt(capturedHistory(), TEST_REGISTRY, sheet.projectId, 'sky', tEval)
    expect(snapshot.site['site.rain_60m_mm']?.value).toBe(39.0)
    const verdicts = evaluate(checked, snapshot, windows, tEval)
    expect(verdicts.windows[0]!.mode).toBe('commute_disruption')
    const r = await makeRun(ctx.tx, {
      projectId: sheet.projectId,
      sheetVersionId: sheet.liveVersionId,
      status: 'drafted',
      triggeredAt: new Date(tEval),
      windowIds: [w.id],
      verdictHash: verdicts.hash
    })
    await makeRunStep(ctx.tx, { runId: r.id, step: 'snapshot', output: { snapshotId: null, snapshot, windows } })
    await makeRunStep(ctx.tx, {
      runId: r.id,
      step: 'shadow',
      output: { versionId: sheet.liveVersionId, n: 1, sheet: checked, verdicts, verdictHash: verdicts.hash }
    })
    const b = await makeBundle(ctx.tx, { runId: r.id })
    const c = await makeCall(ctx.tx, {
      bundleId: b.id,
      windowId: w.id,
      shadow: wireVerdict(verdicts.windows[0]!, new Map()),
      mode: 'outdoor_limited'
    })
    const content = rainSheet()
    content.clauses.find((c) => c.key === 'storm_confirmed')!.when = 'w.rain_max_60m_mm >= 40.0'
    const draft = await services.createClauseSheetDraft(ctx, { id: sheet.id, content, ...access })
    return { id: sheet.id, draft, r, w, c, snapshot, windows, projectId: sheet.projectId }
  })
}
const previewOf = (made: Awaited<ReturnType<typeof recorded>>) =>
  inOrg((ctx) => services.getClauseSheetPublishPreview(ctx, { id: made.id, draft_id: made.draft.id, ...access }))

test('recorded_nov2_gauge_replay_changes_commute_disruption_to_normal', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  expect(preview.replay.label).toBe('replay')
  expect(preview.replay.calls_evaluated).toBe(1)
  expect(preview.replay.changes[0]?.before.mode).toBe('commute_disruption')
  expect(preview.replay.changes[0]?.after.mode).toBe('normal')
})

test('later_clock_alone_keeps_frozen_preview_valid', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  const later = new Date(now.getTime() + 3600000)
  const published = await inOrg((ctx) =>
    services.publishClauseSheet(ctx, {
      id: made.id,
      draft_id: made.draft.id,
      preview_hash: preview.preview_hash,
      ...access,
      now: later
    })
  )
  expect(published.n).toBe(2)
})

test('mutated_current_windows_do_not_change_recorded_replay', async () => {
  const made = await recorded()
  const before = await previewOf(made)
  await inOrg((ctx) =>
    ctx.tx
      .update(window)
      .set({ startsAt: new Date('2026-11-03T07:30:00Z'), endsAt: new Date('2026-11-03T08:30:00Z') })
      .where(eq(window.id, made.w.id))
  )
  expect((await previewOf(made)).preview_hash).toBe(before.preview_hash)
})

test('missing_frozen_windows_or_registry_metadata_blocks_publish', async () => {
  const made = await recorded()
  await inOrg((ctx) =>
    ctx.tx
      .update(runStep)
      .set({ output: { snapshotId: null, snapshot: made.snapshot } })
      .where(eq(runStep.runId, made.r.id))
  )
  await expect(previewOf(made)).rejects.toMatchObject({ status: 422, slug: 'not-publishable' })
})

test('changed_registry_or_run_manifest_returns_preview_stale', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  await inOrg(async (ctx) => {
    const b = await makeBundle(ctx.tx, { runId: made.r.id })
    await makeCall(ctx.tx, { bundleId: b.id, windowId: made.w.id, shadow: made.c.shadow })
  })
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: made.draft.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 409, slug: 'preview-stale' })
})

test('changed_draft_selection_or_live_returns_preview_stale', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  const another = await inOrg((ctx) =>
    services.createClauseSheetDraft(ctx, { id: made.id, content: rainSheet(), ...access })
  )
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: another.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 409, slug: 'preview-stale' })
  const next = await inOrg((ctx) =>
    services.getClauseSheetPublishPreview(ctx, { id: made.id, draft_id: another.id, ...access })
  )
  await inOrg((ctx) =>
    services.publishClauseSheet(ctx, { id: made.id, draft_id: another.id, preview_hash: next.preview_hash, ...access })
  )
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: made.draft.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 409, slug: 'preview-stale' })
})

test('preview_reports_base_drift_against_current_live', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  await inOrg((ctx) =>
    services.publishClauseSheet(ctx, {
      id: made.id,
      draft_id: made.draft.id,
      preview_hash: preview.preview_hash,
      ...access
    })
  )
  const oldBase = await inOrg((ctx) =>
    services.createClauseSheetDraft(ctx, { id: made.id, content: rainSheet(), base_n: 1, ...access })
  )
  const next = await inOrg((ctx) =>
    services.getClauseSheetPublishPreview(ctx, { id: made.id, draft_id: oldBase.id, ...access })
  )
  expect(next).toMatchObject({ base_n: 1, live_n: 2, base_drift: true })
})

test('direct_service_publish_requires_human_recent_auth_and_can', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  for (const kind of ['guest', 'editor', 'old', 'can'] as const) {
    await expect(
      inOrg((ctx) => {
        if (ctx.principal.kind !== 'session') throw new Error('test principal')
        return services.publishClauseSheet(
          {
            ...ctx,
            principal: {
              ...ctx.principal,
              isGuest: kind === 'guest',
              role: kind === 'editor' ? 'editor' : 'owner',
              authenticatedAt: kind === 'old' ? new Date(now.getTime() - 13 * 3600000) : now
            }
          },
          {
            id: made.id,
            draft_id: made.draft.id,
            preview_hash: preview.preview_hash,
            ...access,
            can: () => kind !== 'can'
          }
        )
      })
    ).rejects.toMatchObject({ status: kind === 'old' ? 401 : 403 })
  }
})

test('no_live_defaults_prevents_human_version_one', async () => {
  const sheet = await inOrg((ctx) => makeClauseSheet(ctx.tx))
  const draft = await inOrg((ctx) =>
    services.createClauseSheetDraft(ctx, { id: sheet.id, content: rainSheet(), ...access })
  )
  const preview = await inOrg((ctx) =>
    services.getClauseSheetPublishPreview(ctx, { id: sheet.id, draft_id: draft.id, ...access })
  )
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: sheet.id,
        draft_id: draft.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 422, slug: 'not-publishable' })
})

test('concurrent_distinct_publish_requests_produce_one_version', async () => {
  const made = await recorded()
  const second = await inOrg((ctx) =>
    services.createClauseSheetDraft(ctx, { id: made.id, content: rainSheet(), ...access })
  )
  const previews = await Promise.all([
    previewOf(made),
    inOrg((ctx) => services.getClauseSheetPublishPreview(ctx, { id: made.id, draft_id: second.id, ...access }))
  ])
  const results = await Promise.allSettled(
    previews.map((p) =>
      inOrg((ctx) =>
        services.publishClauseSheet(ctx, { id: made.id, draft_id: p.draft.id, preview_hash: p.preview_hash, ...access })
      )
    )
  )
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409, slug: 'preview-stale' } })
  const versions = await inOrg((ctx) => ctx.tx.select().from(sheetVersion).where(eq(sheetVersion.sheetId, made.id)))
  expect(
    versions
      .filter((v) => v.status === 'published')
      .map((v) => v.n)
      .sort()
  ).toEqual([1, 2])
})

test('replay_does_not_coerce_no_call_to_normal', async () => {
  const made = await recorded()
  const content: SheetInput = {
    pack: 'sky',
    clauses: raw().clauses.filter((c) => ['haze_severe', 'silent_input'].includes(c.key))
  }
  const draft = await inOrg((ctx) => services.createClauseSheetDraft(ctx, { id: made.id, content, ...access }))
  const preview = await inOrg((ctx) =>
    services.getClauseSheetPublishPreview(ctx, { id: made.id, draft_id: draft.id, ...access })
  )
  expect(preview.replay.calls_evaluated).toBe(1)
  expect(preview.replay.changes[0]?.after.mode).toBeNull()
  expect(preview.replay.changes[0]?.after.no_call?.inputs.length).toBeGreaterThan(0)
})

test('unavailable_registry_saves_raw_draft_and_blocks_dependencies_with_501', async () => {
  const created = await project(),
    id = created.sheets.find((s) => s.pack === 'sky')!.id
  services.setClauseSheetPorts({ registry: null, snapshots: null, recordedAt: null })
  const saved = await inOrg((ctx) => services.createClauseSheetDraft(ctx, { id, content: raw(), ...access }))
  expect(saved).toMatchObject({ content: raw(), check: null, validation_status: 'unavailable', publishable: false })
  for (const operation of [
    () => inOrg((ctx) => services.getClauseSheetPublishPreview(ctx, { id, draft_id: saved.id, ...access })),
    () =>
      inOrg((ctx) => services.publishClauseSheet(ctx, { id, draft_id: saved.id, preview_hash: 'absent', ...access })),
    () => inOrg((ctx) => services.evaluateClauseSheet(ctx, { id, draft_id: saved.id, ...access }))
  ])
    await expect(operation()).rejects.toMatchObject({ status: 501, slug: 'not-built', extra: { owner: 'b-evaluator' } })
  expect(await inOrg((ctx) => services.getClauseSheetDraft(ctx, { id, draftId: saved.id, ...access }))).toEqual(saved)
  expect(await inOrg((ctx) => services.deleteClauseSheetDraft(ctx, { id, draftId: saved.id, ...access }))).toEqual({
    id: saved.id
  })
})

test('checked_registry_change_returns_preview_stale', async () => {
  const made = await recorded(),
    preview = await previewOf(made)
  services.setClauseSheetPorts({
    registry: {
      load: async (_tx, q) =>
        q.registryHash
          ? TEST_REGISTRY
          : TEST_REGISTRY.map((d) => (d.name === 'site.rain_60m_mm' ? { ...d, unit: 'changed' } : d))
    },
    snapshots: null,
    recordedAt: null
  })
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: made.draft.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 409, slug: 'preview-stale' })
})

test('stored_snapshot_hash_and_missing_run_history_fail_closed', async () => {
  const made = await recorded()
  await inOrg((ctx) =>
    ctx.tx
      .update(runStep)
      .set({ output: { snapshotId: null, snapshot: { ...made.snapshot, hash: 'tampered' }, windows: made.windows } })
      .where(eq(runStep.runId, made.r.id))
  )
  await expect(previewOf(made)).rejects.toMatchObject({ status: 422, slug: 'not-publishable' })
})

test('live_evaluate_is_nonpersisting_and_historical_evaluate_is_labelled', async () => {
  const made = await recorded()
  const calls: boolean[] = []
  services.setClauseSheetPorts({
    registry: { load: async () => TEST_REGISTRY },
    snapshots: {
      take: async (_tx, q) => {
        calls.push(q.persist)
        return {
          snapshotId: null,
          snapshot: snapshotAt(capturedHistory(), TEST_REGISTRY, q.projectId, q.pack, q.tEval)
        }
      }
    },
    recordedAt: async () => ({ history: capturedHistory(), windows: made.windows })
  })
  const live = await inOrg((ctx) =>
    services.evaluateClauseSheet(ctx, { id: made.id, draft_id: made.draft.id, ...access, now: new Date(tEval) })
  )
  expect(live.label).toBe('live')
  expect(calls).toEqual([false])
  expect(live.verdicts.windows[0]?.mode).toBe('normal')
  const replay = await inOrg((ctx) =>
    services.evaluateClauseSheet(ctx, { id: made.id, draft_id: made.draft.id, at: tEval, ...access })
  )
  expect(replay.label).toBe('replay')
  expect(replay.explanations.some((e) => e.key === 'storm_confirmed' && e.cel.includes('40.0'))).toBe(true)
  services.setClauseSheetPorts({
    registry: { load: async () => TEST_REGISTRY },
    snapshots: null,
    recordedAt: async () => ({ history: { sources: [], polls: [], readings: [] }, windows: [] })
  })
  await expect(
    inOrg((ctx) => services.evaluateClauseSheet(ctx, { id: made.id, content: rainSheet(), at: tEval, ...access }))
  ).rejects.toMatchObject({ status: 422 })
})

test('historical_evaluate_rejects_malformed_frozen_windows_as_not_publishable', async () => {
  const made = await recorded()
  services.setClauseSheetPorts({
    registry: { load: async () => TEST_REGISTRY },
    snapshots: null,
    recordedAt: async () => ({
      history: capturedHistory(),
      windows: made.windows.map((w) => ({ ...w, startsAt: 'not-an-instant' }))
    })
  })
  await expect(
    inOrg((ctx) => services.evaluateClauseSheet(ctx, { id: made.id, content: rainSheet(), at: tEval, ...access }))
  ).rejects.toMatchObject({ status: 422, slug: 'not-publishable' })
})

test('lists_and_selectors_are_paginated_and_bound_to_sheet_and_project', async () => {
  const made = await recorded()
  const second = await inOrg((ctx) =>
    services.createClauseSheetDraft(ctx, { id: made.id, content: rainSheet(), ...access })
  )
  const first = await inOrg((ctx) =>
    services.listClauseSheetDrafts(ctx, { id: made.id, query: { limit: 1 }, ...access })
  )
  const next = await inOrg((ctx) =>
    services.listClauseSheetDrafts(ctx, { id: made.id, query: { limit: 1, cursor: first.next_cursor! }, ...access })
  )
  expect([first.data[0]!.id, next.data[0]!.id]).toEqual([made.draft.id, second.id].sort())
  expect(next.next_cursor).toBeNull()
  expect(
    (
      await inOrg((ctx) =>
        services.listClauseSheets(ctx, { projectId: made.projectId, query: { limit: 50 }, ...access })
      )
    ).data[0]?.id
  ).toBe(made.id)
  expect(
    (
      await inOrg((ctx) => services.listClauseSheetVersions(ctx, { id: made.id, query: { limit: 50 }, ...access }))
    ).data.map((v) => v.n)
  ).toEqual([1])
  expect(
    await inOrg((ctx) =>
      services.getClauseSheetDiff(ctx, { id: made.id, base: 'live', head: `draft:${made.draft.id}`, ...access })
    )
  ).toEqual([expect.objectContaining({ key: 'storm_confirmed' })])
  const other = await recorded()
  await expect(
    inOrg((ctx) => services.getClauseSheetDraft(ctx, { id: other.id, draftId: made.draft.id, ...access }))
  ).rejects.toMatchObject({ status: 404 })
  await expect(
    inOrg((ctx) => services.createClauseSheetDraft(ctx, { id: made.id, content: rainSheet(), base_n: 999, ...access }))
  ).rejects.toMatchObject({ status: 422 })
  await expect(
    inOrg((ctx) => services.getClauseSheetVersion(ctx, { id: made.id, n: 1, ...access, can: () => false }))
  ).rejects.toMatchObject({ status: 403 })
})

async function publicationRows(projectId: string) {
  return asLogin('postgres', async (client) => {
    const result: Record<string, number> = {}
    for (const table of ['ledger_entry', 'audit_event', 'domain_event', 'analytics_event']) {
      const filter =
        table === 'audit_event'
          ? " AND action = 'clause_sheet.published'"
          : table === 'domain_event'
            ? " AND type = 'clause_sheet.published'"
            : table === 'analytics_event'
              ? " AND name = 'clause_published'"
              : " AND kind = 'clause_version'"
      result[table] = Number(
        (await client.query(`SELECT count(*) FROM ${table} WHERE project_id = $1${filter}`, [projectId])).rows[0].count
      )
    }
    return result
  })
}
for (const failing of ['ledger_entry', 'audit_event', 'domain_event', 'analytics_event']) {
  test(`shared_write_failure_rolls_back_every_publication_row: ${failing}`, async () => {
    const made = await recorded(),
      preview = await previewOf(made)
    await asLogin('postgres', async (client) => {
      await client.query(
        `CREATE FUNCTION test_refuse_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test publication write failure'; END $$`
      )
      await client.query(
        `CREATE TRIGGER test_refuse_publish BEFORE INSERT ON ${failing} FOR EACH ROW EXECUTE FUNCTION test_refuse_publish()`
      )
    })
    try {
      expect(
        await refusal(
          inOrg((ctx) =>
            services.publishClauseSheet(ctx, {
              id: made.id,
              draft_id: made.draft.id,
              preview_hash: preview.preview_hash,
              ...access
            })
          )
        )
      ).toMatch(/test publication write failure/)
    } finally {
      await asLogin('postgres', async (client) => {
        await client.query(`DROP TRIGGER test_refuse_publish ON ${failing}`)
        await client.query('DROP FUNCTION test_refuse_publish()')
      })
    }
    expect(await publicationRows(made.projectId)).toEqual({
      ledger_entry: 0,
      audit_event: 0,
      domain_event: 0,
      analytics_event: 0
    })
    const rows = await inOrg((ctx) =>
      services.listClauseSheetVersions(ctx, { id: made.id, query: { limit: 50 }, ...access })
    )
    expect(rows.data.map((v) => v.n)).toEqual([1])
    expect(
      await inOrg((ctx) => services.getClauseSheetDraft(ctx, { id: made.id, draftId: made.draft.id, ...access }))
    ).toMatchObject({ status: 'draft', n: null, content_hash: made.draft.content_hash })
    expect(
      (
        await inOrg((ctx) =>
          services.listClauseSheets(ctx, { projectId: made.projectId, query: { limit: 50 }, ...access })
        )
      ).data[0]?.live_version_id
    ).toBe(preview.live!.id)
    await asLogin('postgres', async (client) =>
      expect(
        Number(
          (await client.query('SELECT count(*) FROM clause WHERE sheet_version_id = $1', [made.draft.id])).rows[0].count
        )
      ).toBe(0)
    )
  })
}

test('publication_commits_exact_ledger_audit_event_and_analytics', async () => {
  const made = await recorded(),
    preview = await previewOf(made)
  const published = await inOrg((ctx) =>
    services.publishClauseSheet(ctx, {
      id: made.id,
      draft_id: made.draft.id,
      preview_hash: preview.preview_hash,
      ...access
    })
  )
  expect(await expectOneAudit('clause_sheet.published', { targetId: made.id })).toMatchObject({
    before: { live_version_id: preview.live!.id },
    after: { version_id: published.id, version_n: 2, content_hash: published.content_hash }
  })
  expect(await expectEvent('clause_sheet.published', { projectId: made.projectId })).toMatchObject({
    data: { sheet_id: made.id, pack: 'sky', version_n: 2 }
  })
  expect(await expectLedgerEntry('clause_version', { projectId: made.projectId })).toMatchObject({
    body: {
      pack: 'sky',
      version_n: 2,
      content_hash: published.content_hash,
      clauses_changed: 1,
      replay_calls_changed: 1
    }
  })
  expect(await publicationRows(made.projectId)).toEqual({
    ledger_entry: 1,
    audit_event: 1,
    domain_event: 1,
    analytics_event: 1
  })
  await asLogin('postgres', async (client) => {
    const rows = await client.query(
      "SELECT props FROM analytics_event WHERE project_id = $1 AND name = 'clause_published'",
      [made.projectId]
    )
    expect(rows.rows.map((r) => r.props)).toEqual([{ pack: 'sky', clauses_changed: 1, replay_calls_changed: 1 }])
  })
})

test('same_draft_concurrent_publications_return_one_version_and_one_stale_conflict', async () => {
  const made = await recorded(),
    preview = await previewOf(made)
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      inOrg((ctx) =>
        services.publishClauseSheet(ctx, {
          id: made.id,
          draft_id: made.draft.id,
          preview_hash: preview.preview_hash,
          ...access
        })
      )
    )
  )
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409, slug: 'preview-stale' } })
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: preview.live!.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 404 })
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, { id: made.id, draft_id: made.draft.id, preview_hash: 'arbitrary', ...access })
    )
  ).rejects.toMatchObject({ status: 404 })
  await expect(
    inOrg((ctx) => services.getClauseSheetDraft(ctx, { id: made.id, draftId: made.draft.id, ...access }))
  ).rejects.toMatchObject({ status: 404 })
})

test('registry_removal_after_preview_is_stale_even_when_draft_check_now_fails', async () => {
  const made = await recorded(),
    preview = await previewOf(made)
  services.setClauseSheetPorts({
    registry: { load: async () => TEST_REGISTRY.filter((d) => d.name !== 'w.rain_max_60m_mm') },
    snapshots: null,
    recordedAt: null
  })
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: made.draft.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 409, slug: 'preview-stale' })
})

test('direct_preview_and_publish_deny_every_nonhuman_principal_before_registry_load', async () => {
  const made = await recorded()
  const preview = await previewOf(made)
  let loads = 0
  services.setClauseSheetPorts({
    registry: {
      load: async () => {
        loads++
        return TEST_REGISTRY
      }
    },
    snapshots: null,
    recordedAt: null
  })
  const common = { client: 'api' as const, clientName: null, orgId }
  const principals: Principal[] = [
    { ...common, kind: 'api_key', keyId: randomUUID(), accountId: randomUUID(), role: 'owner', scopes: ['admin'] },
    {
      ...common,
      kind: 'oauth',
      grantId: randomUUID(),
      clientId: randomUUID(),
      accountId: randomUUID(),
      role: 'owner',
      resource: 'api',
      projectIds: 'all',
      scopes: ['read', 'draft'],
      shareLinkId: null
    },
    { ...common, kind: 'share_link', linkId: randomUUID(), projectId: made.projectId, access: 'reviewer' },
    { ...common, kind: 'guest_token', tokenId: randomUUID(), accountId: randomUUID(), scopes: ['read', 'draft'] },
    { ...common, kind: 'device', keyId: randomUUID(), sourceId: randomUUID() },
    { kind: 'system', job: 'test', client: 'worker', clientName: null }
  ]
  for (const p of principals) {
    for (const publish of [false, true]) {
      await expect(
        withTenant({ orgId, principal: p }, async (tx) =>
          publish
            ? services.publishClauseSheet(
                { tx, principal: p },
                { id: made.id, draft_id: made.draft.id, preview_hash: preview.preview_hash, ...access }
              )
            : services.getClauseSheetPublishPreview(
                { tx, principal: p },
                { id: made.id, draft_id: made.draft.id, ...access }
              )
        )
      ).rejects.toMatchObject({ status: 403 })
    }
  }
  expect(loads).toBe(0)
  expect(await publicationRows(made.projectId)).toEqual({
    ledger_entry: 0,
    audit_event: 0,
    domain_event: 0,
    analytics_event: 0
  })
})

test('target_aware_can_and_project_restrictions_precede_draft_or_dependency_access', async () => {
  const made = await recorded()
  const targets: string[] = []
  await expect(
    inOrg((ctx) =>
      services.getClauseSheetPublishPreview(ctx, {
        id: made.id,
        draft_id: made.draft.id,
        ...access,
        can: (_p, statement, target) => {
          targets.push(`${statement}:${target?.projectId}`)
          return false
        }
      })
    )
  ).rejects.toMatchObject({ status: 403 })
  expect(targets).toEqual([`clause_sheet.publish:${made.projectId}`])
  const p: Principal = {
    kind: 'oauth',
    client: 'api',
    clientName: null,
    orgId,
    grantId: randomUUID(),
    clientId: randomUUID(),
    accountId: randomUUID(),
    role: 'owner',
    resource: 'api',
    projectIds: [randomUUID()],
    scopes: ['read', 'draft'],
    shareLinkId: null
  }
  await expect(
    withTenant({ orgId, principal: p }, (tx) =>
      services.getClauseSheetVersion({ tx, principal: p }, { id: made.id, n: 1, ...access })
    )
  ).rejects.toMatchObject({ status: 404 })
  const anotherOrg = (await makeOrganization({ slug: `other-${randomUUID().slice(0, 8)}` })).id
  const other = memberOf(anotherOrg)
  await expect(
    withTenant({ orgId: anotherOrg, principal: other }, (tx) =>
      services.getClauseSheetDraft({ tx, principal: other }, { id: made.id, draftId: made.draft.id, ...access })
    )
  ).rejects.toMatchObject({ status: 404 })
})

test('exactly_twelve_hours_and_session_bearer_allow_human_publication', async () => {
  const made = await recorded(),
    preview = await previewOf(made)
  const result = await inOrg((ctx) => {
    if (ctx.principal.kind !== 'session') throw new Error('test principal')
    return services.publishClauseSheet(
      {
        ...ctx,
        principal: { ...ctx.principal, via: 'bearer', authenticatedAt: new Date(now.getTime() - 12 * 3600000) }
      },
      { id: made.id, draft_id: made.draft.id, preview_hash: preview.preview_hash, ...access }
    )
  })
  expect(result.n).toBe(2)
})

for (const error of [new NotBuiltError('b-evaluator'), new EngineNotBuiltError('b-evaluator')]) {
  test(`dependency_not_built_maps_to_501_and_save_keeps_raw: ${error.constructor === NotBuiltError ? 'contract' : 'engine'}`, async () => {
    const made = await recorded()
    services.setClauseSheetPorts({
      registry: {
        load: async () => {
          throw error
        }
      },
      snapshots: null,
      recordedAt: null
    })
    const draft = await inOrg((ctx) =>
      services.createClauseSheetDraft(ctx, { id: made.id, content: rainSheet(), ...access })
    )
    expect(draft).toMatchObject({ check: null, content: rainSheet(), publishable: false })
    await expect(previewOf(made)).rejects.toMatchObject({
      status: 501,
      slug: 'not-built',
      extra: { owner: 'b-evaluator' }
    })
  })
}

test('historical_registry_metadata_and_existing_run_with_missing_snapshot_are_required', async () => {
  const made = await recorded()
  services.setClauseSheetPorts({
    registry: { load: async (_tx, q) => (q.registryHash ? [] : TEST_REGISTRY) },
    snapshots: null,
    recordedAt: null
  })
  await expect(previewOf(made)).rejects.toMatchObject({ status: 501, slug: 'not-built' })
  services.setClauseSheetPorts({ registry: { load: async () => TEST_REGISTRY }, snapshots: null, recordedAt: null })
  await inOrg((ctx) => ctx.tx.delete(runStep).where(eq(runStep.runId, made.r.id)))
  await expect(previewOf(made)).rejects.toMatchObject({ status: 422, slug: 'not-publishable' })
})

test('changed_run_selection_metadata_invalidates_frozen_preview', async () => {
  const made = await recorded(),
    preview = await previewOf(made)
  await inOrg((ctx) =>
    ctx.tx
      .update(run)
      .set({ triggeredAt: new Date(Date.parse(tEval) + 60000) })
      .where(eq(run.id, made.r.id))
  )
  await expect(
    inOrg((ctx) =>
      services.publishClauseSheet(ctx, {
        id: made.id,
        draft_id: made.draft.id,
        preview_hash: preview.preview_hash,
        ...access
      })
    )
  ).rejects.toMatchObject({ status: 409, slug: 'preview-stale' })
})
