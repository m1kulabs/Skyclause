import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Bundle, Principal, Role } from '@skyclause/contracts'
import { bundleOperations, type BundleView, type CallDetail } from '../../features/bundles/operations'
import { stubApi, asPage } from '../harness'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

const english: unknown = JSON.parse(
  readFileSync(new URL('../../../../packages/i18n/catalogue/en/bundles.json', import.meta.url), 'utf8')
)
const capture: { data: Array<{ timestamp: string; rf: number }> } = JSON.parse(
  readFileSync(
    new URL(
      '../../../../docs/sources/infobanjirjpskl.water.gov.my/rainfall-graph-75-20261105T1312Z.json',
      import.meta.url
    ),
    'utf8'
  )
)

export const rawT = (key: string, vars: Record<string, string | number> = {}): string => {
  let value: unknown = english
  for (const part of key.replace(/^bundles\./, '').split('.')) value = (value as Record<string, unknown>)[part]
  if (typeof value !== 'string') throw new Error(`Missing bundle test message: ${key}`)
  return value.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(vars[name] ?? placeholder))
}
export const t = (key: string, vars: Record<string, string | number> = {}) => {
  const value = rawT(key, vars)
  return process.env.I18N_PSEUDO === '1' ? pseudo(value) : value
}
export const ids = {
  bundle: '019a45b0-0000-7000-8000-000000000001',
  run: '019a45b0-0000-7000-8000-000000000002',
  project: '019a45b0-0000-7000-8000-000000000003',
  first: '019a45b0-0000-7000-8000-000000000004',
  second: '019a45b0-0000-7000-8000-000000000005'
}
export const path = `/test-org/test-project/bundles/${ids.bundle}`
export const now = new Date('2026-11-02T07:07:00Z')
// Measured rainfall only: named JPS station 75 capture, 2 November 2026 (14:00, 15:00] MYT.
// All bundle/call/session/recipient records below are HTTP test doubles, never application data.
export const rain60 = capture.data
  .filter((row) => row.timestamp > '2026-11-02T14:00:00' && row.timestamp <= '2026-11-02T15:00:00')
  .reduce((sum, row) => sum + row.rf, 0)
const stripRows = capture.data.filter(
  (row) => row.timestamp >= '2026-11-02T14:00:00' && row.timestamp <= '2026-11-02T16:00:00'
)
const stripSeries = {
  'site.rain_5m_mm': stripRows.map((row) => [new Date(`${row.timestamp}+08:00`).toISOString(), row.rf, 'received']),
  'site.rain_60m_mm': stripRows.map((row) => {
    const at = new Date(`${row.timestamp}+08:00`).getTime()
    const value = capture.data
      .filter((sample) => {
        const sampleAt = new Date(`${sample.timestamp}+08:00`).getTime()
        return sampleAt > at - 60 * 60_000 && sampleAt <= at
      })
      .reduce((sum, sample) => sum + sample.rf, 0)
    return [new Date(at).toISOString(), Math.round(value * 10) / 10, 'received']
  })
}
export const gauge = {
  name: 'gauge',
  value: rain60,
  unit: 'mm / 60 min',
  state: 'fresh' as const,
  since: null,
  age_s: 300,
  source_ids: ['0232901RF'],
  source_url: 'https://infobanjirjpskl.water.gov.my/',
  reading_ids: ['replay-20261102-1500'],
  observed_at: '2026-11-02T07:00:00Z'
}

export function callDouble(id = ids.first, patch: Partial<CallDetail> = {}): CallDetail {
  return {
    id,
    call_id: id,
    project_id: ids.project,
    bundle_id: ids.bundle,
    window_id: `window-${id}`,
    night_id: null,
    window: {
      id: `window-${id}`,
      project_id: ids.project,
      starts_at: '2026-11-02T07:30:00Z',
      ends_at: '2026-11-02T07:45:00Z',
      title: `Replay · 2 November 2026 · ${id === ids.first ? 'first' : 'second'} release wave`,
      kind: 'commute_wave',
      tz: 'Asia/Kuala_Lumpur',
      declared_by: 'test-account',
      guest: false,
      via: 'app',
      expires_at: null,
      series_id: null,
      ics_feed_id: null,
      cancelled_at: null,
      share_link_id: null,
      moderation: 'visible'
    },
    night: null,
    mode: 'commute_disruption',
    watch: false,
    no_call: null,
    fired: [{ clause: 'storm_confirmed', inputs: ['gauge'] }],
    recommendations: [],
    recipients: ['english-recipient@example.test', 'malay-recipient@example.test'],
    notices: [
      {
        language: 'en',
        subject: 'Replay · Commute disruption',
        body: `Replay · 2 November 2026: Storm confirmed, gauge ${rain60.toFixed(1)} mm in 60 min to 15:00 MYT (Lebat).`
      },
      {
        language: 'ms',
        subject: 'Ulangan · Gangguan perjalanan',
        body: 'Ulangan · 2 November 2026: Ribut disahkan. Bacaan tolok 39.0 mm dalam 60 minit hingga 15:00 MYT (Lebat).'
      }
    ],
    reason: 'Replay · Commute disruption: Storm confirmed, gauge 39.0 mm in 60 min to 15:00 MYT (Lebat)',
    state: 'drafted',
    shadow: {
      scope: { kind: 'window', id: `window-${id}` },
      pack: 'sky',
      mode: 'normal',
      watch: false,
      no_call: null,
      recommendations: [],
      clauses: [],
      open_from: null
    },
    chosen: 'agent',
    agrees: true,
    decision: null,
    expires_at: '2026-11-02T07:45:00Z',
    triggered_at: '2026-11-02T07:05:00Z',
    drafted_at: '2026-11-02T07:06:00Z',
    approved_at: null,
    sent_at: null,
    superseded_by_call_id: null,
    ics_uid: `test-${id}`,
    ics_sequence: 0,
    sheet_version_id: 'test-sheet',
    clauses: [
      {
        key: 'storm_confirmed',
        result: 'fired',
        blocked_by: [],
        inputs: [gauge],
        cel: 'rain_60m >= 31',
        wording: { en: 'Storm confirmed', ms: 'Ribut disahkan' }
      }
    ],
    inputs: [gauge],
    warnings: [],
    trace: [
      {
        step: 'Read inputs',
        duration_ms: 12,
        inputs: [gauge],
        detail: 'Replay · gauge 39.0 mm in 60 min at the 15:05 MYT poll.'
      }
    ],
    approved_by: null,
    grade: null,
    permalink: `https://skyclause.m1ku.tech/c/${id}`,
    deliveries: [
      { recipient_id: 'english-recipient@example.test', language: 'en', status: 'queued', accepted_at: null },
      { recipient_id: 'malay-recipient@example.test', language: 'ms', status: 'queued', accepted_at: null }
    ],
    ...patch
  }
}

export function bundleDouble(
  calls = [callDouble(), callDouble(ids.second, { agrees: false })],
  patch: Partial<BundleView> = {}
): BundleView {
  return {
    id: ids.bundle,
    project_id: ids.project,
    run_id: ids.run,
    pack: 'sky',
    state: 'needs_review',
    superseded_by: null,
    review_hash: 'test-review-one',
    sla_due_at: '2026-11-02T07:15:00Z',
    needs_review_at: '2026-11-02T07:06:00Z',
    approved_by: null,
    escalation_level: 0,
    draft_only: false,
    calls,
    trigger: 'crossing',
    triggered_at: '2026-11-02T07:05:00Z',
    sheet_version_id: 'test-sheet',
    alerts: [],
    ...patch
  }
}

export const preferences = {
  theme: 'dark',
  high_contrast: false,
  density: 'comfortable',
  reduced_motion: false,
  language: 'en',
  shortcuts: true
}

export async function prepare(
  page: Page,
  bundle = bundleDouble(),
  options: { role?: Role; guest?: boolean; shortcuts?: boolean; clock?: boolean } = {}
) {
  const role = options.role ?? 'approver'
  const principal: Principal = {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date(now.getTime() - 13 * 3600000),
    orgId: 'test-org-id',
    role,
    isGuest: options.guest ?? false,
    staff: false
  }
  await asPage(page, principal)
  if (options.clock !== false) await page.clock.setFixedTime(now)
  await stubApi(page, 'getBundle', bundle, { registry: bundleOperations })
  await stubApi(
    page,
    'getMyPreferences',
    { ...preferences, shortcuts: options.shortcuts ?? true },
    { registry: bundleOperations }
  )
  await stubApi(
    page,
    'listMyMemberships',
    {
      data: options.guest
        ? []
        : [
            {
              id: 'test-membership',
              org_id: 'test-org-id',
              account_id: 'test-account',
              role,
              reads_malay: true,
              org_name: 'Test organisation',
              org_slug: 'test-org'
            }
          ],
      next_cursor: null
    },
    { registry: bundleOperations }
  )
  await stubApi(
    page,
    'getRun',
    {
      id: ids.run,
      project_id: ids.project,
      pack: 'sky',
      trigger: 'crossing',
      dedupe_key: 'test-run',
      sheet_version_id: 'test-sheet',
      snapshot_id: 'test-snapshot',
      model: null,
      fallback_used: false,
      status: 'drafted',
      reason: null,
      trigger_ref: 'replay-20261102-1500',
      window_ids: [],
      verdict_hash: 'test-verdict'
    },
    { registry: bundleOperations }
  )
  await stubApi(
    page,
    'getProjectStrip',
    {
      project_id: ids.project,
      range: { from: '2026-11-02T06:00:00Z', to: '2026-11-02T08:00:00Z' },
      window: null,
      series: stripSeries,
      inputs: [gauge],
      packs: [],
      verdicts: [],
      nights: []
    },
    { registry: bundleOperations }
  )
  for (const call of bundle.calls) {
    const detail = callDouble(call.id, call)
    await stubApi(page, 'getCall', detail, {
      registry: { ...bundleOperations, getCall: { ...bundleOperations.getCall, path: `/v1/calls/${call.id}` } }
    })
    await stubApi(page, 'getCallExplanation', detail, {
      registry: {
        ...bundleOperations,
        getCallExplanation: { ...bundleOperations.getCallExplanation, path: `/v1/calls/${call.id}/explanation` }
      }
    })
  }
  await page.route('**/v1/projects/*/bundles/stream', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' })
  )
  await stubApi(page, 'approveBundle', { ...bundle, state: 'approved', approved_by: 'test-account' } satisfies Bundle, {
    registry: bundleOperations
  })
  return bundle
}

export async function open(page: Page) {
  await page.goto(path)
  await page.locator('.bundle-call-list, .bundle-trace').first().waitFor()
}

export function problem(code: string, status: number, extensions: Record<string, unknown> = {}) {
  return {
    type: `https://skyclause.m1ku.tech/problems/${code}`,
    title: code,
    status,
    detail: 'Test server reason',
    instance: path,
    ...extensions
  }
}
