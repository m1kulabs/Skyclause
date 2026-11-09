import type { Page } from '@playwright/test'
import { stubApi, asPage } from '../harness'
import type { CallDetail } from '../../features/bundles/operations'
import { callsOperations } from '../../features/calls/operations'
import { callDouble, gauge, ids, now, rain60At } from '../bundles/doubles'

export const callsPath = '/test-org/test-project/calls'
export const callPath = `${callsPath}/${ids.first}`

export function gradeDouble(call: CallDetail) {
  return {
    id: 'grade-replay-20261102',
    call_id: call.id,
    night_id: null,
    outcome: 'hit',
    sheet_version_id: call.sheet_version_id,
    pack: 'sky' as const,
    window_id: call.window_id,
    proposed_mode: call.mode,
    observed_mode: 'commute_disruption' as const,
    mode_diff: 0,
    no_call: false,
    agrees: true,
    stale_inputs: false,
    forecast: null,
    actual: 39,
    reading_ids: gauge.reading_ids,
    graded_at: '2026-11-03T00:00:00Z',
    local_date: '2026-11-02',
    pending_until: null
  }
}

export function callReplay(patch: Partial<CallDetail> = {}): CallDetail {
  return callDouble(ids.first, {
    trace_id: ids.run,
    state: 'sent',
    approved_at: '2026-11-02T07:12:00Z',
    sent_at: '2026-11-02T07:14:00Z',
    grade: null,
    ...patch
  })
}

/** Schema-checked 2 November 2026 JPS replay bodies for the calls routes. */
export interface CallsStubOptions {
  call?: CallDetail
  rows?: CallDetail[]
  nextCursor?: string | null
  grades?: unknown[]
}

export async function stubCalls(page: Page, options: CallsStubOptions = {}) {
  const call = options.call ?? callReplay()
  const rows = options.rows ?? [call]
  await stubApi(
    page,
    'listProjects',
    {
      data: [
        {
          id: call.project_id,
          org_id: 'test-org-id',
          name: 'Test project',
          slug: 'test-project',
          time_zone: 'Asia/Kuala_Lumpur',
          public: false,
          semester_ends_on: null,
          site_name: null,
          site_lat: null,
          site_lon: null,
          archived_at: null,
          camera_day_start: null,
          camera_day_end: null,
          warning_area_terms: [],
          packs: []
        }
      ],
      next_cursor: null
    },
    { registry: callsOperations }
  )
  await stubApi(
    page,
    'listProjectCalls',
    { data: rows, next_cursor: options.nextCursor ?? null },
    { registry: callsOperations }
  )

  const grade = call.grade ?? gradeDouble(call)
  await stubApi(page, 'getCall', call, { registry: callsOperations })
  await stubApi(page, 'getCallExplanation', call, { registry: callsOperations })
  await stubApi(
    page,
    'getRun',
    {
      id: call.trace_id,
      project_id: call.project_id,
      pack: call.night_id ? 'crowd' : 'sky',
      trigger: 'crossing',
      dedupe_key: 'replay-20261102-1500',
      sheet_version_id: call.sheet_version_id,
      snapshot_id: 'snapshot-replay-20261102-1500',
      model: 'replay',
      fallback_used: false,
      status: 'drafted',
      reason: 'Replay · JPS station 75 · 2 November 2026',
      trigger_ref: 'replay-20261102-1500',
      window_ids: call.window_id ? [call.window_id] : [],
      verdict_hash: 'replay-20261102-1500',
      triggered_at: call.triggered_at,
      bundle_id: call.bundle_id,
      trace: {
        text: 'Replay · JPS station 75 · 2 November 2026',
        inputs: call.inputs,
        steps: [
          { step: 'Read inputs', status: 'completed', started_at: call.triggered_at, finished_at: call.drafted_at },
          { step: 'Evaluate clauses', status: 'completed', started_at: call.drafted_at, finished_at: call.drafted_at }
        ]
      }
    },
    { registry: callsOperations }
  )
  await stubApi(
    page,
    'getProjectStrip',
    {
      project_id: call.project_id,
      range: { from: '2026-11-02T06:00:00Z', to: '2026-11-02T08:00:00Z' },
      window: call.window,
      series: {
        'site.rain_60m_mm': [
          ['2026-11-02T06:30:00Z', rain60At('2026-11-02T14:30:00'), 'fresh'],
          ['2026-11-02T07:00:00Z', rain60At('2026-11-02T15:00:00'), 'fresh']
        ]
      },
      inputs: [gauge],
      packs: [],
      verdicts: [],
      nights: []
    },
    { registry: callsOperations }
  )
  await stubApi(
    page,
    'listGrades',
    { data: options.grades ?? [grade], next_cursor: null },
    { registry: callsOperations }
  )
  return { call, rows }
}

export async function prepareCalls(page: Page, options: CallsStubOptions = {}) {
  await asPage(page, {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date(now.getTime() - 13 * 3600000),
    orgId: 'test-org-id',
    role: 'viewer',
    isGuest: false,
    staff: false
  })
  await page.clock.setFixedTime(now)
  return stubCalls(page, options)
}
