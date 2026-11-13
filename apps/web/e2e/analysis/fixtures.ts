import type { Page } from '@playwright/test'
import type { DraftSheetVersion, Principal, PublishedSheetVersion, Role, SheetContent } from '@skyclause/contracts'
import { analysisOperations as registry, type Analysis, type Metric } from '../../features/analysis/operations'
import { asPage, stubApi } from '../harness'
import en from '../../../../packages/i18n/catalogue/en/analysis.json' with { type: 'json' }
import ms from '../../../../packages/i18n/catalogue/ms/analysis.json' with { type: 'json' }
import { pseudo } from '../../../../packages/i18n/src/pseudo'

// Schema-validated doubles. These records never enter production bundles.
export const projectId = '019a55e0-0000-7000-8000-000000000001'
export const sheetId = '019a55e0-0000-7000-8000-000000000002'
export const versionId = '019a55e0-0000-7000-8000-000000000003'
export const draftId = '019a55e0-0000-7000-8000-000000000004'
export const projectRoute = '/test-org/test-project/analysis'
export const orgRoute = '/test-org/analysis'
export const from = '2026-11-01'
export const to = '2026-11-04'
export const at = '2026-11-04T00:00:00Z'
export const copy = (key: keyof typeof en, locale: 'en' | 'ms' = 'en') => {
  const value = (locale === 'ms' ? ms : en)[key]
  if (typeof value !== 'string') throw new Error(`Expected a message at ${key}`)
  return process.env.I18N_PSEUDO === '1' ? pseudo(value) : value
}
export const tabName = (key: keyof typeof en.tabs, locale: 'en' | 'ms' = 'en') => {
  const value = (locale === 'ms' ? ms : en).tabs[key]
  return process.env.I18N_PSEUDO === '1' ? pseudo(value) : value
}
export function metric(name = 'precision', pack: 'sky' | 'crowd' = 'sky', n = 8): Metric {
  return { metric: name, pack, clause_key: null, x: n ? 7 : null, n, low: n ? 0.53 : null, high: n ? 0.98 : null }
}
export const grade = {
  id: 'grade-live',
  call_id: null,
  night_id: null,
  outcome: 'miss',
  sheet_version_id: versionId,
  pack: 'sky',
  window_id: 'window-no-call',
  proposed_mode: null,
  observed_mode: 'commute_disruption',
  mode_diff: 2,
  no_call: true,
  agrees: false,
  stale_inputs: false
} as const
export const review = {
  id: 'review-one',
  grade_id: grade.id,
  state: 'open',
  explanation: 'Awaiting explanation',
  grade
}
export const detailedGrade = { ...grade, forecast: null, actual: null, reading_ids: ['reading-live'], graded_at: at }
const sheetContent: SheetContent = { pack: 'sky', clauses: [] }
// Publication runs the check first, so a published version always carries a passing one.
const check = { ok: true, publishable: true, issues: [] }
export const version: PublishedSheetVersion = {
  id: versionId,
  status: 'published',
  n: 3,
  content: sheetContent,
  content_hash: 'test-hash',
  published_by: 'account-one',
  base_n: 2,
  published_at: at,
  check,
  publishable: true,
  validation_status: 'checked'
}
// A saved draft has no number yet and is based on the live version.
export const draft: DraftSheetVersion = {
  ...version,
  id: draftId,
  status: 'draft',
  n: null,
  base_n: 3,
  published_by: null,
  published_at: null
}
export const replay = {
  label: 'replay',
  steps: [
    {
      t_eval: '2026-11-02T07:00:00Z',
      verdicts: {
        t_eval: '2026-11-02T07:00:00Z',
        pack: 'sky',
        content_hash: 'test-hash',
        snapshot_hash: 'test-capture',
        hash: 'test-verdict',
        windows: [],
        nights: [],
        site: [
          {
            scope: { kind: 'site', id: null },
            pack: 'sky',
            mode: 'commute_disruption',
            watch: false,
            no_call: null,
            recommendations: [],
            clauses: [{ key: 'test-storm', result: 'fired', blocked_by: [], inputs: [] }],
            open_from: null
          }
        ]
      }
    }
  ],
  summary: { steps: 1 },
  metrics: [metric()]
}
replay.steps.push({ ...replay.steps[0]!, t_eval: '2026-11-03T07:00:00Z' })
export function analysis(pack: 'sky' | 'crowd' = 'sky', empty = false): Analysis {
  const names = ['precision', 'recall', 'false_alarm_ratio', 'agreement', 'band_coverage']
  const metrics = names.map((name) => metric(name, pack, empty ? 0 : 8))
  metrics.push({
    ...metric('crossing_to_approved_p50', pack, empty ? 0 : 8),
    x: null,
    value: empty ? null : 12,
    low: null,
    high: null
  })
  metrics.push({ ...metric('precision', pack, empty ? 0 : 8), clause_key: 'test-storm' })
  return {
    from,
    to,
    updated_at: at,
    metrics,
    series: empty ? [] : [0, 1, 2, 3].map((day) => ({ at: `2026-11-0${day + 1}T00:00:00Z`, metrics })),
    grades: { data: empty ? [] : [grade], next_cursor: null },
    kill_line_exceeded: false
  }
}
export async function setup(page: Page, options: { role?: Role; empty?: boolean; crowd?: boolean } = {}) {
  const role = options.role ?? 'approver'
  const principal: Principal = {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'account-one',
    sessionId: 'test-session',
    authenticatedAt: new Date(at),
    orgId: 'org-one',
    role,
    isGuest: false,
    staff: false
  }
  await asPage(page, principal)
  const membership = {
    id: 'membership-one',
    org_id: 'org-one',
    account_id: 'account-one',
    role,
    reads_malay: true,
    org_name: 'Test organisation',
    org_slug: 'test-org'
  }
  const project = {
    id: projectId,
    org_id: 'org-one',
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
    // The page offers and reads Crowd only where the project runs it.
    packs: [
      { pack: 'sky' as const, enabled: true, sheet_id: sheetId, schedule: null, sla_s: 600 },
      { pack: 'crowd' as const, enabled: options.crowd !== false, sheet_id: null, schedule: null, sla_s: 7200 }
    ]
  }
  await stubApi(page, 'listMyMemberships', { data: [membership], next_cursor: null }, { registry })
  await stubApi(page, 'listProjects', { data: [project], next_cursor: null }, { registry })
  for (const operation of ['getProjectAnalysis', 'getOrganisationAnalysis'] as const) {
    // Validate both packs with the same registry schema used by apiFetch.
    const sky = registry[operation].response.parse(analysis('sky', options.empty))
    const crowd = registry[operation].response.parse(analysis('crowd', options.empty))
    await page.route(new RegExp(`${registry[operation].path.replace('{id}', '[^/]+')}\\?`), async (route) => {
      if (new URL(route.request().url()).searchParams.get('pack') === 'crowd') {
        if (options.crowd === false)
          await route.fulfill({
            status: 403,
            json: { type: 'https://skyclause.test/problems/feature-off', title: 'Feature off', status: 403 }
          })
        else await route.fulfill({ json: crowd })
      } else await route.fulfill({ json: sky })
    })
  }
  await stubApi(page, 'listGrades', { data: options.empty ? [] : [detailedGrade], next_cursor: null }, { registry })
  await stubApi(page, 'listReviewItems', { data: options.empty ? [] : [review], next_cursor: null }, { registry })
  await stubApi(
    page,
    'listClauseSheets',
    { data: [{ id: sheetId, project_id: projectId, pack: 'sky', live_version_id: versionId }], next_cursor: null },
    { registry }
  )
  await stubApi(page, 'listClauseSheetVersions', { data: [version], next_cursor: null }, { registry })
  await stubApi(page, 'listClauseSheetDrafts', { data: [draft], next_cursor: null }, { registry })
  await stubApi(page, 'evaluateWhatIf', replay, { registry })
  await stubApi(page, 'updateReviewItem', { ...review, explanation: 'Explained by the approver' }, { registry })
  await stubApi(page, 'listNights', { data: [], next_cursor: null }, { registry })
  await stubApi(page, 'listProjectListings', { data: [], next_cursor: null }, { registry })
}
export const replayQuery = `sheet=${sheetId}&version=${versionId}&from=${from}&to=${to}&step=reading`
