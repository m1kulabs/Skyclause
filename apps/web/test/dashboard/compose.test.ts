import { afterEach, describe, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import {
  COMPOSED_PROJECT_CAP,
  composeDashboard,
  mostRecentlyActive,
  type DashboardBlocks
} from '../../features/dashboard/compose'
import {
  dashboardOperations,
  readDashboard,
  type DashboardProject,
  type dashboardApi
} from '../../features/dashboard/operations'

// Every answer is parsed with its operation's own response schema, so these are the shapes the API sends.
const parse = (id: keyof typeof dashboardOperations, body: unknown): unknown =>
  (dashboardOperations[id].response as { parse(value: unknown): unknown }).parse(body)

/** What the composition passes each read. */
type Options = { org?: string; signal: AbortSignal; query?: Record<string, unknown>; params?: { id: string } }

const now = new Date('2026-11-13T02:00:00.000Z') // 10:00 MYT
const org = 'campus-org'
const id = (n: number) => `019a6000-0000-7000-8000-${String(n).padStart(12, '0')}`

function project(n: number, latestBundle: unknown = null): DashboardProject {
  return dashboardOperations.listProjects.response.parse({
    data: [
      {
        id: id(n),
        org_id: id(900),
        name: `Project ${n}`,
        slug: `project-${n}`,
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
        packs: [{ pack: 'sky', enabled: true, sheet_id: null, schedule: null, sla_s: 600 }],
        summary: {
          pack_states: [],
          windows_at_risk: 0,
          signal_health: { state: 'pending', inputs_reporting: 0, oldest_age_s: null },
          latest_bundle: latestBundle,
          next_night: null,
          next_storm_date: null,
          next_action: null
        }
      }
    ],
    next_cursor: null
  }).data[0]!
}

const shadow = {
  scope: { kind: 'window', id: id(30) },
  pack: 'sky',
  mode: 'outdoor_limited',
  watch: false,
  no_call: null,
  recommendations: [],
  clauses: [],
  open_from: null
}
const call = {
  id: id(20),
  bundle_id: id(21),
  window_id: id(30),
  night_id: null,
  mode: 'outdoor_limited',
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: 'Rain over the threshold.',
  state: 'drafted',
  shadow,
  chosen: 'agent',
  agrees: true,
  decision: null,
  expires_at: '2026-11-13T05:00:00.000Z',
  triggered_at: '2026-11-13T01:50:00.000Z',
  drafted_at: '2026-11-13T01:51:00.000Z',
  approved_at: null,
  sent_at: null,
  superseded_by_call_id: null,
  ics_uid: null,
  ics_sequence: 0
}
const bundle = {
  id: id(21),
  project_id: id(1),
  run_id: id(22),
  pack: 'sky',
  state: 'needs_review',
  superseded_by: null,
  review_hash: 'review-hash',
  sla_due_at: '2026-11-13T02:10:00.000Z',
  needs_review_at: '2026-11-13T02:00:00.000Z',
  approved_by: null,
  escalation_level: 0,
  draft_only: false,
  calls: [call]
}
const bundleView = {
  ...bundle,
  trigger: 'window',
  triggered_at: '2026-11-13T01:50:00.000Z',
  sheet_version_id: null,
  alerts: []
}
const window = {
  id: id(30),
  project_id: id(1),
  starts_at: '2026-11-13T05:00:00.000Z',
  ends_at: '2026-11-13T06:30:00.000Z',
  title: 'Open-air lecture',
  kind: 'class',
  tz: 'Asia/Kuala_Lumpur',
  declared_by: id(40),
  guest: false,
  via: 'app',
  expires_at: null,
  series_id: null,
  ics_feed_id: null,
  cancelled_at: null,
  share_link_id: null,
  moderation: 'visible',
  at_risk: true,
  latest_calls: { sky: { id: id(20), bundle_id: id(21), state: 'drafted', mode: 'outdoor_limited' }, crowd: null }
}
const source = (state: 'fresh' | 'error', age: number) => ({
  id: id(state === 'fresh' ? 50 : 51),
  kind: 'jps_rain',
  external_id: state === 'fresh' ? '3117070' : '3216001',
  owner_org_id: null,
  name: state === 'fresh' ? 'JPS Bukit Jalil' : 'JPS Cheras',
  lat: null,
  lon: null,
  url: 'https://publicinfobanjir.water.gov.my/',
  cadence_s: 300,
  stale_after_s: 900,
  licence_id: null,
  licence_label: 'Public sector open data',
  project_id: id(1),
  role: 'rain_gauge',
  state: { state, since: '2026-11-13T01:00:00.000Z', http_status: null, pending_until: null },
  latest_reading: null,
  age_s: age,
  recent_errors: []
})
const grade = (n: number, agrees: boolean) => ({
  id: id(60 + n),
  call_id: id(20),
  night_id: null,
  outcome: agrees ? 'hit' : 'miss',
  sheet_version_id: id(70),
  pack: 'sky',
  window_id: id(30),
  proposed_mode: 'outdoor_limited',
  observed_mode: agrees ? 'outdoor_limited' : 'normal',
  mode_diff: agrees ? 0 : 1,
  no_call: false,
  agrees,
  stale_inputs: false,
  forecast: null,
  actual: null,
  reading_ids: [],
  graded_at: '2026-11-12T22:45:00.000Z',
  local_date: '2026-11-12'
})
const night = {
  id: id(80),
  project_id: id(1),
  date: '2026-11-14',
  state: 'upcoming',
  doors: '2026-11-14T11:00:00.000Z',
  show: '2026-11-14T12:00:00.000Z',
  arrival_start: '2026-11-14T10:00:00.000Z',
  arrival_end: '2026-11-14T12:00:00.000Z',
  exit_start: null,
  exit_end: null,
  forecast: null,
  show_name: 'Stadium concert'
}
const answers = {
  listProjectBundles: { data: [bundleView], next_cursor: null },
  listWindows: { data: [window], next_cursor: null },
  listProjectSources: { data: [source('fresh', 120), source('error', 4000)], next_cursor: null },
  listProjectDays: {
    data: [
      { date: '2026-11-12', reading_count: 280, error_count: 0, window_count: 0, storm_afternoon: null },
      {
        date: '2026-11-15',
        reading_count: 0,
        error_count: 0,
        window_count: 0,
        storm_afternoon: { wording: 'Ribut petir di beberapa tempat', source_url: 'https://www.met.gov.my/' }
      }
    ],
    next_cursor: null
  },
  listNights: { data: [night], next_cursor: null },
  listGrades: { data: [grade(1, true), grade(2, true), grade(3, false)], next_cursor: null }
} as const
type ReadId = keyof typeof answers

/** The API as the composition calls it: each read answers its parsed body, or the problem it is told to fail with. */
function fakeApi(
  fail: Partial<Record<ReadId, number | 'timeout'>> = {},
  calls: Array<{ id: string; options: Options }> = []
) {
  return (async (operationId: string, options: Options) => {
    calls.push({ id: operationId, options })
    const failure = fail[operationId as ReadId]
    if (failure === 'timeout') {
      return new Promise((_, reject) =>
        options.signal.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')))
      )
    }
    if (failure) throw new ApiProblem(failure, { title: 'Failed' })
    return parse(operationId as ReadId, answers[operationId as ReadId])
  }) as unknown as typeof dashboardApi
}

const compose = (api: typeof dashboardApi, projects = [project(1, bundle)], timeoutMs?: number) =>
  composeDashboard(api, { org, projects, headers: new Headers(), now, timeoutMs })

const BLOCK_OF: Record<ReadId, keyof DashboardBlocks> = {
  listProjectBundles: 'needs_review',
  listWindows: 'windows_at_risk',
  listProjectSources: 'signal_health',
  listProjectDays: 'upcoming_risks',
  listNights: 'upcoming_risks',
  listGrades: 'yesterday_grades'
}

describe('composeDashboard', () => {
  test('fills every block from the reads that are built, for the dates the project’s own zone gives', async () => {
    const calls: Array<{ id: string; options: Options }> = []
    const { blocks, shown } = await compose(fakeApi({}, calls))
    expect(shown.map((item) => item.slug)).toEqual(['project-1'])

    expect(blocks.needs_review).toMatchObject({ ok: true, n: 1 })
    const [review] = blocks.needs_review.ok ? blocks.needs_review.data : []
    expect(review!.summary).toEqual({
      id: id(21),
      project: { id: id(1), slug: 'project-1', org_slug: org },
      pack: 'sky',
      sla_due_at: '2026-11-13T02:10:00.000Z',
      seconds_remaining: 600
    })
    expect(review!.detail.calls[0]!.mode).toBe('outdoor_limited')

    expect(blocks.windows_at_risk).toEqual({
      ok: true,
      n: 1,
      data: [
        {
          project: { id: id(1), slug: 'project-1', org_slug: org },
          window: expect.objectContaining({ id: id(30), title: 'Open-air lecture' }),
          state: 'outdoor_limited',
          draft: true
        }
      ]
    })
    // Sources in trouble come first.
    expect(blocks.signal_health.ok && blocks.signal_health.data.map((item) => item.source.name)).toEqual([
      'JPS Cheras',
      'JPS Bukit Jalil'
    ])
    // Days behind today are not ahead; the show night and the storm afternoon are, in date order.
    expect(blocks.upcoming_risks.ok && blocks.upcoming_risks.data).toEqual([
      expect.objectContaining({
        pack: 'crowd',
        date: '2026-11-14',
        starts_at: night.show,
        show_name: 'Stadium concert'
      }),
      expect.objectContaining({
        pack: 'sky',
        date: '2026-11-15',
        starts_at: null,
        mode: null,
        storm: { wording: 'Ribut petir di beberapa tempat', source_url: 'https://www.met.gov.my/' }
      })
    ])
    // Yesterday's grades: how often the call agreed, with its n and Wilson interval, per pack.
    expect(blocks.yesterday_grades.ok && blocks.yesterday_grades.data).toEqual([
      expect.objectContaining({
        project: { id: id(1), slug: 'project-1', org_slug: org },
        metric: expect.objectContaining({ metric: 'agreement', x: 2, n: 3 })
      })
    ])

    const query = (operation: ReadId) => calls.find((item) => item.id === operation)!.options.query
    expect(query('listProjectBundles')).toMatchObject({ state: 'needs_review' })
    expect(query('listWindows')).toMatchObject({
      from: '2026-11-13',
      to: '2026-11-13',
      at_risk: 'true',
      include: 'calls'
    })
    expect(query('listGrades')).toMatchObject({ from: '2026-11-12', to: '2026-11-12' })
    // Every read is the organisation's, and each has its own timeout.
    expect(calls.every((item) => item.options.org === org && item.options.signal instanceof AbortSignal)).toBe(true)
  })

  test.each(Object.keys(answers) as ReadId[])(
    'a failed %s read fails its own block only, keeping its status for Retry; the other blocks render',
    async (operation) => {
      const { blocks } = await compose(fakeApi({ [operation]: 503 }))
      const failedBlock = BLOCK_OF[operation]
      expect(blocks[failedBlock]).toMatchObject({ ok: false, status: 503 })
      for (const [key, block] of Object.entries(blocks)) if (key !== failedBlock) expect(block.ok).toBe(true)
    }
  )

  test('a read that is not available yet (501) fails its block as unavailable, never as an empty block', async () => {
    const { blocks } = await compose(fakeApi({ listGrades: 501 }))
    expect(blocks.yesterday_grades).toMatchObject({ ok: false, status: 501 })
  })

  test('a read that does not answer in time fails its block with no status; the others still land', async () => {
    const { blocks } = await compose(fakeApi({ listProjectSources: 'timeout' }), [project(1, bundle)], 20)
    expect(blocks.signal_health).toMatchObject({ ok: false, status: null })
    expect(blocks.needs_review.ok && blocks.windows_at_risk.ok).toBe(true)
  })

  test('a brand-new organisation reads nothing and every block is an honest n=0', async () => {
    const calls: Array<{ id: string; options: Options }> = []
    const { blocks, shown } = await compose(fakeApi({}, calls), [])
    expect(shown).toEqual([])
    expect(calls).toEqual([])
    for (const block of Object.values(blocks)) expect(block).toEqual({ ok: true, data: [], n: 0 })
  })

  test(`reads at most ${COMPOSED_PROJECT_CAP} projects: the reviewing ones, then the most recently active`, async () => {
    const older = {
      ...bundle,
      state: 'closed',
      needs_review_at: null,
      calls: [{ ...call, drafted_at: '2026-11-01T00:00:00.000Z' }]
    }
    const newer = { ...older, calls: [{ ...call, drafted_at: '2026-11-12T00:00:00.000Z' }] }
    const projects = [
      project(1),
      project(2, older),
      project(3, newer),
      project(4),
      project(5),
      project(6),
      project(7),
      project(8, bundle)
    ]
    expect(
      mostRecentlyActive(projects)
        .map((item) => item.slug)
        .slice(0, 3)
    ).toEqual(['project-8', 'project-3', 'project-2'])
    const calls: Array<{ id: string; options: Options }> = []
    const { shown } = await compose(fakeApi({}, calls), projects)
    expect(shown).toHaveLength(COMPOSED_PROJECT_CAP)
    expect(new Set(calls.map((item) => item.options.params?.id)).size).toBe(COMPOSED_PROJECT_CAP)
    // An archived project is never read.
    expect(mostRecentlyActive([{ ...project(9), archived_at: '2026-11-01T00:00:00.000Z' }])).toEqual([])
  })
})

describe('readDashboard', () => {
  /** Answers the dashboard's reads by path, as the API would; getDashboard answers `dashboardStatus`. */
  function serve(dashboardStatus: number) {
    const paths: string[] = []
    vi.stubGlobal('fetch', async (input: URL | string) => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      if (url.pathname === '/v1/dashboard')
        return dashboardStatus === 200
          ? json(200, {
              needs_review: { data: [], n: 0, next_action: null },
              windows_at_risk: { data: [], n: 0, next_action: null },
              signal_health: { data: [], n: 0, next_action: null },
              upcoming_risks: { data: [], n: 0, next_action: null },
              yesterday_grades: { data: [], n: 0, next_action: null }
            })
          : json(dashboardStatus, { title: 'Not built', status: dashboardStatus })
      if (url.pathname === '/v1/projects') return json(200, { data: [project(1)], next_cursor: null })
      const read = (Object.keys(answers) as ReadId[]).find((key) =>
        new RegExp(`^${dashboardOperations[key].path.replace('{id}', '[^/]+')}$`).test(url.pathname)
      )
      return read ? json(200, answers[read]) : json(404, { title: 'Not found' })
    })
    return paths
  }
  afterEach(() => vi.unstubAllGlobals())

  test('uses getDashboard when it answers, and composes nothing', async () => {
    const paths = serve(200)
    const read = await readDashboard(org)
    expect(read.windowsBasis).toBe('engine_verdict')
    expect(paths.filter((path) => path.startsWith('/v1/projects/'))).toEqual([])
  })

  test('composes the dashboard from the built reads when getDashboard is not built (501)', async () => {
    const paths = serve(501)
    const read = await readDashboard(org)
    expect(read.windowsBasis).toBe('latest_call')
    expect(read.covered).toBe(1)
    expect(read.needs_review).toMatchObject({ ok: true, n: 1 })
    expect(paths).toContain(`/v1/projects/${id(1)}/bundles`)
  })

  test('any other getDashboard failure fails the page, as before', async () => {
    serve(503)
    await expect(readDashboard(org)).rejects.toMatchObject({ status: 503 })
  })
})
