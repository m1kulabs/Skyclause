import type { Page } from '@playwright/test'
import type { Principal, Role } from '@skyclause/contracts'
import apimsCapture from '../../../../packages/db/test/fixtures/mapcaqm-20261105T1313Z.json' with { type: 'json' }
import rainCapture from '../../../../packages/db/test/fixtures/rainfall-graph-75-20261105T1312Z.json' with { type: 'json' }
import warningCapture from '../../../../packages/db/test/fixtures/weather-warning-20261105T1313Z.json' with { type: 'json' }
import { signalsOperations as registry, type ProjectSource } from '../../features/signals/operations'
import { asPage, stubApi } from '../harness'

export const projectId = '019a55e0-0000-7000-8000-000000000001'
export const orgId = '019a55e0-0000-7000-8000-000000000010'
export const eventId = '019a55e0-0000-7000-8000-000000000011'
export const projectRoute = '/test-org/test-project/signals'
export const now = '2026-11-05T13:12:00.000Z'

type RainCapture = { timestamp: string; rf: number; dailyrf: number }
type ApimsCapture = {
  STATION_ID: string
  STATION_LOCATION: string
  LONGITUDE: number
  LATITUDE: number
  API: number
  CLASS: string
  RECORD_DT: string
}
type WarningCapture = {
  warning_issue: { issued: string; title_en: string; title_bm: string }
  valid_from: string
  valid_to: string
  heading_en: string
  text_en: string
}
type JsonFixture = null | string | number | boolean | JsonFixture[] | { [key: string]: JsonFixture }

const localInstant = (value: string) => new Date(`${value}+08:00`).toISOString()
const rainRows = (rainCapture as { data: RainCapture[] }).data.filter(
  ({ timestamp }) => timestamp >= '2026-11-04T21:00:00' && timestamp <= '2026-11-05T21:00:00'
)
const apimsRows = (apimsCapture as { data: ApimsCapture[] }).data
const warning = (warningCapture as WarningCapture[]).find(
  ({ warning_issue }) => warning_issue.title_en === 'Thunderstorms Warning'
)!

const sourceIds = {
  gauge: '019a55e0-0000-7000-8000-000000000101',
  ca16w: '019a55e0-0000-7000-8000-000000000102',
  ca19b: '019a55e0-0000-7000-8000-000000000103',
  ca17w: '019a55e0-0000-7000-8000-000000000104',
  met: '019a55e0-0000-7000-8000-000000000105',
  pending: '019a55e0-0000-7000-8000-000000000106',
  pi: '019a55e0-0000-7000-8000-000000000107',
  camera: '019a55e0-0000-7000-8000-000000000108'
}

const apims = (stationId: 'CA16W' | 'CA19B' | 'CA17W') => apimsRows.find(({ STATION_ID }) => STATION_ID === stationId)!
const reading = (
  id: string,
  source_id: string,
  metric: string,
  observed_at: string,
  value: number | null,
  unit: string | null,
  value_text: string | null = null,
  value_json: JsonFixture = null
) => ({
  id,
  source_id,
  poll_id: null,
  metric,
  unit,
  observed_at,
  received_at: observed_at,
  value,
  value_text,
  value_json,
  device_time: null,
  item_key: null,
  revision: 'capture-2026-11-05'
})

export const gaugeReadings = rainRows.map(({ timestamp, rf }, index) =>
  reading(
    `019a55e0-0000-7000-8000-${String(index + 1000).padStart(12, '0')}`,
    sourceIds.gauge,
    'rain_5m_mm',
    localInstant(timestamp),
    rf,
    'mm'
  )
)

const gaugeLatest = gaugeReadings.at(-1)!
const gaugeSixty = rainRows
  .filter(({ timestamp }) => timestamp >= '2026-11-05T20:00:00' && timestamp <= '2026-11-05T21:00:00')
  .reduce((sum, { rf }) => sum + rf, 0)
const apimsReading = (stationId: 'CA16W' | 'CA19B' | 'CA17W', index: number) => {
  const captured = apims(stationId)
  return reading(
    `019a55e0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    sourceIds[stationId.toLowerCase() as 'ca16w' | 'ca19b' | 'ca17w'],
    'api',
    localInstant(captured.RECORD_DT),
    captured.API,
    'API',
    null,
    { class: captured.CLASS, station: captured.STATION_ID }
  )
}
const ca16wReading = apimsReading('CA16W', 1101)
const ca19bReading = apimsReading('CA19B', 1102)
const ca17wReading = apimsReading('CA17W', 1103)
const metReading = reading(
  '019a55e0-0000-7000-8000-0000000001104',
  sourceIds.met,
  'warning',
  localInstant(warning.warning_issue.issued),
  null,
  null,
  warning.warning_issue.title_en,
  {
    issued_at: localInstant(warning.warning_issue.issued),
    valid_from: localInstant(warning.valid_from),
    valid_to: localInstant(warning.valid_to),
    heading: warning.heading_en,
    text: warning.text_en
  }
)

export const recentError = {
  id: '019a55e0-0000-7000-8000-0000000001201',
  source_id: sourceIds.ca16w,
  started_at: '2026-11-05T10:12:00.000Z',
  http_status: 503,
  latency_ms: 900,
  outcome: 'error',
  request_id: 'request-three-hours',
  error_code: 'upstream_unavailable'
}
export const oldError = {
  ...recentError,
  id: '019a55e0-0000-7000-8000-0000000001202',
  started_at: '2026-11-04T12:12:00.000Z',
  http_status: 502,
  request_id: 'request-twenty-five-hours'
}

const baseSources = [
  {
    id: sourceIds.gauge,
    project_id: projectId,
    kind: 'jps_rain' as const,
    external_id: '0232901RF',
    owner_org_id: null,
    name: 'Kampung Sungai Kayu Ara',
    lat: 3.13,
    lon: 101.61,
    url: 'https://infobanjirjpskl.water.gov.my/rainfall-graph-75',
    cadence_s: 300,
    stale_after_s: 900,
    licence_id: 'government-open-data',
    licence_label: 'Government open data',
    role: 'rain_gauge' as const,
    state: { state: 'fresh' as const, since: gaugeLatest.observed_at, http_status: 200, pending_until: null },
    latest_reading: gaugeLatest,
    age_s: 720,
    recent_errors: []
  },
  ...(['CA16W', 'CA19B', 'CA17W'] as const).map((stationId, index) => {
    const captured = apims(stationId)
    const latest = [ca16wReading, ca19bReading, ca17wReading][index]!
    return {
      id: sourceIds[stationId.toLowerCase() as 'ca16w' | 'ca19b' | 'ca17w'],
      project_id: projectId,
      kind: 'apims' as const,
      external_id: stationId,
      owner_org_id: null,
      name: captured.STATION_LOCATION,
      lat: captured.LATITUDE,
      lon: captured.LONGITUDE,
      url: 'https://eqms.doe.gov.my/mapcaqm',
      cadence_s: 3600,
      stale_after_s: 7200,
      licence_id: 'government-open-data',
      licence_label: 'Government open data',
      role: 'api_station' as const,
      state: { state: 'fresh' as const, since: latest.observed_at, http_status: 200, pending_until: null },
      latest_reading: latest,
      age_s: 720,
      recent_errors: stationId === 'CA16W' ? [recentError, oldError] : []
    }
  }),
  {
    id: sourceIds.met,
    project_id: projectId,
    kind: 'met_warning' as const,
    external_id: 'MET-WARNING-KL',
    owner_org_id: null,
    name: 'Kuala Lumpur warnings',
    lat: 3.14,
    lon: 101.69,
    url: 'https://api.data.gov.my/weather/warning',
    cadence_s: 600,
    stale_after_s: 1800,
    licence_id: 'government-open-data',
    licence_label: 'Government open data',
    role: 'warnings' as const,
    state: { state: 'fresh' as const, since: metReading.observed_at, http_status: 200, pending_until: null },
    latest_reading: metReading,
    age_s: 420,
    recent_errors: []
  }
]

export const fixtureProject = {
  id: projectId,
  org_id: orgId,
  name: 'Test project',
  slug: 'test-project',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: '2027-02-01',
  site_name: 'Test site',
  site_lat: 3.05,
  site_lon: 101.7,
  archived_at: null,
  camera_day_start: '07:00',
  camera_day_end: '19:00',
  warning_area_terms: [],
  packs: []
}

const projectStrip = {
  project_id: projectId,
  range: { from: '2026-11-04T13:00:00.000Z', to: gaugeLatest.observed_at },
  window: null,
  series: {
    rain_5m_mm: gaugeReadings.map(
      ({ observed_at, value }) => [observed_at, value, 'received'] as [string, number | null, string]
    ),
    'site.rain_60m_mm': [[gaugeLatest.observed_at, gaugeSixty, 'received'] as [string, number, string]]
  },
  inputs: [
    {
      name: 'site.rain_60m_mm',
      value: gaugeSixty,
      unit: 'mm',
      state: 'fresh',
      since: gaugeLatest.observed_at,
      age_s: 720,
      source_ids: [sourceIds.gauge],
      source_url: 'https://infobanjirjpskl.water.gov.my/rainfall-graph-75',
      reading_ids: [gaugeLatest.id],
      observed_at: gaugeLatest.observed_at
    }
  ],
  packs: [],
  verdicts: [],
  nights: []
}

export async function setup(
  page: Page,
  options: { role?: Role; specialStates?: boolean; streamError?: boolean; worstCase?: boolean } = {}
) {
  const role = options.role ?? 'viewer'
  const principal: Principal = {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'account-one',
    sessionId: 'test-session',
    authenticatedAt: new Date(now),
    orgId,
    role,
    isGuest: false,
    staff: false
  }
  await asPage(page, principal)
  const sources: ProjectSource[] = [...baseSources]
  if (options.specialStates) {
    sources.push(
      {
        id: sourceIds.pending,
        project_id: projectId,
        kind: 'golive' as const,
        external_id: 'PENDING-INPUT',
        owner_org_id: null,
        name: 'Upcoming input',
        lat: null,
        lon: null,
        url: 'https://golive.example.test/station/pending',
        cadence_s: 900,
        stale_after_s: 3600,
        licence_id: 'source-licence',
        licence_label: 'Source licence',
        role: 'venue_listings' as const,
        state: {
          state: 'pending' as const,
          since: '2026-11-05T13:00:00.000Z',
          http_status: null,
          pending_until: '2026-11-05T13:30:00.000Z'
        },
        latest_reading: null,
        age_s: null,
        recent_errors: []
      },
      {
        id: sourceIds.pi,
        project_id: projectId,
        kind: 'pi' as const,
        external_id: 'PI-KL-1',
        owner_org_id: null,
        name: 'Venue Pi',
        lat: 3.1,
        lon: 101.7,
        url: 'https://pi.example.test/status',
        cadence_s: 300,
        stale_after_s: 900,
        licence_id: 'device-owned',
        licence_label: 'Device owner',
        role: 'pi' as const,
        state: { state: 'stale' as const, since: '2026-11-05T12:00:00.000Z', http_status: null, pending_until: null },
        latest_reading: null,
        age_s: 4320,
        recent_errors: []
      },
      {
        id: sourceIds.camera,
        project_id: projectId,
        kind: 'camera' as const,
        external_id: 'CAM-KL-1',
        owner_org_id: orgId,
        name: 'Sky camera',
        lat: 3.1,
        lon: 101.7,
        url: 'https://camera.example.test/status',
        cadence_s: 600,
        stale_after_s: 1800,
        licence_id: 'project-owned',
        licence_label: 'Project owned',
        role: 'camera' as const,
        state: {
          state: 'probation' as const,
          since: '2026-11-01T00:00:00.000Z',
          http_status: 200,
          pending_until: null
        },
        latest_reading: reading(
          '019a55e0-0000-7000-8000-0000000001203',
          sourceIds.camera,
          'contrast',
          now,
          0.85,
          'ratio'
        ),
        age_s: 60,
        recent_errors: [],
        probation: {
          source_id: sourceIds.camera,
          probation: true,
          labeller_ids: ['labeller-one', 'labeller-two'],
          n: 80,
          obscured_frames: 2,
          agreement: 0.925
        }
      }
    )
  }
  if (options.worstCase) {
    sources.push({
      id: '019a55e0-0000-7000-8000-000000000109',
      project_id: projectId,
      kind: 'wikipedia',
      external_id: `CA16W-${'f47ac10b58cc4372a5670e02b2c3d479'.repeat(2)}`,
      owner_org_id: null,
      name: 'Kuala Lumpur Central Business District Air Quality Monitoring Station at Jalan Tun Razak (Northbound)',
      lat: null,
      lon: null,
      url: 'https://en.wikipedia.org/wiki/Skyclause_test_source',
      cadence_s: 86_400,
      stale_after_s: 172_800,
      licence_id: 'cc-by-sa',
      licence_label: 'Creative Commons Attribution ShareAlike',
      role: 'venue_listings',
      state: { state: 'error', since: '2026-11-05T12:00:00.000Z', http_status: 503, pending_until: null },
      latest_reading: null,
      age_s: null,
      recent_errors: []
    })
  }
  const validatedSources = registry.listProjectSources.response.parse({ data: sources, next_cursor: null })
  await stubApi(page, 'listProjects', { data: [fixtureProject], next_cursor: null }, { registry })
  await stubApi(page, 'listProjectSources', validatedSources, { registry })
  await stubApi(page, 'getProjectStrip', projectStrip, { registry })
  const readingsBySource = new Map<string, unknown[]>([
    [sourceIds.gauge, gaugeReadings],
    [sourceIds.ca16w, [ca16wReading]],
    [sourceIds.ca19b, [ca19bReading]],
    [sourceIds.ca17w, [ca17wReading]],
    [sourceIds.met, [metReading]]
  ])
  const readingsPath = registry.listSourceReadings.path.replace('{id}', '[^/]+')
  await page.route(new RegExp(`${readingsPath}(?:\\?[^#]*)?$`), async (route) => {
    const sourceId = new URL(route.request().url()).pathname.split('/').at(-2)!
    const body = registry.listSourceReadings.response.parse({
      data: readingsBySource.get(sourceId) ?? [],
      next_cursor: null
    })
    await route.fulfill({ status: 200, contentType: 'application/json', json: body })
  })
  const pollsBySource = new Map<string, unknown[]>([[sourceIds.ca16w, [recentError, oldError]]])
  const pollsPath = registry.listSourcePolls.path.replace('{id}', '[^/]+')
  await page.route(new RegExp(`${pollsPath}(?:\\?[^#]*)?$`), async (route) => {
    const sourceId = new URL(route.request().url()).pathname.split('/').at(-2)!
    const body = registry.listSourcePolls.response.parse({ data: pollsBySource.get(sourceId) ?? [], next_cursor: null })
    await route.fulfill({ status: 200, contentType: 'application/json', json: body })
  })
  if (options.streamError) {
    const sourceError = {
      id: eventId,
      type: 'source.error',
      created_at: now,
      org_id: orgId,
      project_id: projectId,
      data: { source_id: sourceIds.ca16w, state: 'error', since: now, http_status: 503 }
    }
    await stubApi(page, 'streamReadings', sourceError, { registry, stream: { event: 'source.error', id: eventId } })
  } else {
    await stubApi(
      page,
      'streamReadings',
      {
        id: eventId,
        type: 'source.recovered',
        created_at: now,
        org_id: orgId,
        project_id: projectId,
        data: { source_id: sourceIds.ca16w, state: 'recovered', since: now, http_status: 200 }
      },
      { registry, stream: { event: 'source.recovered', id: eventId } }
    )
  }
}

export const sourceIdsForTest = sourceIds
export const sampleReadingAt21 = {
  gauge: gaugeLatest,
  ca16w: ca16wReading,
  ca19b: ca19bReading,
  ca17w: ca17wReading,
  met: metReading
}
