import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { BundleDetail } from '../../features/bundles/bundle-detail'
import type { BundleView, CallDetail } from '../../features/bundles/operations'
import { useBundleReview } from '../../features/bundles/use-bundle-review'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'test-org', project: 'test-project' }) }))
vi.mock('../../features/bundles/use-bundle-review', async (original) => {
  const actual = await original<typeof import('../../features/bundles/use-bundle-review')>()
  return { ...actual, useBundleReview: vi.fn(actual.useBundleReview) }
})

test('bundle detail starts with a named loading state, without inventing calls', () => {
  const html = renderToStaticMarkup(<BundleDetail bundleId="test-bundle" />)
  expect(html).toContain('Loading bundle')
  expect(html).not.toContain('data-unbuilt="c-bundle-ui"')
  expect(html).not.toContain('Approve')
})

test('a closed bundle has no SLA, so the page shows no due time', () => {
  // An HTTP test double of getBundle's answer for a closed bundle, never application data.
  const bundle: BundleView = {
    id: 'test-bundle',
    project_id: 'test-project',
    run_id: 'test-run',
    pack: 'sky',
    state: 'closed',
    superseded_by: null,
    review_hash: 'test-review',
    sla_due_at: null,
    needs_review_at: null,
    approved_by: null,
    escalation_level: 0,
    draft_only: false,
    calls: [],
    trigger: 'schedule',
    triggered_at: '2026-11-02T06:45:00Z',
    sheet_version_id: null,
    alerts: []
  }
  vi.mocked(useBundleReview).mockReturnValueOnce({
    data: { bundle, calls: [], shortcuts: false, canApprove: true, errors: [] },
    now: Date.parse('2026-11-02T06:46:00Z'),
    decisions: {},
    editable: false,
    pending: false
  } as unknown as ReturnType<typeof useBundleReview>)
  const html = renderToStaticMarkup(<BundleDetail bundleId="test-bundle" />)
  expect(html).toContain('14:45')
  expect(html).not.toContain('SLA')
})

test('#372 with the server’s read, the first render is the review at the server’s instant, not the loading state', () => {
  // HTTP test doubles of getBundle and getCall for one drafted call, never application data.
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
    recipients: [],
    notices: [],
    reason: '',
    state: 'drafted',
    shadow: {
      scope: { kind: 'window', id: 'test-window' },
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
    alerts: []
  }
  // The call expires 38 minutes after the server rendered, long before this test runs: hydration must see it open too.
  const html = renderToStaticMarkup(
    <BundleDetail
      bundleId="test-bundle"
      initial={{
        data: { bundle, calls: [call], shortcuts: true, canApprove: true, errors: [] },
        now: Date.parse('2026-11-02T07:07:00Z')
      }}
    />
  )
  expect(html).not.toContain('Loading bundle')
  expect(html).toContain('Test release wave')
  expect(html).toContain('Approve 1')
  expect(html).not.toContain('Expired, not sent')
})
