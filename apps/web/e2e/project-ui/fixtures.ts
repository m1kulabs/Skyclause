import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { PackState, Principal, Role } from '@skyclause/contracts'
import { overviewOperations, bundleStream } from '../../features/overview/operations'
import { projectSettingsOperations } from '../../features/project-settings/operations'
import { asPage, stubApi } from '../harness'

export const projectId = '019a55e0-0000-7000-8000-000000000001'
export const adminId = '019a55e0-0000-7000-8000-000000000002'
export const approverId = '019a55e0-0000-7000-8000-000000000003'
export const projectPath = '/test-org/test-project'
export const capturedAt = '2026-11-05T13:12:00.000Z'

type RainCapture = { data: Array<{ timestamp: string; rf: number }> }
type ApimsCapture = { data: Array<{ STATION_ID: string; STATION_LOCATION: string; RECORD_DT: string; API: number }> }
type MetRecord = {
  warning_issue: { issued: string; title_en: string }
  valid_from: string | null
  valid_to: string | null
  heading_en: string
  text_en: string
}

const rainCapture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../docs/sources/infobanjirjpskl.water.gov.my/rainfall-graph-75-20261105T1312Z.json',
      import.meta.url
    ),
    'utf8'
  )
) as RainCapture
const apimsCapture = JSON.parse(
  readFileSync(new URL('../../../../docs/sources/eqms.doe.gov.my/mapcaqm-20261105T1313Z.json', import.meta.url), 'utf8')
) as ApimsCapture
const metCapture = JSON.parse(
  readFileSync(
    new URL('../../../../docs/sources/api.data.gov.my/weather-warning-20261105T1313Z.json', import.meta.url),
    'utf8'
  )
) as MetRecord[]

const utc = (local: string) => new Date(`${local}+08:00`).toISOString()
const rainRows = rainCapture.data.filter(
  (row) => row.timestamp > '2026-11-05T20:00:00' && row.timestamp <= '2026-11-05T21:00:00'
)
const rainAt = utc('2026-11-05T21:00:00')
const rainMm = rainRows.reduce((sum, row) => sum + row.rf, 0)
const cheras = apimsCapture.data.find((station) => station.STATION_ID === 'CA16W')!
const warning = metCapture
  .filter(
    (item) => item.valid_from && item.valid_to && utc(item.valid_from) <= capturedAt && capturedAt < utc(item.valid_to)
  )
  .sort((left, right) => left.warning_issue.issued.localeCompare(right.warning_issue.issued))
  .at(-1)!
const metAt = utc(warning.warning_issue.issued)

const sources = [
  {
    id: 'source-jps',
    project_id: projectId,
    kind: 'jps_rain' as const,
    external_id: '0232901RF',
    owner_org_id: null,
    name: 'Sg. Kuyoh di LRT Bukit Jalil',
    lat: null,
    lon: null,
    url: 'https://infobanjirjpskl.water.gov.my/',
    cadence_s: 300,
    stale_after_s: 900,
    licence_id: 'derived',
    licence_label: 'Derived data',
    role: 'rain_gauge' as const,
    state: { state: 'fresh' as const, since: rainAt, http_status: 200, pending_until: null },
    latest_reading: {
      id: 'reading-jps',
      source_id: 'source-jps',
      poll_id: null,
      metric: 'rain_60m_mm',
      unit: 'mm',
      observed_at: rainAt,
      received_at: capturedAt,
      value: rainMm,
      value_text: null,
      value_json: null,
      device_time: null,
      item_key: null,
      revision: '20261105T1312Z'
    },
    age_s: 720,
    recent_errors: []
  },
  {
    id: 'source-apims',
    project_id: projectId,
    kind: 'apims' as const,
    external_id: 'CA16W',
    owner_org_id: null,
    name: cheras.STATION_LOCATION,
    lat: 3.10626,
    lon: 101.717931,
    url: 'https://eqms.doe.gov.my/',
    cadence_s: 900,
    stale_after_s: 1800,
    licence_id: 'derived',
    licence_label: 'Derived data',
    role: 'api_station' as const,
    state: { state: 'fresh' as const, since: utc('2026-11-05T21:00:00'), http_status: 200, pending_until: null },
    latest_reading: {
      id: 'reading-apims',
      source_id: 'source-apims',
      poll_id: null,
      metric: 'api',
      unit: null,
      observed_at: utc(cheras.RECORD_DT),
      received_at: utc('2026-11-05T21:13:00'),
      value: cheras.API,
      value_text: null,
      value_json: null,
      device_time: null,
      item_key: null,
      revision: '20261105T1313Z'
    },
    age_s: 720,
    recent_errors: []
  },
  {
    id: 'source-met',
    project_id: projectId,
    kind: 'met_warning' as const,
    external_id: 'weather-warning',
    owner_org_id: null,
    name: warning.warning_issue.title_en,
    lat: null,
    lon: null,
    url: 'https://api.data.gov.my/weather/warning/',
    cadence_s: 900,
    stale_after_s: 1800,
    licence_id: 'cc-by-4.0',
    licence_label: 'CC BY 4.0',
    role: 'warnings' as const,
    state: { state: 'fresh' as const, since: metAt, http_status: 200, pending_until: null },
    latest_reading: {
      id: 'reading-met',
      source_id: 'source-met',
      poll_id: null,
      metric: 'warning_in_force',
      unit: null,
      observed_at: metAt,
      received_at: utc('2026-11-05T21:13:00'),
      value: 1,
      value_text: null,
      value_json: null,
      device_time: null,
      item_key: null,
      revision: '20261105T1313Z'
    },
    age_s: 420,
    recent_errors: []
  }
]

const inputValues = [
  {
    name: 'site.rain_60m_mm',
    value: rainMm,
    unit: 'mm',
    state: 'fresh' as const,
    since: rainAt,
    age_s: 720,
    source_ids: ['source-jps'],
    source_url: 'https://infobanjirjpskl.water.gov.my/',
    reading_ids: ['reading-jps'],
    observed_at: rainAt
  },
  {
    name: 'w.rain_max_60m_mm',
    value: rainMm,
    unit: 'mm',
    state: 'fresh' as const,
    since: rainAt,
    age_s: 720,
    source_ids: ['source-jps'],
    source_url: 'https://infobanjirjpskl.water.gov.my/',
    reading_ids: ['reading-jps'],
    observed_at: rainAt
  },
  {
    name: 'site.api_max',
    value: cheras.API,
    unit: '',
    state: 'fresh' as const,
    since: utc(cheras.RECORD_DT),
    age_s: 720,
    source_ids: ['source-apims'],
    source_url: 'https://eqms.doe.gov.my/',
    reading_ids: ['reading-apims'],
    observed_at: utc(cheras.RECORD_DT)
  },
  {
    name: 'site.met_warning_in_force',
    value: true,
    unit: '',
    state: 'fresh' as const,
    since: metAt,
    age_s: 420,
    source_ids: ['source-met'],
    source_url: 'https://api.data.gov.my/weather/warning/',
    reading_ids: ['reading-met'],
    observed_at: metAt
  },
  {
    name: 'w.met_warning_in_force',
    value: true,
    unit: '',
    state: 'fresh' as const,
    since: metAt,
    age_s: 420,
    source_ids: ['source-met'],
    source_url: 'https://api.data.gov.my/weather/warning/',
    reading_ids: ['reading-met'],
    observed_at: metAt
  }
]

const emptyPackStates: PackState[] = []
const capturedPackStates = [
  {
    pack: 'sky' as const,
    basis: 'engine_verdict' as const,
    call_id: null,
    mode: 'normal' as const,
    watch: false,
    no_call: null
  },
  {
    pack: 'crowd' as const,
    basis: 'engine_verdict' as const,
    call_id: null,
    mode: 'normal' as const,
    watch: false,
    no_call: null
  }
]

const verdict = (pack: 'sky' | 'crowd') => ({
  t_eval: capturedAt,
  pack,
  content_hash: `capture-${pack}`,
  snapshot_hash: `snapshot-${pack}`,
  hash: `verdict-${pack}`,
  site: [
    {
      scope: { kind: 'site' as const, id: null },
      pack,
      mode: 'normal' as const,
      watch: false,
      no_call: null,
      recommendations: [],
      clauses: [],
      open_from: null
    }
  ],
  windows: [],
  nights: []
})

const window = {
  id: '019a55e0-0000-7000-8000-000000000010',
  project_id: projectId,
  starts_at: '2026-11-05T13:30:00.000Z',
  ends_at: '2026-11-05T15:00:00.000Z',
  title: 'Evening lecture',
  kind: 'class' as const,
  tz: 'Asia/Kuala_Lumpur',
  declared_by: 'test-account',
  guest: false,
  via: 'app' as const,
  expires_at: null,
  series_id: null,
  ics_feed_id: null,
  cancelled_at: null,
  share_link_id: null,
  moderation: 'visible' as const,
  at_risk: true,
  latest_calls: { sky: null, crowd: null }
}

export const baseProject = {
  id: projectId,
  org_id: 'test-org',
  name: 'Bukit Jalil campus',
  slug: 'test-project',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: '2027-02-01',
  site_name: 'Bukit Jalil',
  site_lat: 3.05,
  site_lon: 101.7,
  archived_at: null,
  camera_day_start: '07:00',
  camera_day_end: '19:00',
  warning_area_terms: ['Kuala Lumpur'],
  packs: [
    { pack: 'sky' as const, enabled: true, sheet_id: 'sheet-sky', schedule: null, sla_s: 600 },
    { pack: 'crowd' as const, enabled: true, sheet_id: 'sheet-crowd', schedule: null, sla_s: 7200 }
  ]
}

const verdictSummary = {
  state: 'fresh' as const,
  inputs_reporting: 5,
  oldest_age_s: 720
}

const call = {
  id: '019a55e0-0000-7000-8000-000000000020',
  bundle_id: '019a55e0-0000-7000-8000-000000000021',
  window_id: null,
  night_id: null,
  mode: 'normal' as const,
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: 'No clause fired in the captured inputs.',
  state: 'drafted' as const,
  shadow: {
    scope: { kind: 'site' as const, id: null },
    pack: 'sky' as const,
    mode: 'normal' as const,
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null
  },
  chosen: 'agent',
  agrees: true,
  decision: null,
  expires_at: '2026-11-05T13:30:00.000Z',
  triggered_at: capturedAt,
  drafted_at: capturedAt,
  approved_at: null,
  sent_at: null,
  superseded_by_call_id: null,
  ics_uid: null,
  ics_sequence: 0
}
const bundle = {
  id: '019a55e0-0000-7000-8000-000000000021',
  project_id: projectId,
  run_id: '019a55e0-0000-7000-8000-000000000022',
  pack: 'sky' as const,
  state: 'closed' as const,
  superseded_by: null,
  review_hash: 'capture-review-hash',
  sla_due_at: null,
  needs_review_at: null,
  approved_by: null,
  escalation_level: 0,
  draft_only: false,
  calls: [{ ...call, bundle_id: '019a55e0-0000-7000-8000-000000000021' }]
}
const bundleView = {
  ...bundle,
  trigger: 'window' as const,
  triggered_at: capturedAt,
  sheet_version_id: null,
  alerts: []
}

function projectList(empty: boolean) {
  return {
    ...baseProject,
    summary: {
      pack_states: empty ? emptyPackStates : capturedPackStates,
      windows_at_risk: empty ? 0 : 1,
      signal_health: empty
        ? { ...verdictSummary, state: 'pending' as const, inputs_reporting: 0, oldest_age_s: null }
        : verdictSummary,
      latest_bundle: empty ? null : bundle,
      next_night: null,
      next_storm_date: null,
      next_action: empty ? ('bind_source' as const) : null
    }
  }
}

function page<T>(data: T[]) {
  return { data, next_cursor: null }
}

function principal(role: Role): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date(capturedAt),
    orgId: 'test-org',
    role,
    isGuest: role === 'guest',
    staff: false
  }
}

async function stubEmptyOverview(pageObject: Page, role: Role) {
  await stubApi(pageObject, 'listProjects', page([projectList(true)]), { registry: overviewOperations })
  await stubApi(
    pageObject,
    'listMyMemberships',
    page([
      {
        id: 'membership-test',
        org_id: 'test-org',
        account_id: 'test-account',
        role,
        reads_malay: false,
        org_name: 'Test organisation',
        org_slug: 'test-org'
      }
    ]),
    { registry: overviewOperations }
  )
  await stubApi(pageObject, 'getProject', baseProject, { registry: overviewOperations })
  await stubApi(
    pageObject,
    'getProjectStrip',
    {
      project_id: projectId,
      range: { from: capturedAt, to: capturedAt },
      window: null,
      series: {},
      inputs: [],
      packs: [],
      verdicts: [],
      nights: []
    },
    { registry: overviewOperations }
  )
  await stubApi(
    pageObject,
    'getProjectVerdicts',
    { project_id: projectId, packs: [] },
    { registry: overviewOperations }
  )
  await stubApi(pageObject, 'listProjectSources', page([]), { registry: overviewOperations })
  await stubApi(pageObject, 'listWindows', page([]), { registry: overviewOperations })
  await stubApi(pageObject, 'listProjectDays', page([]), { registry: overviewOperations })
  await stubApi(pageObject, 'listNights', page([]), { registry: overviewOperations })
  await stubApi(pageObject, 'listProjectBundles', page([]), { registry: overviewOperations })
  await pageObject.route('**/v1/projects/*/bundles/stream', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
  )
}

async function stubCapturedOverview(pageObject: Page, replay = false) {
  const summary = projectList(false)
  const captureInputs = replay ? [] : inputValues
  const captureSources = replay ? [] : sources
  const series: Record<string, Array<[string, number | null, string]>> = replay
    ? {}
    : {
        'site.rain_5m_mm': rainRows.map((row) => [utc(row.timestamp), row.rf, 'received']),
        'site.rain_60m_mm': rainRows.map((row) => {
          const end = Date.parse(utc(row.timestamp))
          const start = end - 60 * 60_000
          const total = rainRows
            .filter(
              (candidate) => Date.parse(utc(candidate.timestamp)) > start && Date.parse(utc(candidate.timestamp)) <= end
            )
            .reduce((sum, candidate) => sum + candidate.rf, 0)
          return [utc(row.timestamp), total, 'received']
        })
      }
  await stubApi(pageObject, 'listProjects', page([summary]), { registry: overviewOperations })
  await stubApi(
    pageObject,
    'listMyMemberships',
    page([
      {
        id: 'membership-test',
        org_id: 'test-org',
        account_id: 'test-account',
        role: 'admin',
        reads_malay: false,
        org_name: 'Test organisation',
        org_slug: 'test-org'
      }
    ]),
    { registry: overviewOperations }
  )
  await stubApi(pageObject, 'getProject', baseProject, { registry: overviewOperations })
  await stubApi(
    pageObject,
    'getProjectStrip',
    {
      project_id: projectId,
      range: replay
        ? { from: '2026-11-02T06:00:00.000Z', to: '2026-11-02T08:00:00.000Z' }
        : { from: '2026-11-05T12:12:00.000Z', to: '2026-11-05T14:12:00.000Z' },
      window: replay ? null : { ...window, at_risk: undefined },
      series,
      inputs: captureInputs,
      packs: capturedPackStates,
      verdicts: [verdict('sky'), verdict('crowd')],
      nights: [],
      ...(replay ? { replay: { source: '2 November replay', captured_at: '2026-11-02T07:00:00.000Z' } } : {})
    },
    { registry: overviewOperations }
  )
  await stubApi(
    pageObject,
    'getProjectVerdicts',
    { project_id: projectId, packs: [verdict('sky'), verdict('crowd')] },
    { registry: overviewOperations }
  )
  await stubApi(pageObject, 'listProjectSources', page(captureSources), { registry: overviewOperations })
  await stubApi(pageObject, 'listWindows', page(replay ? [] : [window]), { registry: overviewOperations })
  await stubApi(pageObject, 'listProjectDays', page([]), { registry: overviewOperations })
  await stubApi(pageObject, 'listNights', page([]), { registry: overviewOperations })
  await stubApi(pageObject, 'listProjectBundles', page(replay ? [] : [bundleView]), { registry: overviewOperations })
  await pageObject.route('**/v1/projects/*/bundles/stream', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
  )
}

async function stubProjectSettings(pageObject: Page) {
  const settingsProject = { ...baseProject }
  const rotaOverride = {
    id: '019a55e0-0000-7000-8000-000000000031',
    account_id: adminId,
    project_id: projectId,
    days: [1],
    local_start: '14:00',
    local_end: '19:15',
    condition: 'storm_afternoon',
    order: 0,
    template: 'storm_afternoon'
  }
  const inheritedShift = {
    id: '019a55e0-0000-7000-8000-000000000032',
    account_id: approverId,
    project_id: null,
    days: [5],
    local_start: '10:00',
    local_end: '12:00',
    condition: null,
    order: 0,
    template: 'custom'
  }
  await stubApi(pageObject, 'listProjects', page([settingsProject]), { registry: projectSettingsOperations })
  await stubApi(pageObject, 'getProject', settingsProject, { registry: projectSettingsOperations })
  await stubApi(
    pageObject,
    'updateProject',
    { ...settingsProject, rota_override: null },
    { registry: projectSettingsOperations }
  )
  await stubApi(pageObject, 'updateProjectPack', settingsProject.packs[0], { registry: projectSettingsOperations })
  await stubApi(
    pageObject,
    'archiveProject',
    { ...settingsProject, archived_at: capturedAt, rota_override: null },
    { registry: projectSettingsOperations }
  )
  await stubApi(
    pageObject,
    'restoreProject',
    { ...settingsProject, archived_at: null, rota_override: null },
    { registry: projectSettingsOperations }
  )
  await stubApi(
    pageObject,
    'getRota',
    {
      time_zone: 'Asia/Kuala_Lumpur',
      templates: [],
      shifts: [rotaOverride, inheritedShift],
      on_duty: [],
      next_shift: null,
      unstaffed_slots: []
    },
    { registry: projectSettingsOperations }
  )
  await stubApi(
    pageObject,
    'listMembers',
    page([
      {
        id: 'membership-admin',
        org_id: 'test-org',
        account_id: adminId,
        role: 'admin',
        reads_malay: false,
        name: 'Test Admin',
        email: 'admin@example.test',
        last_active_at: capturedAt,
        sign_in_methods: ['email']
      },
      {
        id: 'membership-approver',
        org_id: 'test-org',
        account_id: approverId,
        role: 'approver',
        reads_malay: true,
        name: 'Test Approver',
        email: 'approver@example.test',
        last_active_at: capturedAt,
        sign_in_methods: ['email']
      }
    ]),
    { registry: projectSettingsOperations }
  )
  await stubApi(
    pageObject,
    'createRotaShift',
    {
      id: '019a55e0-0000-7000-8000-000000000030',
      account_id: approverId,
      project_id: projectId,
      days: [1],
      local_start: '14:00',
      local_end: '19:15',
      condition: 'storm_afternoon',
      order: 0,
      template: 'storm_afternoon'
    },
    { registry: projectSettingsOperations }
  )
  await stubApi(
    pageObject,
    'updateRotaShift',
    {
      id: '019a55e0-0000-7000-8000-000000000030',
      account_id: approverId,
      project_id: projectId,
      days: [1],
      local_start: '14:00',
      local_end: '19:15',
      condition: 'storm_afternoon',
      order: 0,
      template: 'storm_afternoon'
    },
    { registry: projectSettingsOperations }
  )
  const link = {
    id: 'share-link-one',
    project_id: projectId,
    access: 'reviewer' as const,
    expires_at: '2026-11-12T13:12:00.000Z',
    revoked_at: null,
    last_used_at: '2026-11-05T12:00:00.000Z'
  }
  await stubApi(pageObject, 'listShareLinks', page([link]), { registry: projectSettingsOperations })
  await stubApi(
    pageObject,
    'createShareLink',
    {
      ...link,
      id: 'share-link-new',
      token: 'once-only-secret',
      url: 'https://skyclause.test/share/once-only-secret',
      created_at: capturedAt,
      last_used_at: null
    },
    { registry: projectSettingsOperations }
  )
  await stubApi(
    pageObject,
    'revokeShareLink',
    { ...link, revoked_at: capturedAt },
    { registry: projectSettingsOperations }
  )
}

export async function prepareOverview(
  pageObject: Page,
  role: Role = 'admin',
  options: { empty?: boolean; replay?: boolean } = {}
) {
  await asPage(pageObject, principal(role))
  if (options.empty ?? true) await stubEmptyOverview(pageObject, role)
  else await stubCapturedOverview(pageObject, options.replay)
}

export async function prepareSettings(pageObject: Page, role: Role = 'admin') {
  await asPage(pageObject, principal(role))
  await stubProjectSettings(pageObject)
}

export async function prepareCrawl(
  pageObject: Page,
  role: 'Owner' | 'Admin' | 'Approver' | 'Editor' | 'Viewer' | 'guest' | 'share-link reviewer' | 'signed out'
) {
  if (role === 'signed out' || role === 'share-link reviewer') {
    await pageObject.context().addCookies([
      {
        name: 'skyclause_test_principal',
        value: 'null',
        url: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3374}`,
        httpOnly: true,
        sameSite: 'Lax'
      }
    ])
  } else {
    const roles: Record<'Owner' | 'Admin' | 'Approver' | 'Editor' | 'Viewer' | 'guest', Role> = {
      Owner: 'owner',
      Admin: 'admin',
      Approver: 'approver',
      Editor: 'editor',
      Viewer: 'viewer',
      guest: 'guest'
    }
    await asPage(pageObject, principal(roles[role]))
  }
  if (role === 'signed out' || role === 'share-link reviewer') {
    await pageObject.route(/\/v1\/projects(?:\?|$)/, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        json: {
          type: 'https://skyclause.test/problems/authentication-required',
          title: 'Authentication required',
          status: 401
        }
      })
    )
    return
  }
  if (role === 'guest') {
    await pageObject.route(/\/v1\/projects(?:\?|$)/, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        json: { type: 'https://skyclause.test/problems/forbidden', title: 'Forbidden', status: 403 }
      })
    )
    return
  }
  if (role === 'Owner' || role === 'Admin') await stubProjectSettings(pageObject)
  if (role === 'Owner' || role === 'Admin' || role === 'Approver' || role === 'Editor' || role === 'Viewer') {
    const roleName: Record<'Owner' | 'Admin' | 'Approver' | 'Editor' | 'Viewer', Role> = {
      Owner: 'owner',
      Admin: 'admin',
      Approver: 'approver',
      Editor: 'editor',
      Viewer: 'viewer'
    }
    await stubEmptyOverview(pageObject, roleName[role])
  }
}

export const projectFixtureData = {
  projectId,
  projectPath,
  capturedAt,
  rainMm,
  apiValue: cheras.API,
  warningTitle: warning.warning_issue.title_en,
  rawRainCapture: rainCapture,
  rawApimsCapture: apimsCapture,
  rawMetCapture: metCapture,
  window
}

export { bundleStream }
