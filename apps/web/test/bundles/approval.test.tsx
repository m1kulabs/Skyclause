import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { BundleDetail } from '../../features/bundles/bundle-detail'
import type { BundleView, CallDetail } from '../../features/bundles/operations'

vi.mock('next/navigation', () => ({
  useParams: () => ({ org: 'test-org', project: 'test-project' }),
  useRouter: () => ({ push: vi.fn() })
}))

// HTTP test doubles of getBundle and getCall, never application data.
const call: CallDetail = {
  id: 'test-call',
  call_id: 'test-call',
  bundle_id: 'test-bundle',
  project_id: 'test-project',
  trace_id: 'test-run',
  window_id: 'test-window',
  window: {
    id: 'test-window',
    project_id: 'test-project',
    starts_at: '2026-11-02T07:30:00Z',
    ends_at: '2026-11-02T07:45:00Z',
    title: 'Test release wave',
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
  night_id: null,
  night: null,
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: ['test-recipient-1', 'test-recipient-2'],
  notices: [{ language: 'en', subject: 'Test subject', body: 'Test wording' }],
  reason: '',
  state: 'drafted',
  shadow: {
    scope: { kind: 'window', id: 'test-window' },
    pack: 'sky',
    mode: 'commute_disruption',
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
  ics_uid: null,
  ics_sequence: 0,
  sheet_version_id: 'test-sheet',
  clauses: [],
  inputs: [],
  warnings: [],
  trace: [],
  approved_by: null,
  grade: null,
  permalink: 'https://skyclause.m1ku.tech/c/test-call',
  deliveries: []
}
const bundle: BundleView = {
  id: 'test-bundle',
  project_id: 'test-project',
  run_id: 'test-run',
  pack: 'sky',
  state: 'needs_review',
  superseded_by: null,
  review_hash: 'test-review',
  sla_due_at: '2026-11-02T07:15:00Z',
  needs_review_at: '2026-11-02T07:06:00Z',
  approved_by: null,
  escalation_level: 0,
  draft_only: false,
  calls: [call],
  trigger: 'crossing',
  triggered_at: '2026-11-02T07:05:00Z',
  sheet_version_id: 'test-sheet',
  alerts: [{ account_id: 'test-account-must-not-render', notified_at: '2026-11-02T07:06:00Z', level: 'on_duty' }]
}
const now = Date.parse('2026-11-02T07:07:00Z')
const render = (props: Partial<React.ComponentProps<typeof BundleDetail>> = {}) =>
  renderToStaticMarkup(
    <BundleDetail
      bundleId="test-bundle"
      initial={{ data: { bundle, calls: [call], shortcuts: true, canApprove: true, errors: [] }, now }}
      {...props}
    />
  )

test('P1-1: no step asks to select a call; each call says it is included, and Approve says what it sends', () => {
  const html = render()
  expect(html).not.toContain('Select this call')
  expect(html).toContain('Included in approval')
  expect(html).toContain('Approve 1 call<')
  expect(html).toContain('Sends 1 notice to 2 recipients')
  // The bundle's Approve carries no key hint; E and R are named once, in a quiet line.
  expect(html).not.toContain('<kbd')
  expect(html).toContain('press E to edit it or R to reject or restore it')
  expect(html).toContain('aria-keyshortcuts="e r"')
  // One Approve on every width: no drawer, no "Review decisions".
  expect(html).not.toContain('Review decisions')
  expect(html).not.toContain('drawer')
})

test('an escalation names who was told, never an account ID', () => {
  const html = render()
  expect(html).toContain('The approver on duty notified at 15:06 MYT')
  expect(html).not.toContain('test-account-must-not-render')
})

test('P2-5: an approved bundle says what it sent, when, and links the ledger and the next waiting bundle', () => {
  const approved = { ...call, state: 'sending' as const, approved_at: '2026-11-02T07:08:00Z' }
  const waiting: BundleView = { ...bundle, id: 'next-bundle', calls: [], sla_due_at: '2026-11-02T07:20:00Z' }
  const html = render({
    initial: {
      data: {
        bundle: { ...bundle, state: 'approved', calls: [approved] },
        calls: [approved],
        shortcuts: true,
        canApprove: true,
        errors: []
      },
      now,
      list: { status: 'ready', rows: [{ ...bundle, state: 'approved' }, waiting], more: false }
    }
  })
  expect(html).toContain('Approved at 15:08 MYT')
  expect(html).toContain('Sending 1 notice to 2 recipients.')
  expect(html).toContain('href="/test-org/test-project/ledger?call=test-call"')
  expect(html).toContain('See it in the ledger')
  expect(html).toContain('href="/test-org/test-project/bundles/next-bundle"')
  expect(html).toContain('Next waiting bundle')
  expect(html).not.toContain('bundle-approval-bar')
})

test('P2-5: with nothing else waiting, the approved bundle says so', () => {
  const sent = {
    ...call,
    state: 'sent' as const,
    approved_at: '2026-11-02T07:08:00Z',
    sent_at: '2026-11-02T07:09:00Z'
  }
  const html = render({
    initial: {
      data: {
        bundle: { ...bundle, state: 'sent', calls: [sent] },
        calls: [sent],
        shortcuts: true,
        canApprove: true,
        errors: []
      },
      now,
      list: { status: 'ready', rows: [{ ...bundle, state: 'sent' }], more: false }
    }
  })
  expect(html).toContain('Sent 1 notice to 2 recipients at 15:09 MYT.')
  expect(html).toContain('No other bundle is waiting in this project.')
})

test('the review speaks the request’s language', () => {
  const html = render({ locale: 'ms' })
  expect(html).toContain('lang="ms"')
  expect(html).toContain('Luluskan 1 panggilan')
  expect(html).toContain('Menghantar 1 notis kepada 2 penerima')
  expect(html).toContain('Termasuk dalam kelulusan')
})
