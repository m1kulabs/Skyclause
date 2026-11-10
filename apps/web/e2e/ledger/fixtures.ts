import type { Page, Principal, CallView } from '@skyclause/contracts'
import type { Page as BrowserPage } from '@playwright/test'
import { asPage } from '../harness/as-page'
import { stubApi } from '../harness/stub-api'
import { ledgerOperations, type LedgerRow, type Evidence } from '../../features/ledger/operations'
import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

const messages: Record<string, unknown> = Object.fromEntries(
  ['ledger', 'evidence'].map((feature) => [
    feature,
    JSON.parse(readFileSync(new URL(`../../../../packages/i18n/catalogue/en/${feature}.json`, import.meta.url), 'utf8'))
  ])
)
export const copy = (key: string, vars: Record<string, string | number> = {}) => {
  let value: unknown = messages
  for (const segment of key.split('.')) value = (value as Record<string, unknown>)[segment]
  if (typeof value !== 'string') throw new Error(`Missing test message: ${key}`)
  const text = value.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(text) : text
}
export const route = '/test-org/test-project/ledger'
export const project = {
  id: 'project-167',
  org_id: 'org-167',
  name: 'Test project',
  slug: 'test-project',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: '2026-12-31',
  site_name: 'Test site',
  site_lat: 3.1,
  site_lon: 101.7,
  archived_at: null,
  camera_day_start: '06:00',
  camera_day_end: '19:00',
  warning_area_terms: [],
  packs: []
}
export const principal = (role = 'approver'): Principal => ({
  kind: 'session',
  via: 'cookie',
  accountId: 'account-167',
  sessionId: 'session-167',
  isGuest: role === 'guest',
  staff: false,
  orgId: project.org_id,
  role: role as 'approver',
  authenticatedAt: new Date(),
  client: 'app',
  clientName: null
})
export const row: LedgerRow = {
  id: 'entry-1',
  project_id: project.id,
  seq: 1,
  kind: 'call_approved',
  refs: { call_id: 'call-1' },
  body: {},
  prev_hash: '0',
  hash: '1',
  at: '2026-11-02T06:00:00Z',
  pack: 'sky',
  approver_role: 'approver',
  call: null,
  window: null,
  grade: null
}
export const call: CallView = {
  id: 'call-1',
  bundle_id: 'bundle-1',
  window_id: 'window-1',
  night_id: null,
  mode: 'outdoor_limited',
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: 'Test decision from stored rain readings',
  state: 'sent',
  chosen: 'outdoor_limited',
  agrees: true,
  decision: null,
  expires_at: '2026-11-02T08:30:00Z',
  triggered_at: row.at,
  drafted_at: row.at,
  approved_at: '2026-11-02T06:02:00Z',
  sent_at: '2026-11-02T06:03:00Z',
  superseded_by_call_id: null,
  ics_uid: 'test-call',
  ics_sequence: 1,
  shadow: {
    scope: { kind: 'window', id: 'window-1' },
    pack: 'sky',
    mode: 'outdoor_limited',
    watch: false,
    no_call: null,
    recommendations: [],
    open_from: null,
    clauses: [
      {
        key: 'rain',
        result: 'fired',
        blocked_by: [],
        inputs: [
          {
            name: 'rain_5m',
            value: 8,
            unit: 'mm',
            state: 'fresh',
            since: null,
            age_s: 300,
            source_ids: ['gauge-1'],
            source_url: 'https://example.test/gauge',
            reading_ids: ['reading-1'],
            observed_at: '2026-11-02T05:55:00Z'
          }
        ]
      }
    ]
  }
}
export const detailedRow: LedgerRow = {
  ...row,
  call,
  window: {
    id: 'window-1',
    project_id: project.id,
    starts_at: row.at,
    ends_at: '2026-11-02T08:30:00Z',
    title: 'Postgraduate research colloquium — Fakulti Kejuruteraan dan Alam Bina',
    kind: 'event',
    tz: 'Asia/Kuala_Lumpur',
    declared_by: 'account-167',
    guest: false,
    via: 'app',
    expires_at: null,
    series_id: null,
    ics_feed_id: null,
    cancelled_at: null,
    share_link_id: null,
    moderation: 'visible'
  },
  grade: {
    id: 'grade-1',
    call_id: call.id,
    night_id: null,
    outcome: 'hit',
    sheet_version_id: 'sheet-1',
    pack: 'sky',
    window_id: 'window-1',
    proposed_mode: 'outdoor_limited',
    observed_mode: 'outdoor_limited',
    mode_diff: 0,
    no_call: false,
    agrees: true,
    stale_inputs: false
  }
}
export const evidence: Evidence = {
  id: 'evidence-1',
  project_id: project.id,
  span: { from: '2026-11-02T06:00:00Z', to: '2026-11-02T08:30:00Z' },
  requester: 'reviewer-1',
  call_id: 'call-1',
  via: 'mcp',
  leaves_org: true,
  reply_channel: 'email',
  status: 'drafted',
  received_at: '2026-11-02T06:00:00Z',
  drafted_at: '2026-11-02T06:01:00Z',
  approved_at: null,
  replied_at: null,
  pack: {
    project_id: project.id,
    window_id: null,
    readings: [
      {
        id: 'reading-1',
        source_id: 'gauge-1',
        poll_id: 'poll-1',
        metric: 'rain_5m',
        unit: 'mm',
        observed_at: '2026-11-02T05:55:00Z',
        received_at: '2026-11-02T06:00:00Z',
        value: 8,
        value_text: null,
        value_json: null,
        device_time: null,
        item_key: null,
        revision: '1',
        station_id: 'station-1',
        source_url: 'https://example.test/gauge'
      }
    ],
    warnings: [
      {
        reading_id: 'reading-1',
        text: 'Amaran Ribut Petir',
        gloss: 'Thunderstorms Warning',
        valid_from: '2026-11-02T06:00:00Z',
        valid_to: '2026-11-02T08:00:00Z'
      }
    ],
    calls: [],
    approvals: [],
    grades: [],
    ledger: [],
    frames: [{ reading_id: 'reading-1', url: 'https://example.test/frame.jpg', captured_at: '2026-11-02T05:55:00Z' }]
  }
}
export async function setup(
  page: BrowserPage,
  options: {
    rows?: LedgerRow[]
    total?: number
    role?: string
    as?: Principal
    request?: Evidence
    files?: unknown[]
  } = {}
) {
  await asPage(page, options.as ?? principal(options.role))
  await stubApi(page, 'listProjects', { data: [project], next_cursor: null }, { registry: ledgerOperations })
  await stubApi(
    page,
    'listLedgerEntries',
    { data: options.rows ?? [row], next_cursor: null, total: options.total ?? options.rows?.length ?? 1 },
    { registry: ledgerOperations }
  )
  await stubApi(
    page,
    'verifyLedger',
    { valid: true, checked_entries: 1, first_bad_entry_id: null, head_hash: 'hash', verified_at: row.at },
    { registry: ledgerOperations }
  )
  await stubApi(
    page,
    'getPilotArchive',
    { data: options.files ?? [], next_cursor: null },
    { registry: ledgerOperations }
  )
  const request = options.request ?? evidence
  const summaries: Page<typeof request> = { data: [request], next_cursor: null }
  await stubApi(page, 'listEvidenceRequests', summaries, { registry: ledgerOperations })
  await stubApi(page, 'getEvidenceRequest', request, { registry: ledgerOperations })
  await stubApi(page, 'createEvidenceRequest', request, { registry: ledgerOperations })
}
