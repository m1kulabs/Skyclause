import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { BundleDetail } from '../../features/bundles/bundle-detail'
import type { BundleView } from '../../features/bundles/operations'
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
