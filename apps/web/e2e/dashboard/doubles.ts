import type { Page } from '@playwright/test'
import { dashboardOperations, type Dashboard } from '../../features/dashboard/operations'
import { bundleDouble, callDouble, ids as bundleIds } from '../bundles/doubles'
import { asPage, stubApi } from '../harness'

export const ids = {
  ...bundleIds,
  source: '019a45b0-0000-7000-8000-000000000006',
  grade: '019a45b0-0000-7000-8000-000000000007',
  call: '019a45b0-0000-7000-8000-000000000025'
}

export const org = { id: '019a45b0-0000-7000-8000-000000000008', slug: 'test-org', name: 'Test organisation' }
export const project = {
  id: bundleIds.project,
  org_id: org.id,
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

const projectRef = { id: project.id, slug: project.slug, org_slug: org.slug }
const dashboardCall = () => {
  const call = callDouble()
  const windowId = '019a45b0-0000-7000-8000-000000000026'
  return { ...call, window_id: windowId, window: call.window ? { ...call.window, id: windowId } : null }
}
const reviewBundle = bundleDouble([dashboardCall()])
const firstCall = dashboardCall()
const grade = {
  id: ids.grade,
  call_id: firstCall.id,
  night_id: null,
  outcome: 'agree',
  sheet_version_id: '019a45b0-0000-7000-8000-000000000009',
  pack: 'sky' as const,
  window_id: firstCall.window_id,
  proposed_mode: 'commute_disruption' as const,
  observed_mode: 'commute_disruption' as const,
  mode_diff: 0,
  no_call: false,
  agrees: true,
  stale_inputs: false
}

export const filledDashboard: Dashboard = {
  needs_review: {
    data: [
      {
        id: reviewBundle.id,
        project: projectRef,
        pack: 'sky',
        sla_due_at: reviewBundle.sla_due_at!,
        seconds_remaining: 60
      }
    ],
    n: 1,
    next_action: 'Review the bundle'
  },
  windows_at_risk: {
    data: [
      {
        project: projectRef,
        window: firstCall.window!,
        verdict: firstCall.shadow
      }
    ],
    n: 1,
    next_action: 'View all'
  },
  signal_health: {
    data: [
      {
        project: projectRef,
        source: {
          id: ids.source,
          kind: 'jps_rain',
          external_id: '0232901RF',
          owner_org_id: null,
          name: 'Sg. Kuyoh',
          lat: null,
          lon: null,
          url: 'https://infobanjirjpskl.water.gov.my/',
          cadence_s: 300,
          stale_after_s: 600,
          licence_id: 'none',
          licence_label: 'no published terms'
        },
        state: {
          state: 'error',
          since: '2026-11-02T06:40:00Z',
          http_status: 503,
          pending_until: null
        },
        age_s: 420
      }
    ],
    n: 1,
    next_action: 'Check the source'
  },
  upcoming_risks: {
    data: [{ project: projectRef, pack: 'crowd', date: '2026-11-14', starts_at: '2026-11-14T11:00:00Z', mode: null }],
    n: 1,
    next_action: 'Review the forecast'
  },
  yesterday_grades: {
    data: [
      {
        project: projectRef,
        grade,
        metric: { metric: 'agreement', x: 1, n: 1, low: 0.2065, high: 1 }
      }
    ],
    n: 1,
    next_action: 'View analysis'
  }
}

export const emptyDashboard: Dashboard = {
  needs_review: { data: [], n: 0, next_action: 'Open approvals' },
  windows_at_risk: { data: [], n: 0, next_action: 'Declare a window' },
  signal_health: { data: [], n: 0, next_action: 'Bind a source' },
  upcoming_risks: { data: [], n: 0, next_action: 'List a show' },
  yesterday_grades: { data: [], n: 0, next_action: 'View analysis' }
}

export const healthyDashboard: Dashboard = {
  ...filledDashboard,
  signal_health: {
    ...filledDashboard.signal_health,
    data: filledDashboard.signal_health.data.map((item) => ({
      ...item,
      state: { ...item.state, state: 'fresh', http_status: null },
      age_s: 180
    }))
  }
}

export async function stubDashboard(
  page: Page,
  options: {
    role?: 'owner' | 'admin' | 'approver' | 'editor' | 'viewer' | 'guest' | null
    filled?: boolean
    noProjects?: boolean
    dashboard?: Dashboard
  } = {}
) {
  const role = options.role === undefined ? 'approver' : options.role
  const principal = {
    kind: 'session' as const,
    client: 'app' as const,
    clientName: null,
    via: 'cookie' as const,
    accountId: '019a45b0-0000-7000-8000-000000000010',
    sessionId: '019a45b0-0000-7000-8000-000000000011',
    authenticatedAt: new Date('2026-11-02T06:00:00Z'),
    orgId: org.id,
    role: role ?? 'viewer',
    isGuest: role === 'guest',
    staff: false
  }
  if (role !== null) await asPage(page, principal)
  const dashboard = options.dashboard ?? (options.filled ? filledDashboard : emptyDashboard)
  await stubApi(page, 'getDashboard', dashboard, {
    registry: dashboardOperations
  })
  await stubApi(
    page,
    'listProjects',
    { data: role !== null && !options.noProjects ? [project] : [], next_cursor: null },
    { registry: dashboardOperations }
  )
  await stubApi(
    page,
    'listMyMemberships',
    {
      data:
        role === null
          ? []
          : [
              {
                id: '019a45b0-0000-7000-8000-000000000012',
                org_id: org.id,
                account_id: principal.accountId,
                role,
                reads_malay: false,
                org_name: org.name,
                org_slug: org.slug
              }
            ],
      next_cursor: null
    },
    { registry: dashboardOperations }
  )
  await stubApi(
    page,
    'getMyPreferences',
    {
      theme: 'dark',
      high_contrast: false,
      density: 'comfortable',
      reduced_motion: false,
      language: 'en',
      shortcuts: true
    },
    { registry: dashboardOperations }
  )
  await stubApi(
    page,
    'updateMyPreferences',
    {
      theme: 'dark',
      high_contrast: false,
      density: 'comfortable',
      reduced_motion: false,
      language: 'en',
      shortcuts: true
    },
    { registry: dashboardOperations }
  )
  if (options.filled) {
    await stubApi(page, 'getBundle', reviewBundle, { registry: dashboardOperations })
    await stubApi(page, 'getCall', firstCall, { registry: dashboardOperations })
    await stubApi(
      page,
      'getProjectStrip',
      {
        project_id: project.id,
        range: { from: '2026-11-02T06:00:00Z', to: '2026-11-02T08:00:00Z' },
        window: firstCall.window,
        series: {
          rain5: [['2026-11-02T07:00:00Z', 9.5, 'received']],
          rain60: [['2026-11-02T07:00:00Z', 39, 'received']]
        },
        inputs: firstCall.inputs,
        packs: [],
        verdicts: [],
        nights: []
      },
      { registry: dashboardOperations }
    )
  }
}
